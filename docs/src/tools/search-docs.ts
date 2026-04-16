import type { SearchDocsParams } from '../schemas/index.js'
import { ensureInitialized, search } from '../lib/search-index.js'

export async function searchDocs(params: SearchDocsParams): Promise<string> {
  try {
    await ensureInitialized()
  } catch (err) {
    console.error('[arenula-docs] Search index initialization failed:', err)
  }

  const results = search(params.query, params.limit)

  if (results.length === 0) {
    return JSON.stringify({
      query: params.query,
      count: 0,
      results: [],
      hint: 'No results found. Try sbox_docs_list to browse available pages by category.',
    })
  }

  return JSON.stringify({
    query: params.query,
    count: results.length,
    results,
  })
}
