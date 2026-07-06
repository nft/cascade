import { describe, expect, it } from 'vitest'
import { BOARD_FORMAT_VERSION, deserializeBoard, serializeBoard } from './board'
import type { AppEdge, AppNode, BoardJSON, HttpNode } from './model'

const httpNode = (id: string, x = 10, y = 20): AppNode => ({
  id,
  type: 'http',
  position: { x, y },
  data: {
    name: `Node ${id}`,
    key: `node${id.toUpperCase()}`,
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
        key: 'nodeA',
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

  it('backfills missing node keys from names, board-uniquely (plan 05 §9a)', () => {
    const board: BoardJSON = {
      formatVersion: 1,
      id: 'b1',
      name: 'Main',
      nodes: [
        { id: 'n1', name: 'Create User' },
        { id: 'n2', name: 'Create User' },
        { id: 'n3', name: 'Create User' },
      ],
      edges: [],
      layout: { positions: {} },
    }
    const { nodes } = deserializeBoard(board)
    expect(nodes.map((n) => (n as HttpNode).data.key)).toEqual([
      'createUser',
      'createUser2',
      'createUser3',
    ])
  })

  it('migrates pre-plan-05 display-string bindings to ID-backed refs', () => {
    const board: BoardJSON = {
      formatVersion: 1,
      id: 'b1',
      name: 'Main',
      nodes: [
        { id: 'u1', name: 'Create User' },
        {
          id: 'o1',
          name: 'Create Org',
          data: {
            fields: [
              { key: 'body.owner_id', source: 'binding', value: 'Create User → response.body.id' },
              { key: 'body.email', source: 'literal', value: 'member+{i}@example.com' },
              { key: 'body.ghost', source: 'binding', value: 'Nobody → response.body.id' },
            ],
          },
        },
      ],
      edges: [{ from: 'u1', to: 'o1' }],
      layout: { positions: {} },
    }
    const { nodes } = deserializeBoard(board)
    const org = nodes[1] as HttpNode
    expect(org.data.fields[0]).toEqual({
      key: 'body.owner_id',
      source: 'binding',
      value: 'u1.body.id',
      ref: { nodeId: 'u1', path: 'body.id' },
    })
    // old {i} placeholder becomes the {{i}} template reference
    expect(org.data.fields[1]).toEqual({
      key: 'body.email',
      source: 'template',
      value: 'member+{{i}}@example.com',
    })
    // an unmatchable legacy binding degrades to a literal, never throws
    expect(org.data.fields[2].source).toBe('literal')
  })

  it('round-trips captured responses through the layout sidecar (plan 05 §8)', () => {
    const responses = {
      a: { status: 201, body: { id: 'u1' }, at: '2026-07-06T14:02:00Z' },
      ghost: { status: 200, body: null, at: '2026-07-06T14:02:00Z' },
    }
    const board = serializeBoard('b1', 'Main', [httpNode('a')], [], undefined, responses)
    // responses of deleted nodes are dropped at save time
    expect(board.layout.responses).toEqual({ a: responses.a })
    const loaded = deserializeBoard(board)
    expect(loaded.responses).toEqual({ a: responses.a })
  })

  it('preserves exports and pinned response schemas across the round-trip', () => {
    const node = httpNode('a')
    if (node.type === 'http') {
      node.data.exports = [{ key: 'userId', path: 'body.id' }]
      node.data.responseSchema = { type: 'object', properties: { id: { type: 'string' } } }
    }
    const { nodes } = deserializeBoard(serializeBoard('b1', 'Main', [node], []))
    const loaded = nodes[0] as HttpNode
    expect(loaded.data.exports).toEqual([{ key: 'userId', path: 'body.id' }])
    expect(loaded.data.responseSchema).toEqual({ type: 'object', properties: { id: { type: 'string' } } })
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

describe('transform nodes round-trip (plan 06)', () => {
  const transformNode: AppNode = {
    id: 't1',
    type: 'transform',
    position: { x: 5, y: 6 },
    data: {
      name: 'Actives',
      key: 'actives',
      status: 'success',
      note: 'run product',
      mode: 'script',
      pick: [{ key: 'emails', source: 'binding', value: 'res.body.a', ref: { nodeId: '', path: 'body.a' } }],
      script: 'return res.body',
      exports: [{ key: 'emails', path: 'body.emails' }],
    },
  }

  it('persists mode/pick/script/exports but never run products', () => {
    const wire = serializeBoard('b1', 'Main', [transformNode], []).nodes[0]
    expect(wire.type).toBe('transform')
    expect(wire.data).toMatchObject({ mode: 'script', script: 'return res.body' })
    expect(wire.data).not.toHaveProperty('status')
    expect(wire.data).not.toHaveProperty('note')

    const { nodes } = deserializeBoard(serializeBoard('b1', 'Main', [transformNode], []))
    expect(nodes[0].type).toBe('transform')
    expect(nodes[0].data).toMatchObject({
      name: 'Actives',
      key: 'actives',
      status: 'idle',
      mode: 'script',
      script: 'return res.body',
      exports: [{ key: 'emails', path: 'body.emails' }],
    })
    expect((nodes[0].data as { pick: unknown[] }).pick).toHaveLength(1)
  })

  it('defaults absent transform config to an empty pick setup', () => {
    const board: BoardJSON = {
      formatVersion: BOARD_FORMAT_VERSION,
      id: 'b1',
      name: 'Main',
      nodes: [{ id: 't1', type: 'transform', name: 'Old Transform' }],
      edges: [],
      layout: { positions: {} },
    }
    const { nodes } = deserializeBoard(board)
    expect(nodes[0].data).toMatchObject({ mode: 'pick', pick: [], script: '' })
  })
})
