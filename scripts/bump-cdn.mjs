#!/usr/bin/env node
// Bump the s&box CDN release timestamp in all files that reference it.
// Usage: npm run bump-cdn 2026-04-20-19-10-25

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ts = process.argv[2]
const tsPattern = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/

if (!ts || !tsPattern.test(ts)) {
  console.error('Usage: npm run bump-cdn <YYYY-MM-DD-HH-MM-SS>')
  console.error('Example: npm run bump-cdn 2026-04-20-19-10-25')
  process.exit(1)
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const urlFrom = /cdn\.sbox\.game\/releases\/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.zip\.json/g
const urlTo = `cdn.sbox.game/releases/${ts}.zip.json`
const commentFrom = /\/\/ Release: \d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/g
const commentTo = `// Release: ${ts}`

const targets = [
  { path: '.mcp.json.example', replacements: [[urlFrom, urlTo]] },
  { path: 'api/src/data/loader.ts', replacements: [[urlFrom, urlTo], [commentFrom, commentTo]] },
]

let anyFailed = false

for (const { path, replacements } of targets) {
  const abs = resolve(repoRoot, path)
  const before = readFileSync(abs, 'utf8')
  let after = before
  for (const [pattern, replacement] of replacements) {
    const next = after.replace(pattern, replacement)
    if (next === after) {
      console.warn(`[bump-cdn] ${path}: no match for ${pattern}`)
      anyFailed = true
    }
    after = next
  }
  if (before !== after) {
    writeFileSync(abs, after)
    console.log(`[bump-cdn] updated ${path}`)
  } else {
    console.log(`[bump-cdn] ${path}: already at ${ts}`)
  }
}

if (anyFailed) {
  console.error('[bump-cdn] one or more patterns did not match — review above')
  process.exit(1)
}

console.log(`[bump-cdn] done. review with: git diff`)
