const TIMEOUT = parseInt(process.env.SBOX_DOCS_REQUEST_TIMEOUT || '10000')
const USER_AGENT = process.env.SBOX_DOCS_USER_AGENT || 'arenula-docs/1.0.0'

const SBOX_BASE = 'https://sbox.game'

export interface FetchResult {
  markdown: string
  title: string
  url: string
}

/**
 * Normalize any docs URL to a sbox.game raw .md URL.
 * Accepts:
 *   - sbox.game/dev/doc/... (with or without .md)
 *   - docs.facepunch.com/s/sbox-dev/doc/slug-HASH
 */
function toMarkdownUrl(url: string): string {
  // Already a raw .md URL on sbox.game
  if (url.startsWith(SBOX_BASE) && url.endsWith('.md')) return url

  // sbox.game docs page without .md suffix
  if (url.startsWith(SBOX_BASE) && url.includes('/dev/doc/')) {
    return url.replace(/\/?$/, '.md')
  }

  // Legacy docs.facepunch.com URL — extract slug, strip hash suffix
  const fpMatch = url.match(/docs\.facepunch\.com\/s\/sbox-dev\/doc\/([a-z0-9-]+?)(?:-[A-Za-z0-9]{8,})?$/)
  if (fpMatch) {
    // Best-effort: the slug maps roughly to sbox.game paths but not 1:1.
    // Return as-is and let the caller fall back to HTML fetch if .md 404s.
    return url
  }

  return url
}

/**
 * Extract a title from the first markdown heading, or fall back to the URL slug.
 */
function extractTitle(markdown: string, url: string): string {
  const headingMatch = markdown.match(/^#\s+(.+)$/m)
  if (headingMatch) return headingMatch[1].trim()

  // Derive from URL path
  const slug = url.replace(/\.md$/, '').split('/').pop() || 'Untitled'
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export async function fetchPage(url: string): Promise<FetchResult> {
  const mdUrl = toMarkdownUrl(url)

  // Try raw .md endpoint first (no HTML parsing needed)
  if (mdUrl.startsWith(SBOX_BASE) && mdUrl.endsWith('.md')) {
    const response = await fetch(mdUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT),
    })

    if (response.ok) {
      const markdown = (await response.text()).trim()
      if (markdown) {
        const title = extractTitle(markdown, mdUrl)
        return { title, markdown, url: mdUrl }
      }
    }
  }

  // Fallback: if the URL is still a legacy docs.facepunch.com page, fetch
  // HTML and do minimal extraction (no cheerio/turndown — just grab text)
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const text = await response.text()

  // If the response looks like markdown already (starts with # or no <html), use it directly
  if (!text.trimStart().startsWith('<')) {
    const title = extractTitle(text, url)
    return { title, markdown: text.trim(), url }
  }

  throw new Error(
    `Could not fetch raw markdown for ${url}. ` +
    `Use sbox.game/dev/doc/... URLs with .md suffix for best results.`
  )
}

export async function fetchApiType(typeName: string): Promise<FetchResult> {
  // Try the sbox.game docs search for the type
  // Common API types have pages under the scene/ or systems/ paths
  const slug = typeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  // Try common doc paths where API types are documented
  const candidates = [
    `${SBOX_BASE}/dev/doc/scene/${slug}.md`,
    `${SBOX_BASE}/dev/doc/scene/components/reference/${slug}.md`,
    `${SBOX_BASE}/dev/doc/systems/${slug}.md`,
  ]

  for (const candidateUrl of candidates) {
    try {
      const response = await fetch(candidateUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT),
      })
      if (response.ok) {
        const markdown = (await response.text()).trim()
        if (markdown) {
          const title = extractTitle(markdown, candidateUrl)
          return { title, markdown, url: candidateUrl }
        }
      }
    } catch {
      // Try next candidate
    }
  }

  throw new Error(
    `No docs page found for '${typeName}'. ` +
    `Try sbox_docs_search to find the relevant page, ` +
    `or use arenula-api's get_type tool for structured API data.`
  )
}
