import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { SearchIndexes } from '../data/indexer.js'

export function registerSearchMembers(server: McpServer, indexes: SearchIndexes) {
  server.registerTool(
    'search_members',
    {
      title: 'Search S&box Members',
      description:
        'Search for methods, properties, or fields across all S&box API types. Useful when you know a member name but not which type it belongs to.',
      inputSchema: {
        query: z.string().describe("Member name to search (e.g., 'GetComponent', 'Position', 'Velocity')"),
        kind: z
          .enum(['method', 'property', 'field', 'all'])
          .default('all')
          .describe('Kind of member to search'),
        returnType: z.string().optional().describe("Filter by return/property type (e.g., 'Vector3')"),
        limit: z.number().min(1).max(30).default(10).describe('Max results'),
      },
    },
    async ({ query, kind, returnType, limit }) => {
      let results = indexes.memberFuse.search(query, { limit: 50 })

      if (kind !== 'all') {
        results = results.filter(r => r.item.kind === kind)
      }
      if (returnType) {
        const rt = returnType.toLowerCase()
        results = results.filter(r => r.item.returnType.toLowerCase().includes(rt))
      }

      const items = results.slice(0, limit).map(r => {
        const m = r.item
        const sig = m.signature || `${m.name}: ${m.returnType}`
        const doc = m.summary ? ` — ${m.summary}` : ''
        return `[${m.kind}] **${m.declaringType}**.${sig}${doc}`
      })

      if (items.length === 0) {
        return { content: [{ type: 'text', text: `No members found matching "${query}"` }] }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${results.length} members matching "${query}" (showing ${items.length}):\n\n${items.join('\n')}`,
          },
        ],
      }
    }
  )
}
