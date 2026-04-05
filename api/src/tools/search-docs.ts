import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { SearchIndexes } from '../data/indexer.js'

export function registerSearchDocs(server: McpServer, indexes: SearchIndexes) {
  server.registerTool(
    'search_docs',
    {
      title: 'Search S&box Documentation',
      description:
        "Full-text search across all S&box API documentation summaries. Find types and members by what they do. Example: 'play sound', 'physics collision', 'render texture'.",
      inputSchema: {
        query: z.string().describe('Natural language search query'),
        limit: z.number().min(1).max(20).default(10).describe('Max results'),
      },
    },
    async ({ query, limit }) => {
      const results = indexes.docFuse.search(query, { limit })

      const items = results.map(r => {
        const d = r.item
        const parent = d.parentType ? ` (in ${d.parentType})` : ''
        return `[${d.kind}] **${d.fullName}**${parent}\n  ${d.summary}`
      })

      if (items.length === 0) {
        return { content: [{ type: 'text', text: `No documentation found matching "${query}"` }] }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${results.length} results for "${query}":\n\n${items.join('\n\n')}`,
          },
        ],
      }
    }
  )
}
