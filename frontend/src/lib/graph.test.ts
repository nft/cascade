import { describe, expect, it } from 'vitest'
import { componentIds, decorateEdges, upstreamIds } from './graph'
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
