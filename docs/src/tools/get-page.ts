import type { GetPageParams } from '../schemas/index.js'
import { fetchPage } from '../lib/fetcher.js'
import { Cache } from '../lib/cache.js'
import { addDocument } from '../lib/search-index.js'

const cache = new Cache<string>(
  parseInt(process.env.SBOX_DOCS_CACHE_TTL || '14400') * 1000,
  parseInt(process.env.SBOX_DOCS_MAX_CACHE_ENTRIES || '500'),
)

export async function getPage(params: GetPageParams): Promise<string> {
  const { url, start_index, max_length } = params

  // Check cache first
  let markdown = cache.get(url)
  if (!markdown) {
    const result = await fetchPage(url)
    markdown = result.markdown
    cache.set(url, markdown)
    // Also add to search index for future searches
    addDocument({ id: url, title: result.title, content: markdown, url })
  }

  // Apply chunking
  const chunk = markdown.slice(start_index, start_index + max_length)
  const hasMore = start_index + max_length < markdown.length

  return JSON.stringify({
    url,
    content: chunk,
    startIndex: start_index,
    endIndex: start_index + chunk.length,
    totalLength: markdown.length,
    hasMore,
  })
}
