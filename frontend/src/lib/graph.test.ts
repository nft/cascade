import { describe, expect, it } from 'vitest'
import { componentIds, decorateEdges, polylinesIntersect, segmentsIntersect, upstreamIds } from './graph'
import type { AppEdge, AppNode, NodeStatus } from './model'

const mkNode = (id: string, status: NodeStatus): AppNode => ({
  id,
  type: 'operation',
  position: { x: 0, y: 0 },
  data: {
    name: id,
    method: 'GET',
    path: `/v1/${id}`,
    environment: 'staging',
    credential: 'staging-admin',
    status,
    repeat: 1,
    fields: [],
  },
})

const mkEdge = (source: string, target: string): AppEdge => ({ id: `${source}->${target}`, source, target })

describe('decorateEdges (plan 03 §3)', () => {
  it('animates an edge iff its target node is running', () => {
    const nodes = [mkNode('a', 'success'), mkNode('b', 'running'), mkNode('c', 'idle')]
    const edges = [mkEdge('a', 'b'), mkEdge('b', 'c')]
    const [intoRunning, intoIdle] = decorateEdges(nodes, edges)
    expect(intoRunning.animated).toBe(true)
    expect(intoRunning.class).toBe('edge-active')
    expect(intoIdle.animated).toBe(false)
    expect(intoIdle.class).toBeUndefined()
  })

  it('marks edges into failed targets', () => {
    const nodes = [mkNode('a', 'success'), mkNode('b', 'failed')]
    const [edge] = decorateEdges(nodes, [mkEdge('a', 'b')])
    expect(edge.animated).toBe(false)
    expect(edge.class).toBe('edge-failed')
  })

  it('never animates when nothing is running', () => {
    const nodes = [mkNode('a', 'success'), mkNode('b', 'success')]
    const decorated = decorateEdges(nodes, [mkEdge('a', 'b')])
    expect(decorated.every((e) => e.animated === false)).toBe(true)
  })
})

describe('run target sets (plan 03 §4)', () => {
  // Diamond a -> b, a -> c, b -> d, c -> d, plus a disconnected chain x -> y.
  const edges = [mkEdge('a', 'b'), mkEdge('a', 'c'), mkEdge('b', 'd'), mkEdge('c', 'd'), mkEdge('x', 'y')]

  it('upstreamIds returns the node plus transitive ancestors only', () => {
    expect(upstreamIds(edges, 'd')).toEqual(new Set(['a', 'b', 'c', 'd']))
    expect(upstreamIds(edges, 'b')).toEqual(new Set(['a', 'b']))
    expect(upstreamIds(edges, 'x')).toEqual(new Set(['x']))
  })

  it('componentIds returns the weakly-connected component', () => {
    expect(componentIds(edges, 'b')).toEqual(new Set(['a', 'b', 'c', 'd']))
    expect(componentIds(edges, 'x')).toEqual(new Set(['x', 'y']))
  })
})

describe('slice geometry (plan 03 §5 v2)', () => {
  it('detects crossing segments', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true)
  })

  it('rejects parallel and distant segments', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false)
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 5, y: 5 }, { x: 6, y: 5 })).toBe(false)
  })

  it('counts an endpoint touching the other segment as a hit', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 })).toBe(true)
  })

  it('a slice trace cuts a sampled edge path it crosses and misses one it does not', () => {
    // Horizontal "edge" sampled at y=50 from x=0..100.
    const edge = Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 50 }))
    const crossingTrace = [
      { x: 40, y: 80 },
      { x: 45, y: 60 },
      { x: 55, y: 20 },
    ]
    const missingTrace = [
      { x: 40, y: 80 },
      { x: 55, y: 60 },
    ]
    expect(polylinesIntersect(crossingTrace, edge)).toBe(true)
    expect(polylinesIntersect(missingTrace, edge)).toBe(false)
  })
})
