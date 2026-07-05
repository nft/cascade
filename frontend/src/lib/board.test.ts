import { describe, expect, it } from 'vitest'
import { BOARD_FORMAT_VERSION, deserializeBoard, serializeBoard } from './board'
import type { AppEdge, AppNode, BoardJSON, HttpNode } from './model'

const httpNode = (id: string, x = 10, y = 20): AppNode => ({
  id,
  type: 'http',
  position: { x, y },
  data: {
    name: `Node ${id}`,
    method: 'POST',
    path: `/v1/${id}`,
    environment: 'staging',
    credential: 'staging-admin',
    status: 'failed',
    note: '422 Unprocessable Entity',
    repeat: 3,
    fields: [{ key: 'body.name', source: 'literal', value: 'Apollo' }],
  },
})

const edge = (source: string, target: string): AppEdge => ({ id: `${source}->${target}`, source, target })

describe('serializeBoard (plan 01 P5)', () => {
  it('produces the wire format: id/type/name per node, from/to edges, positions in layout', () => {
    const board = serializeBoard('b1', 'Main', [httpNode('a'), httpNode('b', 300, 40)], [edge('a', 'b')])

    expect(board.formatVersion).toBe(BOARD_FORMAT_VERSION)
    expect(board.id).toBe('b1')
    expect(board.name).toBe('Main')
    expect(board.nodes[0]).toEqual({
      id: 'a',
      type: 'http',
      name: 'Node a',
      data: {
        method: 'POST',
        path: '/v1/a',
        environment: 'staging',
        credential: 'staging-admin',
        repeat: 3,
        fields: [{ key: 'body.name', source: 'literal', value: 'Apollo' }],
      },
    })
    expect(board.edges).toEqual([{ id: 'a->b', from: 'a', to: 'b' }])
    expect(board.layout.positions).toEqual({ a: { x: 10, y: 20 }, b: { x: 300, y: 40 } })
  })

  it('never persists run products (status, note)', () => {
    const board = serializeBoard('b1', 'Main', [httpNode('a')], [])
    expect(JSON.stringify(board)).not.toContain('"status"')
    expect(JSON.stringify(board)).not.toContain('422')
  })

  it('keeps note-node text under data without a name', () => {
    const note: AppNode = { id: 'n1', type: 'note', position: { x: 1, y: 2 }, data: { text: 'hello' } }
    const board = serializeBoard('b1', 'Main', [note], [])
    expect(board.nodes[0]).toEqual({ id: 'n1', type: 'note', data: { text: 'hello' } })
  })
})

describe('deserializeBoard (plan 01 P5)', () => {
  it('round-trips a board back into canvas state with idle statuses', () => {
    const nodes = [httpNode('a'), httpNode('b', 300, 40)]
    const { nodes: loaded, edges } = deserializeBoard(serializeBoard('b1', 'Main', nodes, [edge('a', 'b')]))

    expect(loaded).toHaveLength(2)
    const a = loaded[0] as HttpNode
    expect(a.position).toEqual({ x: 10, y: 20 })
    expect(a.data.name).toBe('Node a')
    expect(a.data.method).toBe('POST')
    expect(a.data.repeat).toBe(3)
    expect(a.data.fields).toEqual([{ key: 'body.name', source: 'literal', value: 'Apollo' }])
    expect(a.data.status).toBe('idle')
    expect(a.data.note).toBeUndefined()
    expect(edges).toEqual([{ id: 'a->b', source: 'a', target: 'b' }])
  })

  it('applies engine defaults: absent type means http, missing layout/data get fallbacks', () => {
    const board: BoardJSON = {
      formatVersion: 1,
      id: 'b1',
      name: 'Main',
      nodes: [{ id: 'bare' }],
      edges: [{ from: 'bare', to: 'bare2' }],
      layout: { positions: {} },
    }
    const { nodes, edges } = deserializeBoard(board)
    const bare = nodes[0] as HttpNode
    expect(bare.type).toBe('http')
    expect(bare.position).toEqual({ x: 0, y: 0 })
    expect(bare.data.name).toBe('bare')
    expect(bare.data.repeat).toBe(1)
    expect(bare.data.fields).toEqual([])
    // Edges without an id get a deterministic one.
    expect(edges[0].id).toBeTruthy()
  })

  it('fails loudly on an unknown node type instead of rendering a default node', () => {
    const board: BoardJSON = {
      formatVersion: 1,
      id: 'b1',
      name: 'Main',
      nodes: [{ id: 'x', type: 'wat' }],
      edges: [],
      layout: { positions: {} },
    }
    expect(() => deserializeBoard(board)).toThrow(/unknown type/)
  })
})
