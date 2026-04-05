import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { SearchIndexes } from '../data/indexer.js'

export function registerSearchTypes(server: McpServer, indexes: SearchIndexes) {
  server.registerTool(
    'search_types',
    {
      title: 'Search S&box Types',
      description:
        'Search S&box API types (classes, structs, enums, interfaces) by name. Returns matching types with namespace, group, base type, and summary.',
      inputSchema: {
        query: z.string().describe("Type name to search for (e.g., 'GameObject', 'Vector3', 'PhysicsBody')"),
        group: z
          .enum(['class', 'struct', 'enum', 'interface'])
          .optional()
          .describe('Filter by type group'),
        assembly: z.string().optional().describe("Filter by assembly (e.g., 'Sandbox.Engine')"),
        limit: z.number().min(1).max(50).default(10).describe('Max results'),
      },
    },
    async ({ query, group, assembly }) => {
      let results = indexes.typeFuse.search(query, { limit: 50 })

      if (group) {
        results = results.filter(r => r.item.Group === group)
      }
      if (assembly) {
        results = results.filter(r => r.item.Assembly === assembly)
      }

      const limit = 10
      const items = results.slice(0, limit).map(r => {
        const t = r.item
        const methodCount = t.Methods?.length || 0
        const propCount = t.Properties?.length || 0
        const fieldCount = t.Fields?.length || 0
        return [
          `**${t.FullName}** (${t.Group})`,
          `  Assembly: ${t.Assembly}`,
          t.BaseType ? `  Base: ${t.BaseType}` : null,
          t.Documentation?.Summary ? `  Summary: ${t.Documentation.Summary}` : null,
          `  Members: ${methodCount} methods, ${propCount} properties, ${fieldCount} fields`,
        ]
          .filter(Boolean)
          .join('\n')
      })

      if (items.length === 0) {
        return { content: [{ type: 'text', text: `No types found matching "${query}"` }] }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${results.length} types matching "${query}" (showing ${items.length}):\n\n${items.join('\n\n')}`,
          },
        ],
      }
    }
  )
}
