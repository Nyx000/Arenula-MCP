import MiniSearch from 'minisearch'

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

interface DocEntry {
  id: string
  title: string
  content: string
  url: string
}

const index = new MiniSearch<DocEntry>({
  fields: ['title', 'content'],
  storeFields: ['title', 'url', 'content'],
  searchOptions: {
    boost: { title: 2 },
    fuzzy: 0.2,
    prefix: true,
  },
})

let initialized = false

const LLMS_TXT_URL = 'https://sbox.game/llms.txt'
const SBOX_BASE = 'https://sbox.game'
const TIMEOUT = parseInt(process.env.SBOX_DOCS_REQUEST_TIMEOUT || '10000')
const USER_AGENT = process.env.SBOX_DOCS_USER_AGENT || 'arenula-docs/1.0.0'

/**
 * Parse llms.txt and extract all documentation .md URLs with titles.
 * Format: `- [Title](/dev/doc/path.md)`
 */
function parseLlmsTxt(text: string): Array<{ url: string; title: string }> {
  const entries: Array<{ url: string; title: string }> = []
  for (const line of text.split('\n')) {
    const match = line.match(/^- \[([^\]]+)\]\(([^)]+\.md)\)/)
    if (match) {
      entries.push({ title: match[1], url: `${SBOX_BASE}${match[2]}` })
    }
  }
  return entries
}

/**
 * Fetch the documentation page index from sbox.game/llms.txt.
 * Returns parsed entries, or empty array on failure.
 */
async function fetchPageIndex(): Promise<Array<{ url: string; title: string }>> {
  try {
    const response = await fetch(LLMS_TXT_URL, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!response.ok) {
      console.error(`[arenula-docs] Failed to fetch llms.txt: HTTP ${response.status}`)
      return []
    }
    const text = await response.text()
    const entries = parseLlmsTxt(text)
    console.error(`[arenula-docs] Parsed ${entries.length} pages from llms.txt`)
    return entries
  } catch (err) {
    console.error('[arenula-docs] Failed to fetch llms.txt:', err)
    return []
  }
}

export function addDocument(entry: DocEntry): void {
  if (!index.has(entry.id)) {
    index.add(entry)
  }
}

export async function ensureInitialized(fetcher: (url: string) => Promise<{ title: string; markdown: string }>): Promise<void> {
  if (initialized) return
  initialized = true

  // Fetch the page index dynamically from llms.txt
  const pages = await fetchPageIndex()

  if (pages.length === 0) {
    console.error('[arenula-docs] No pages from llms.txt — search will be empty until pages are fetched via get_page')
    return
  }

  // Seed the index with all docs pages — fetch in parallel
  const results = await Promise.allSettled(
    pages.map(async ({ url, title }) => {
      try {
        const result = await fetcher(url)
        addDocument({
          id: url,
          title: result.title || title,
          content: result.markdown,
          url,
        })
      } catch {
        // Add a stub entry so search can still find the page by title
        addDocument({ id: url, title, content: title, url })
      }
    })
  )

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  console.error(`[arenula-docs] Indexed ${succeeded}/${pages.length} documentation pages`)
}

export function search(query: string, limit = 10): SearchResult[] {
  const results = index.search(query).slice(0, limit)
  return results.map(r => {
    const content = (r as unknown as { content: string }).content || ''

    // Try each query word to find the best snippet anchor
    const lowerContent = content.toLowerCase()
    const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean)
    let matchIdx = -1
    for (const word of queryWords) {
      matchIdx = lowerContent.indexOf(word)
      if (matchIdx !== -1) break
    }

    let snippet: string
    if (matchIdx !== -1) {
      const snippetStart = Math.max(0, matchIdx - 50)
      snippet = content.slice(snippetStart, snippetStart + 200).trim()
    } else {
      // No match in content — use the beginning as a fallback
      snippet = content.slice(0, 200).trim()
    }

    return {
      title: r.title as string,
      url: r.url as string,
      snippet: snippet ? `...${snippet}...` : '',
    }
  })
}

export function isInitialized(): boolean {
  return initialized
}
