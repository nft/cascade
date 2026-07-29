import { describe, expect, it } from 'vitest'
import { adoptEdgeScope, centeredNodePosition, edgeScope, spliceEdge } from './edgeInsert'
import type { AppEdge, AppNode } from './model'

const mkNode = (id: string, parentId?: string): AppNode => ({
  id,
  type: 'transform',
  position: { x: 0, y: 0 },
  ...(parentId ? { parentId } : {}),
  data: { name: id, key: id, status: 'idle', mode: 'pick', pick: [], script: '' },
})

const mkFor = (id: string, x: number, y: number): AppNode => ({
  id,
  type: 'for',
  position: { x, y },
  width: 400,
  height: 240,
  data: { name: id, key: id, status: 'idle', mode: 'count', count: 2 },
})

const mkEdge = (id: string, source: string, target: string): AppEdge => ({ id, source, target })

describe('spliceEdge', () => {
  it('replaces A→B with A→N and N→B, in place', () => {
    const edges = [mkEdge('e0', 'a', 'b'), mkEdge('e1', 'b', 'c')]
    const spliced = spliceEdge(edges, 'e0', 'n')
    expect(spliced.map((e) => [e.source, e.target])).toEqual([
      ['a', 'n'],
      ['n', 'b'],
      ['b', 'c'],
    ])
    expect(spliced.some((e) => e.id === 'e0')).toBe(false)
  })

  it('gives the two new edges ids no other edge holds', () => {
    const edges = [mkEdge('e-a-n', 'a', 'x'), mkEdge('e0', 'a', 'b')]
    const spliced = spliceEdge(edges, 'e0', 'n')
    const ids = spliced.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('leaves the array alone for an unknown edge id', () => {
    const edges = [mkEdge('e0', 'a', 'b')]
    expect(spliceEdge(edges, 'nope', 'n')).toEqual(edges)
  })
})

describe('edgeScope / adoptEdgeScope', () => {
  it('reports the For container a connection lives in', () => {
    const nodes = [mkFor('loop', 100, 100), mkNode('a', 'loop'), mkNode('b', 'loop'), mkNode('top')]
    expect(edgeScope(nodes, mkEdge('e0', 'a', 'b'))).toBe('loop')
    expect(edgeScope(nodes, mkEdge('e1', 'top', 'top'))).toBeNull()
  })

  it('re-parents an inserted node into the loop, keeping it visually put', () => {
    const fresh = { ...mkNode('n'), position: { x: 180, y: 160 } }
    const nodes = [mkFor('loop', 100, 100), mkNode('a', 'loop'), mkNode('b', 'loop'), fresh]
    const adopted = adoptEdgeScope(nodes, 'n', mkEdge('e0', 'a', 'b'))
    const moved = adopted.find((n) => n.id === 'n')!
    expect(moved.parentId).toBe('loop')
    // Container-relative coordinates: absolute (180,160) inside a loop at (100,100).
    expect(moved.position).toEqual({ x: 80, y: 60 })
    // Containers must precede their children in the array (xyflow).
    expect(adopted.findIndex((n) => n.id === 'loop')).toBeLessThan(
      adopted.findIndex((n) => n.id === 'n'),
    )
  })

  it('leaves a node spliced into a top-level connection untouched', () => {
    const nodes = [mkNode('a'), mkNode('b'), { ...mkNode('n'), position: { x: 5, y: 6 } }]
    const adopted = adoptEdgeScope(nodes, 'n', mkEdge('e0', 'a', 'b'))
    expect(adopted).toEqual(nodes)
  })
})

describe('centeredNodePosition', () => {
  it('offsets the top-left so the card covers the clicked point of the wire', () => {
    const { x, y } = centeredNodePosition({ x: 300, y: 200 })
    expect(x).toBeLessThan(300)
    expect(y).toBeLessThan(200)
  })
})
