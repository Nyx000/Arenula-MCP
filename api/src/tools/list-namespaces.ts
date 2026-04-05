import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { SearchIndexes } from '../data/indexer.js'

export function registerListNamespaces(server: McpServer, indexes: SearchIndexes) {
  server.registerTool(
    'list_namespaces',
    {
      title: 'List S&box Namespaces',
      description:
        'List all S&box API namespaces with type counts. Useful for discovering API areas.',
      inputSchema: {
        filter: z.string().optional().describe("Filter namespace names (e.g., 'UI', 'Audio')"),
      },
    },
    async ({ filter }) => {
      let entries = Array.from(indexes.namespaceMap.entries())
        .map(([ns, types]) => {
          const groups = { classes: 0, structs: 0, enums: 0, interfaces: 0 }
          for (const t of types) {
            if (t.Group === 'class') groups.classes++
            else if (t.Group === 'struct') groups.structs++
            else if (t.Group === 'enum') groups.enums++
            else if (t.Group === 'interface') groups.interfaces++
          }
          return { namespace: ns, count: types.length, groups }
        })
        .sort((a, b) => b.count - a.count)

      if (filter) {
        const f = filter.toLowerCase()
        entries = entries.filter(e => e.namespace.toLowerCase().includes(f))
      }

      const lines = entries.map(e => {
        const parts: string[] = []
        if (e.groups.classes) parts.push(`${e.groups.classes} classes`)
        if (e.groups.structs) parts.push(`${e.groups.structs} structs`)
        if (e.groups.enums) parts.push(`${e.groups.enums} enums`)
        if (e.groups.interfaces) parts.push(`${e.groups.interfaces} interfaces`)
        return `**${e.namespace}** (${e.count}) — ${parts.join(', ')}`
      })

      return {
        content: [
          {
            type: 'text',
            text: `${entries.length} namespaces:\n\n${lines.join('\n')}`,
          },
        ],
      }
    }
  )
}
