import { describe, expect, it } from 'vitest'
import { ANCHORS, ROUTES, type RoutePath } from '$lib/config/routes'
import { FEATURE_SECTIONS } from '../features'
import { DOC_SECTIONS, type DocBlock } from '.'

const ANCHOR = /^[a-z][a-z-]*$/

const docIds = DOC_SECTIONS.flatMap((section) => [
  section.id,
  ...(section.subsections ?? []).map((subsection) => subsection.id),
])

const allBlocks: DocBlock[] = DOC_SECTIONS.flatMap((section) => [
  ...section.blocks,
  ...(section.subsections ?? []).flatMap((subsection) => subsection.blocks),
])

/** The anchors each page renders, for the pages docs can deep-link into. */
const PAGE_ANCHORS: Partial<Record<RoutePath, readonly string[]>> = {
  [ROUTES.download]: Object.values(ANCHORS),
  [ROUTES.features]: FEATURE_SECTIONS.map((section) => section.id),
  [ROUTES.docs]: docIds,
}

describe('docs content', () => {
  it('gives every section and subsection a unique anchor', () => {
    expect(new Set(docIds).size).toBe(docIds.length)
    for (const id of docIds) expect(id).toMatch(ANCHOR)
  })

  it('fills every table row to the width of its header', () => {
    for (const block of allBlocks) {
      if (block.kind !== 'table') continue
      for (const row of block.rows) expect(row).toHaveLength(block.head.length)
    }
  })

  it('links only to anchors the target page renders', () => {
    for (const block of allBlocks) {
      if (block.kind !== 'links') continue
      for (const link of block.items) {
        if (link.hash === undefined) continue
        expect(PAGE_ANCHORS[link.href] ?? []).toContain(link.hash)
      }
    }
  })
})
