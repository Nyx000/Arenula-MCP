import type { GetPageParams } from '../schemas/index.js'
import { fetchPage } from '../lib/fetcher.js'
import { Cache } from '../lib/cache.js'
import { updateDocument } from '../lib/search-index.js'

const cache = new Cache<string>(
  parseInt(process.env.SBOX_DOCS_CACHE_TTL || '14400') * 1000,
  parseInt(process.env.SBOX_DOCS_MAX_CACHE_ENTRIES || '500'),
)

export async function getPage(params: GetPageParams): Promise<string> {
  const { url, start_index, max_length } = params

  let markdown = cache.get(url)
  const cached = markdown !== undefined

  if (!markdown) {
    const result = await fetchPage(url)
    markdown = result.markdown
    cache.set(result.url, markdown)

    // Enrich the search index with full page content (use normalized URL)
    updateDocument(result.url, result.title, markdown)
  }

  const chunk = markdown.slice(start_index, start_index + max_length)
  const hasMore = start_index + max_length < markdown.length

  return JSON.stringify({
    url,
    content: chunk,
    startIndex: start_index,
    endIndex: start_index + chunk.length,
    totalLength: markdown.length,
    hasMore,
    cached,
  })
}
