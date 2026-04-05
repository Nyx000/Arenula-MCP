import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { SearchIndexes } from '../data/indexer.js'
import { updateApiSource } from '../data/loader.js'
import { buildIndexes } from '../data/indexer.js'

export function registerUpdateSource(server: McpServer, indexes: SearchIndexes) {
  server.registerTool(
    'update_api_source',
    {
      title: 'Update S&box API Source',
      description:
        'Update the S&box API data source URL and re-download. Use when a new S&box release is available. URL format: https://cdn.sbox.game/releases/YYYY-MM-DD-HH-MM-SS.zip.json',
      inputSchema: {
        url: z.string().url().describe('New API JSON URL from cdn.sbox.game'),
      },
    },
    async ({ url }) => {
      try {
        const data = await updateApiSource(url)
        const newIndexes = buildIndexes(data)

        // Replace indexes in-place
        indexes.types = newIndexes.types
        indexes.typeFuse = newIndexes.typeFuse
        indexes.typeLookup = newIndexes.typeLookup
        indexes.members = newIndexes.members
        indexes.memberFuse = newIndexes.memberFuse
        indexes.namespaceMap = newIndexes.namespaceMap
        indexes.docFuse = newIndexes.docFuse

        return {
          content: [
            {
              type: 'text',
              text: `API source updated successfully!\nURL: ${url}\nTypes loaded: ${data.Types.length}\nMembers indexed: ${newIndexes.members.length}`,
            },
          ],
        }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to update API source: ${err}` }],
          isError: true,
        }
      }
    }
  )
}
