import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { searchPackages, PACKAGE_TYPES, type UgcPackage } from '../data/ugc-client.js'

function formatPackage(pkg: UgcPackage, index: number): string {
  const lines: string[] = []
  const votes = pkg.VotesUp ? ` | Votes: ${pkg.VotesUp}` : ''
  const favs = pkg.Favourited ? ` | Favs: ${pkg.Favourited}` : ''
  const tags = pkg.Tags?.length ? `Tags: ${pkg.Tags.join(', ')}` : ''

  lines.push(`${index + 1}. **${pkg.FullIdent}** — "${pkg.Title}"`)
  if (pkg.Summary) lines.push(`   ${pkg.Summary}`)
  lines.push(`   Type: ${pkg.TypeName}${votes}${favs}`)
  if (tags) lines.push(`   ${tags}`)
  lines.push(`   Use in code: \`${pkg.FullIdent}\``)

  return lines.join('\n')
}

export function registerSearchPackages(server: McpServer) {
  server.registerTool(
    'search_packages',
    {
      title: 'Search S&box Workshop Packages',
      description:
        'Search the S&box Workshop (UGC) for community-made assets: models, sounds, materials, maps, prefabs, shaders, clothing, and more. Returns packages with their identifiers that can be used directly in S&box game code.',
      inputSchema: {
        query: z.string().describe("Search query (e.g., 'zombie', 'wooden chair', 'footstep sound')"),
        type: z
          .enum(PACKAGE_TYPES)
          .optional()
          .describe('Filter by asset type: model, sound, material, map, game, clothing, library, vsnd, prefab, shader'),
        category: z
          .string()
          .optional()
          .describe('Filter by category (for models: Animal, Architecture, Debris, Development, Fence/Wall, Food, Furniture, Human, Lighting, Nature, Prop, Toy, Vehicle, Weapon)'),
        tag: z.string().optional().describe("Filter by tag (e.g., 'kenney', 'retro', 'psx', 'realistic')"),
        order: z
          .enum(['popular', 'newest', 'updated', 'trending', 'thumbsup', 'favourites'])
          .optional()
          .describe('Sort order. Defaults to relevance.'),
        take: z.number().min(1).max(50).default(10).describe('Max results (1-50, default 10)'),
      },
    },
    async ({ query, type, category, tag, order, take }) => {
      try {
        const response = await searchPackages({ query, type, category, tag, order, take })

        if (response.Packages.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `No packages found matching "${query}"${type ? ` (type: ${type})` : ''}. Try broadening your search or removing filters.`,
            }],
          }
        }

        const formatted = response.Packages.map((pkg, i) => formatPackage(pkg, i))
        const typeLabel = type ? ` (type: ${type})` : ''
        const header = `Found ${response.TotalCount} packages matching "${query}"${typeLabel} (showing ${response.Packages.length}):\n`

        const topTags = response.Tags
          ? Object.entries(response.Tags)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 10)
              .map(([t, c]) => `${t} (${c})`)
              .join(', ')
          : null

        const footer = topTags ? `\n---\nTop tags in results: ${topTags}` : ''

        return {
          content: [{
            type: 'text' as const,
            text: `${header}\n${formatted.join('\n\n')}${footer}`,
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error searching packages: ${err instanceof Error ? err.message : String(err)}`,
          }],
        }
      }
    }
  )
}
