import { describe, expect, it } from 'vitest'
import { BINDING_EXAMPLES, DATA_FOLDER, FEATURE_SECTIONS } from './features'

const ANCHOR = /^[a-z][a-z-]*$/

describe('features content', () => {
  it('gives every section a unique anchor', () => {
    const ids = FEATURE_SECTIONS.map((section) => section.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(ANCHOR)
  })

  it('writes every binding example as one {{…}} reference', () => {
    for (const { syntax } of BINDING_EXAMPLES) expect(syntax).toMatch(/^\{\{[^{}]+\}\}$/)
  })

  it('nests each folder entry directly under a folder', () => {
    const open: number[] = [-1]
    for (const entry of DATA_FOLDER.entries) {
      while (open.at(-1)! >= entry.depth) open.pop()
      expect(open.at(-1)).toBe(entry.depth - 1)
      if ('folder' in entry && entry.folder) open.push(entry.depth)
    }
  })
})
