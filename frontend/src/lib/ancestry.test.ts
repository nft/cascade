import { describe, expect, it } from 'vitest'
import { readableAncestors } from './ancestry'

// seed → loop { first → shape, sibling }, and a stranger connected to nothing.
const nodes = [
  { id: 'stranger' },
  { id: 'seed' },
  { id: 'loop' },
  { id: 'first', parentId: 'loop' },
  { id: 'sibling', parentId: 'loop' },
  { id: 'shape', parentId: 'loop' },
]
const edges = [
  { source: 'seed', target: 'loop' },
  { source: 'first', target: 'shape' },
]

describe('readableAncestors (mirrors core/exec readableAncestors)', () => {
  it('gives a top-level node its ancestors only', () => {
    expect(readableAncestors(nodes, edges, 'loop')).toEqual(new Set(['seed']))
    expect(readableAncestors(nodes, edges, 'seed')).toEqual(new Set())
  })

  it("gives a loop child its own ancestors and the loop's, never the loop or a sibling", () => {
    expect(readableAncestors(nodes, edges, 'shape')).toEqual(new Set(['first', 'seed']))
    expect(readableAncestors(nodes, edges, 'sibling')).toEqual(new Set(['seed']))
  })
})
