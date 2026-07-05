import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Plan 02 (docs/plans/02-icons.md) WP I3: all Material Symbols usage goes
// through Icon.svelte, and no replaced unicode glyphs survive in markup.

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url))

const BANNED_GLYPHS = ['✕', '▶', '⏸', '⏹']

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    if (/\.(svelte|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) return [path]
    return []
  })
}

const files = sourceFiles(SRC_DIR).map((path) => ({
  path: relative(SRC_DIR, path),
  content: readFileSync(path, 'utf8'),
}))

describe('icon conventions (plan 02, I3)', () => {
  it('finds the source tree', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('only Icon.svelte uses material-symbols- classes', () => {
    const offenders = files
      .filter((f) => !f.path.endsWith('components/Icon.svelte'))
      .filter((f) => f.content.includes('material-symbols-'))
      .map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('no replaced unicode glyphs remain in markup', () => {
    const offenders = files
      .filter((f) => BANNED_GLYPHS.some((glyph) => f.content.includes(glyph)))
      .map((f) => f.path)
    expect(offenders).toEqual([])
  })
})
