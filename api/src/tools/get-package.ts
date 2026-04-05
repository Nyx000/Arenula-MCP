import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { searchPackages, type UgcPackage } from '../data/ugc-client.js'

function formatPackageDetails(pkg: UgcPackage): string {
  const sections: string[] = []

  sections.push(`# ${pkg.Title}`)
  sections.push(`**Identifier:** \`${pkg.FullIdent}\``)
  sections.push(`**Type:** ${pkg.TypeName}`)
  if (pkg.Summary) sections.push(`**Summary:** ${pkg.Summary}`)
  sections.push(`**Author:** ${pkg.Org.Title} (${pkg.Org.Ident})`)

  sections.push('')
  sections.push('## Stats')
  if (pkg.VotesUp) sections.push(`- Votes: ${pkg.VotesUp}`)
  if (pkg.Favourited) sections.push(`- Favourited: ${pkg.Favourited}`)
  if (pkg.Collections) sections.push(`- In collections: ${pkg.Collections}`)
  if (pkg.Referenced) sections.push(`- Referenced by: ${pkg.Referenced}`)

  sections.push('')
  sections.push('## Dates')
  sections.push(`- Created: ${pkg.Created}`)
  sections.push(`- Updated: ${pkg.Updated}`)

  if (pkg.Tags?.length) {
    sections.push('')
    sections.push(`## Tags\n${pkg.Tags.join(', ')}`)
  }

  if (pkg.Thumb) {
    sections.push('')
    sections.push(`## Thumbnail\n${pkg.Thumb}`)
  }

  sections.push('')
  sections.push(`## Usage\nUse \`${pkg.FullIdent}\` in your S&box project to reference this package.`)
  sections.push(`Workshop page: https://sbox.game/${pkg.Org.Ident}/${pkg.Ident}`)

  return sections.join('\n')
}

export function registerGetPackage(server: McpServer) {
  server.registerTool(
    'get_package',
    {
      title: 'Get S&box Package Details',
      description:
        'Get detailed information about a specific S&box Workshop package by its identifier (e.g., "facepunch.zombiemale"). Returns full metadata including stats, tags, author info, and usage instructions.',
      inputSchema: {
        ident: z
          .string()
          .describe("Package identifier in 'org.name' format (e.g., 'facepunch.zombiemale', 'fpopium.chair_01')"),
      },
    },
    async ({ ident }) => {
      try {
        // The API doesn't have a direct get-by-id endpoint,
        // so we search with the exact ident and filter
        const parts = ident.split('.')
        const searchQuery = parts.length > 1 ? parts[1] : ident

        const response = await searchPackages({ query: searchQuery, take: 20 })

        const pkg = response.Packages.find(
          p => p.FullIdent.toLowerCase() === ident.toLowerCase()
        )

        if (!pkg) {
          // Try broader search
          const broader = await searchPackages({ query: ident, take: 20 })
          const found = broader.Packages.find(
            p => p.FullIdent.toLowerCase() === ident.toLowerCase()
          )

          if (!found) {
            const suggestions = response.Packages.slice(0, 5)
              .map(p => `  - ${p.FullIdent} ("${p.Title}")`)
              .join('\n')
            return {
              content: [{
                type: 'text' as const,
                text: `Package "${ident}" not found.\n\nSimilar packages:\n${suggestions}`,
              }],
            }
          }

          return {
            content: [{ type: 'text' as const, text: formatPackageDetails(found) }],
          }
        }

        return {
          content: [{ type: 'text' as const, text: formatPackageDetails(pkg) }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error fetching package: ${err instanceof Error ? err.message : String(err)}`,
          }],
        }
      }
    }
  )
}
