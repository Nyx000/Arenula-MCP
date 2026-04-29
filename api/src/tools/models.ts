import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'

// ── Types ──────────────────────────────────────────────────────────

interface ModelResult {
  id: string
  name: string
  provider: 'polyhaven'
  downloadCount?: number
  categories?: string[]
  tags?: string[]
  thumbnailUrl?: string
  authors?: string[]
}

interface DownloadedModelFile {
  kind: 'mesh' | 'texture'
  assetPath: string
  filename: string
  bytes: number
}

// ── HTTP helpers (mirrors textures.ts) ─────────────────────────────

function httpGet(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doRequest = (reqUrl: string, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects'))
      const mod = reqUrl.startsWith('https') ? https : require('http')
      mod.get(reqUrl, { headers: { 'User-Agent': 'arenula-mcp/1.0' } }, (res: any) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doRequest(res.headers.location, redirects + 1)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${reqUrl}`))
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      }).on('error', reject)
    }
    doRequest(url)
  })
}

async function httpGetJson(url: string): Promise<any> {
  const buf = await httpGet(url)
  return JSON.parse(buf.toString('utf-8'))
}

// ── Project paths ──────────────────────────────────────────────────

function resolveProjectRoot(): string {
  return process.cwd()
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// ── Poly Haven model API ───────────────────────────────────────────
//
// Endpoints used (https://api.polyhaven.com/):
//   GET  /assets?t=models                 — full catalog of models (one big JSON dict)
//   GET  /info/{id}                       — metadata for one asset (authors, dims, tags)
//   GET  /files/{id}                      — file URLs for an asset (fbx/blend/gltf + textures)
//
// All endpoints are documented + free + no auth (per https://github.com/Poly-Haven/Public-API).
// Poly Haven assets are CC0 — attribution appreciated but not required.

async function polyhavenModelSearch(query: string, limit: number): Promise<ModelResult[]> {
  const data = await httpGetJson('https://api.polyhaven.com/assets?t=models')
  const queryLower = query.toLowerCase()
  const queryTokens = queryLower.split(/\s+/).filter(Boolean)

  const matches: ModelResult[] = []
  for (const [id, asset] of Object.entries(data) as [string, any][]) {
    const name = (asset.name || '').toLowerCase()
    const cats: string[] = asset.categories || []
    const tags: string[] = asset.tags || []
    const haystack = [
      id.toLowerCase(),
      name,
      ...cats.map(c => c.toLowerCase()),
      ...tags.map(t => t.toLowerCase()),
    ].join(' ')

    // Match if every query token appears somewhere in the haystack.
    const allMatch = queryTokens.every(tok => haystack.includes(tok))
    if (!allMatch) continue

    matches.push({
      id,
      name: asset.name || id,
      provider: 'polyhaven',
      downloadCount: asset.download_count,
      categories: cats,
      tags,
      thumbnailUrl: asset.thumbnail_url,
      authors: asset.authors ? Object.keys(asset.authors) : undefined,
    })
  }

  // Sort by download count descending, then trim
  matches.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0))
  return matches.slice(0, limit)
}

async function polyhavenModelInfo(assetId: string): Promise<any> {
  return await httpGetJson(`https://api.polyhaven.com/info/${assetId}`)
}

// PolyHaven /files/{id} response: top-level keys mix mesh formats (fbx/gltf/blend)
// with texture maps (Diffuse, nor_gl, nor_dx, Rough, AO, Displacement, arm, etc.).
// Texture maps are nested by resolution → format → { url, size, md5 }.
// The fbx entries also have an `include` block listing every texture the FBX
// references, with its own download URL — this is the easiest path to a
// self-contained .fbx (download .fbx, plus every URL in `include`, into the
// matching relative paths).
type PolyHavenFiles = Record<string, any>

async function polyhavenModelFiles(assetId: string): Promise<PolyHavenFiles> {
  return await httpGetJson(`https://api.polyhaven.com/files/${assetId}`)
}

// Pick the best mesh format at a target resolution. We prefer fbx (s&box-friendly)
// > gltf > blend. Returns the primary mesh URL plus any "include" texture files
// that the mesh references (PolyHaven nests these under fbx[res].fbx.include
// with their own download URLs and relative paths like "textures/foo_diff_2k.jpg").
interface MeshPick {
  url: string
  ext: string
  resolution: string
  include: Array<{ relativePath: string, url: string }>
}

function pickMeshAtResolution(files: PolyHavenFiles, requestedRes: string): MeshPick | null {
  const meshFormats: Array<['fbx' | 'gltf' | 'blend', string]> = [
    ['fbx', 'fbx'],
    ['gltf', 'gltf'],
    ['blend', 'blend'],
  ]

  for (const [topKey, innerKey] of meshFormats) {
    const fmtBlock = files[topKey]
    if (!fmtBlock) continue

    // Try the requested resolution first; fall back to highest available.
    const resolutionsByPreference = [
      requestedRes,
      ...Object.keys(fmtBlock).sort().reverse(),
    ]
    for (const res of resolutionsByPreference) {
      const entry = fmtBlock[res]?.[innerKey]
      if (!entry?.url) continue

      const include: Array<{ relativePath: string, url: string }> = []
      if (entry.include && typeof entry.include === 'object') {
        for (const [relPath, info] of Object.entries(entry.include) as [string, any][]) {
          if (info?.url) include.push({ relativePath: relPath, url: info.url })
        }
      }
      return { url: entry.url, ext: innerKey, resolution: res, include }
    }
  }

  return null
}

async function polyhavenModelDownload(
  assetId: string,
  resolution: string,
  projectRoot: string,
): Promise<DownloadedModelFile[]> {
  const files = await polyhavenModelFiles(assetId)
  const downloaded: DownloadedModelFile[] = []

  const modelDir = path.join(projectRoot, 'Assets', 'models', assetId)
  ensureDir(modelDir)

  // Pick the mesh and read off its `include` block of texture files.
  const pick = pickMeshAtResolution(files, resolution.toLowerCase())
  if (!pick) {
    throw new Error(`No mesh file (fbx/gltf/blend) available for ${assetId}`)
  }

  // Save the mesh as <id>.<ext> for predictable referencing in s&box.
  const meshFilename = `${assetId}.${pick.ext}`
  const meshPath = path.join(modelDir, meshFilename)
  const meshBuf = await httpGet(pick.url)
  fs.writeFileSync(meshPath, meshBuf)
  downloaded.push({
    kind: 'mesh',
    assetPath: `models/${assetId}/${meshFilename}`,
    filename: meshFilename,
    bytes: meshBuf.length,
  })

  // Download every texture the mesh references, preserving its relative path
  // so the FBX's internal references resolve correctly.
  //
  // Important quirk: PolyHaven's `include` block ships normals/roughness as
  // .exr (HDR) which s&box's MaterialCompiler can't ingest. For each .exr we
  // see, we substitute the equivalent .png/.jpg from the top-level texture map
  // entries (PolyHaven serves both formats) and rewrite the destination path
  // to the supported extension. This keeps the FBX self-contained AND keeps
  // s&box happy.
  const TEX_FORMAT_BLOCKLIST = new Set(['.exr'])

  // Build a quick lookup: top-level map keys (Diffuse, nor_gl, Rough, AO, etc.)
  // → resolution → preferred substitute URL (png > jpg).
  function findSubstitute(originalRelPath: string): { url: string, ext: 'png' | 'jpg' } | null {
    // Filename pattern: <id>_<mapType>_<res>.<ext>  e.g. boulder_01_nor_gl_2k.exr
    const base = path.basename(originalRelPath, path.extname(originalRelPath))
    // Strip leading "<id>_" and trailing "_<res>" to recover mapType
    const idPrefix = `${assetId}_`
    let core = base.startsWith(idPrefix) ? base.slice(idPrefix.length) : base
    const resMatch = core.match(/_(\d+k)$/i)
    if (!resMatch) return null
    const res = resMatch[1].toLowerCase()
    const mapType = core.slice(0, -resMatch[0].length)

    const mapEntry = files[mapType]
    if (!mapEntry) return null
    const resEntry = mapEntry[res]
    if (!resEntry) return null
    if (resEntry.png?.url) return { url: resEntry.png.url, ext: 'png' }
    if (resEntry.jpg?.url) return { url: resEntry.jpg.url, ext: 'jpg' }
    return null
  }

  for (const inc of pick.include) {
    let url = inc.url
    let outRelPath = inc.relativePath
    const incExt = path.extname(inc.relativePath).toLowerCase()

    if (TEX_FORMAT_BLOCKLIST.has(incExt)) {
      const sub = findSubstitute(inc.relativePath)
      if (sub) {
        url = sub.url
        // Rewrite extension on disk so the .vmat path matches what we save.
        const dir = path.dirname(inc.relativePath)
        const stem = path.basename(inc.relativePath, incExt)
        outRelPath = dir === '.' || dir === '' ? `${stem}.${sub.ext}` : `${dir}/${stem}.${sub.ext}`
      } else {
        console.error(`[models] No PNG/JPG substitute for ${inc.relativePath} on ${assetId} — skipping (s&box can't compile ${incExt})`)
        continue
      }
    }

    const outPath = path.join(modelDir, outRelPath)
    ensureDir(path.dirname(outPath))
    try {
      const buf = await httpGet(url)
      fs.writeFileSync(outPath, buf)
      downloaded.push({
        kind: 'texture',
        assetPath: `models/${assetId}/${outRelPath.replace(/\\/g, '/')}`,
        filename: path.basename(outRelPath),
        bytes: buf.length,
      })
    } catch (e) {
      console.error(`[models] Failed to download ${outRelPath} for ${assetId}: ${e}`)
    }
  }

  return downloaded
}

// ── Tool registration ──────────────────────────────────────────────

export function registerModels(server: McpServer) {
  server.registerTool(
    'models',
    {
      title: 'Fetch 3D Models from External Asset Libraries',
      description:
        'Search and download free CC0 3D models from external libraries (Poly Haven). '
        + 'Use this when sbox.game cloud (the cloud tool) does not have what you need. '
        + 'Downloads .fbx + textures into Assets/models/<id>/ where the s&box editor auto-imports them. '
        + "Actions: 'search' finds models, 'info' gets one asset's full details, "
        + "'download' fetches mesh + textures locally, 'list_providers' lists sources. "
        + 'For sbox.game-hosted assets prefer the cloud tool (mounts via package system, no copy). '
        + 'Use this tool only as the fallback for assets not in sbox.game.',
      inputSchema: {
        action: z.enum(['search', 'info', 'download', 'list_providers']).describe(
          "Operation: 'search' finds models by query, 'info' returns full details for one asset, "
          + "'download' fetches mesh+textures, 'list_providers' shows available sources",
        ),
        query: z.string().optional().describe(
          "Search term (e.g., 'rock', 'boulder', 'volcanic'). Multi-word queries match all tokens. "
          + 'Required for: search',
        ),
        provider: z.enum(['polyhaven']).optional().describe(
          'Asset source. Default: polyhaven. (More providers may be added later.)',
        ),
        asset_id: z.string().optional().describe(
          "Exact asset ID (e.g., 'namaqualand_boulder_02'). Required for: info, download",
        ),
        resolution: z.enum(['1k', '2k', '4k', '8k']).optional().describe(
          'Texture resolution. Default: 2k. Used by: download. Mesh quality is highest available.',
        ),
        limit: z.number().min(1).max(50).optional().describe(
          'Max search results. Default: 15. Used by: search',
        ),
      },
    },
    async ({ action, query, provider, asset_id, resolution, limit }) => {
      try {
        const prov = provider || 'polyhaven'
        const res = resolution || '2k'
        const lim = limit || 15

        // ── list_providers ──
        if (action === 'list_providers') {
          return {
            content: [{
              type: 'text' as const,
              text: [
                '# Available Model Providers',
                '',
                '## polyhaven',
                '- URL: https://polyhaven.com/models',
                '- API: https://api.polyhaven.com/ (public, no auth)',
                '- License: CC0 (public domain)',
                '- Photogrammetry + hand-modeled, mostly nature / props / vehicles',
                '- Mesh formats: fbx, gltf, blend (we prefer fbx for s&box auto-import)',
                '- Asset IDs: snake_case (e.g., namaqualand_boulder_02, rock_boulder_dry_07)',
                '',
                '## Future providers (not yet implemented)',
                '- Sketchfab (requires OAuth for downloads, but search is open)',
                '- Kenney.nl (no API, would require asset list mirror)',
                '',
                '## When to use this tool vs sbox.game cloud',
                '- Prefer the `cloud` tool first — sbox.game-hosted assets mount via the package',
                '  system (no .fbx copy, faster). Many Poly Haven assets are wrapped there as',
                '  `polyhaven.<id>`.',
                '- Use this tool only when an asset exists on Poly Haven but NOT on sbox.game,',
                '  or when you want a fresh copy with all maps locally indexed by the asset library.',
              ].join('\n'),
            }],
          }
        }

        // ── search ──
        if (action === 'search') {
          if (!query) {
            return {
              content: [{ type: 'text' as const, text: 'Error: query is required for search' }],
              isError: true,
            }
          }

          const results = await polyhavenModelSearch(query, lim)

          if (results.length === 0) {
            return {
              content: [{
                type: 'text' as const,
                text: `No models found for "${query}" on ${prov}. Try broader keywords (e.g., 'rock' instead of 'volcanic rock').`,
              }],
            }
          }

          const lines = results.map((r, i) => {
            const parts = [`${i + 1}. **${r.id}** — ${r.name}`]
            if (r.downloadCount) parts.push(`   Downloads: ${r.downloadCount.toLocaleString()}`)
            if (r.categories?.length) parts.push(`   Categories: ${r.categories.join(', ')}`)
            if (r.tags?.length) parts.push(`   Tags: ${r.tags.slice(0, 8).join(', ')}${r.tags.length > 8 ? ', …' : ''}`)
            if (r.authors?.length) parts.push(`   Authors: ${r.authors.join(', ')}`)
            parts.push(`   Page: https://polyhaven.com/a/${r.id}`)
            if (r.thumbnailUrl) parts.push(`   Thumb: ${r.thumbnailUrl}`)
            return parts.join('\n')
          })

          return {
            content: [{
              type: 'text' as const,
              text: `Found ${results.length} ${prov} models for "${query}":\n\n${lines.join('\n\n')}\n\n`
                + `Use \`info\` with \`asset_id\` for full details, or \`download\` to fetch.`,
            }],
          }
        }

        // ── info ──
        if (action === 'info') {
          if (!asset_id) {
            return {
              content: [{ type: 'text' as const, text: 'Error: asset_id is required for info' }],
              isError: true,
            }
          }

          const info = await polyhavenModelInfo(asset_id)
          const files = await polyhavenModelFiles(asset_id)

          const fbxResolutions = Object.keys(files.fbx || {})
          const textures = Object.keys(files.textures || {})
          const dim = info.dimensions ? `${info.dimensions.join(' × ')} mm` : 'unknown'

          return {
            content: [{
              type: 'text' as const,
              text: [
                `# ${info.name || asset_id}`,
                '',
                `- **ID:** ${asset_id}`,
                `- **License:** ${info.license || 'CC0'}`,
                `- **Authors:** ${info.authors ? Object.keys(info.authors).join(', ') : 'unknown'}`,
                `- **Dimensions:** ${dim}`,
                `- **Categories:** ${(info.categories || []).join(', ') || '—'}`,
                `- **Tags:** ${(info.tags || []).join(', ') || '—'}`,
                `- **Downloads:** ${(info.download_count || 0).toLocaleString()}`,
                `- **Page:** https://polyhaven.com/a/${asset_id}`,
                '',
                '## Mesh formats available',
                files.fbx ? `- FBX (resolutions: ${fbxResolutions.join(', ')})` : '- FBX: ❌ not available',
                files.gltf ? `- glTF (resolutions: ${Object.keys(files.gltf).join(', ')})` : '- glTF: ❌ not available',
                files.blend ? `- Blend (resolutions: ${Object.keys(files.blend).join(', ')})` : '- Blend: ❌ not available',
                '',
                '## Texture maps',
                textures.length ? textures.map(t => `- ${t}`).join('\n') : '- (none)',
                '',
                `Use \`download\` with this asset_id to fetch the mesh + textures into Assets/models/${asset_id}/.`,
              ].join('\n'),
            }],
          }
        }

        // ── download ──
        if (action === 'download') {
          if (!asset_id) {
            return {
              content: [{ type: 'text' as const, text: 'Error: asset_id is required for download' }],
              isError: true,
            }
          }

          const projectRoot = resolveProjectRoot()
          const modelDir = path.join(projectRoot, 'Assets', 'models', asset_id)

          // Skip re-download if already present
          if (fs.existsSync(modelDir) && fs.readdirSync(modelDir).length > 0) {
            const files = fs.readdirSync(modelDir)
            return {
              content: [{
                type: 'text' as const,
                text: [
                  `Model already exists at Assets/models/${asset_id}/ (${files.length} files).`,
                  'Delete the directory if you want to re-download.',
                  '',
                  '## Files',
                  ...files.map(f => `- ${f}`),
                  '',
                  `## s&box reference path`,
                  `models/${asset_id}/${asset_id}.fbx → s&box auto-creates models/${asset_id}/${asset_id}.vmdl`,
                ].join('\n'),
              }],
            }
          }

          const downloaded = await polyhavenModelDownload(asset_id, res, projectRoot)
          const meshFiles = downloaded.filter(d => d.kind === 'mesh')
          const texFiles = downloaded.filter(d => d.kind === 'texture')
          const totalBytes = downloaded.reduce((s, d) => s + d.bytes, 0)
          const totalMb = (totalBytes / 1024 / 1024).toFixed(2)

          return {
            content: [{
              type: 'text' as const,
              text: [
                `# Downloaded ${asset_id} from Poly Haven`,
                '',
                `- **Total:** ${downloaded.length} files, ${totalMb} MB`,
                `- **Mesh:** ${meshFiles.map(f => f.filename).join(', ') || '(none)'}`,
                `- **Textures:** ${texFiles.length} maps`,
                ...texFiles.map(f => `  - ${f.filename} (${(f.bytes / 1024 / 1024).toFixed(2)} MB)`),
                '',
                '## Next step',
                '',
                `The s&box editor will auto-import the .fbx on next focus and create a .vmdl wrapper.`,
                `Reference path for ClutterDefinition / ModelRenderer:`,
                '',
                `  \`models/${asset_id}/${asset_id}.vmdl\``,
                '',
                'License: CC0 (Poly Haven). Attribution appreciated but not required.',
              ].join('\n'),
            }],
          }
        }

        return {
          content: [{ type: 'text' as const, text: `Unknown action: ${action}` }],
          isError: true,
        }
      } catch (e: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${e?.message || String(e)}` }],
          isError: true,
        }
      }
    },
  )
}
