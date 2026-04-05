import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { SearchIndexes } from '../data/indexer.js'
import type { SboxType, SboxMethod } from '../types.js'

function formatSignature(m: SboxMethod): string {
  const params = (m.Parameters || [])
    .map(p => {
      const def = p.Default ? ` = ${p.Default}` : ''
      const inPrefix = p.In ? 'in ' : ''
      return `${inPrefix}${p.Name}: ${p.Type}${def}`
    })
    .join(', ')
  const stat = m.IsStatic ? ' [static]' : ''
  const virt = m.IsVirtual ? ' [virtual]' : ''
  return `${m.Name}(${params}) → ${m.ReturnType}${stat}${virt}`
}

function formatType(type: SboxType, include?: string[]): string {
  const sections: string[] = []
  const showAll = !include || include.length === 0

  // Header
  sections.push(`# ${type.FullName} (${type.Group})`)
  sections.push(`Assembly: ${type.Assembly}`)
  if (type.BaseType) sections.push(`Base: ${type.BaseType}`)
  if (type.DeclaringType) sections.push(`Declaring type: ${type.DeclaringType}`)

  const flags: string[] = []
  if (type.IsAbstract) flags.push('abstract')
  if (type.IsSealed) flags.push('sealed')
  if (type.IsStatic) flags.push('static')
  if (type.IsAttribute) flags.push('attribute')
  if (type.IsExtension) flags.push('extension')
  if (flags.length > 0) sections.push(`Flags: ${flags.join(', ')}`)

  if (type.Documentation?.Summary) {
    sections.push(`\n${type.Documentation.Summary}`)
  }

  // Constructors
  if ((showAll || include?.includes('constructors')) && type.Constructors?.length) {
    sections.push(`\n## Constructors (${type.Constructors.length})`)
    for (const c of type.Constructors) {
      const sig = formatSignature(c)
      const doc = c.Documentation?.Summary ? ` — ${c.Documentation.Summary}` : ''
      sections.push(`- ${sig}${doc}`)
    }
  }

  // Properties
  if ((showAll || include?.includes('properties')) && type.Properties?.length) {
    sections.push(`\n## Properties (${type.Properties.length})`)
    for (const p of type.Properties) {
      const doc = p.Documentation?.Summary ? ` — ${p.Documentation.Summary}` : ''
      sections.push(`- **${p.Name}**: ${p.PropertyType}${doc}`)
    }
  }

  // Methods
  if ((showAll || include?.includes('methods')) && type.Methods?.length) {
    sections.push(`\n## Methods (${type.Methods.length})`)
    for (const m of type.Methods) {
      const sig = formatSignature(m)
      const doc = m.Documentation?.Summary ? ` — ${m.Documentation.Summary}` : ''
      sections.push(`- ${sig}${doc}`)
    }
  }

  // Fields
  if ((showAll || include?.includes('fields')) && type.Fields?.length) {
    sections.push(`\n## Fields (${type.Fields.length})`)
    for (const f of type.Fields) {
      const stat = f.IsStatic ? ' [static]' : ''
      const doc = f.Documentation?.Summary ? ` — ${f.Documentation.Summary}` : ''
      sections.push(`- **${f.Name}**: ${f.FieldType}${stat}${doc}`)
    }
  }

  return sections.join('\n')
}

export function registerGetType(server: McpServer, indexes: SearchIndexes) {
  server.registerTool(
    'get_type',
    {
      title: 'Get S&box Type Details',
      description:
        "Get full details of a specific S&box API type including methods, properties, fields, and constructors. Use exact FullName (e.g., 'Sandbox.GameObject') or short Name if unique.",
      inputSchema: {
        name: z.string().describe("Type name or full name (e.g., 'GameObject' or 'Sandbox.GameObject')"),
        include: z
          .array(z.enum(['methods', 'properties', 'fields', 'constructors']))
          .optional()
          .describe('Which sections to include. Defaults to all.'),
      },
    },
    async ({ name, include }) => {
      const key = name.toLowerCase()
      let type = indexes.typeLookup.get(key)

      // Try fuzzy search if exact lookup fails
      if (!type) {
        const results = indexes.typeFuse.search(name, { limit: 1 })
        if (results.length > 0 && results[0].score! < 0.3) {
          type = results[0].item
        }
      }

      if (!type) {
        // Show suggestions
        const suggestions = indexes.typeFuse
          .search(name, { limit: 5 })
          .map(r => r.item.FullName)
        const sugText = suggestions.length > 0
          ? `\n\nDid you mean: ${suggestions.join(', ')}?`
          : ''
        return {
          content: [{ type: 'text', text: `Type "${name}" not found.${sugText}` }],
        }
      }

      return {
        content: [{ type: 'text', text: formatType(type, include) }],
      }
    }
  )
}
