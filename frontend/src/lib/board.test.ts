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
    expect(a.data.fields).toEqual([{ key: 'body.name', source: 'literal', value: 'Apollo' }])
    expect(a.data.status).toBe('idle')
    expect(a.data.note).toBeUndefined()
    expect(edges).toEqual([{ id: 'a->b', source: 'a', target: 'b' }])
  })

  it('round-trips origin, rawBody, and requestRef (plan 08 C1)', () => {
    const node = httpNode('a')
    node.data = {
      ...node.data,
      origin: 'https://api.other-service.io',
      rawBody: { contentType: 'text/csv', text: 'a,b\n1,2' },
      requestRef: { collectionId: 'col1', requestId: 'req1' },
    }
    const { nodes } = deserializeBoard(serializeBoard('b1', 'Main', [node], []))
    const loaded = nodes[0] as HttpNode
    expect(loaded.data.origin).toBe('https://api.other-service.io')
    expect(loaded.data.rawBody).toEqual({ contentType: 'text/csv', text: 'a,b\n1,2' })
    expect(loaded.data.requestRef).toEqual({ collectionId: 'col1', requestId: 'req1' })
  })

  it('drops malformed plan-08 fields instead of loading garbage', () => {
    const board: BoardJSON = {
      formatVersion: 1,
      id: 'b1',
      name: 'Main',
      nodes: [
        {
          id: 'n1',
          name: 'Node',
          data: {
            method: 'FETCH',
            origin: 42,
            rawBody: { contentType: 'text/plain' },
            requestRef: { collectionId: 'col1' },
          },
        },
      ],
      edges: [],
      layout: { positions: {} },
    }
    const { nodes } = deserializeBoard(board)
    const loaded = nodes[0] as HttpNode
    expect(loaded.data.method).toBe('GET')
    expect(loaded.data.origin).toBeUndefined()
    expect(loaded.data.rawBody).toBeUndefined()
    expect(loaded.data.requestRef).toBeUndefined()
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
    expect(bare.data.fields).toEqual([])
    // Edges without an id get a deterministic one.
    expect(edges[0].id).toBeTruthy()
  })

  it('ignores the retired repeat key on old boards and never writes it back (plan 10 §3a)', () => {
    const board: BoardJSON = {
      formatVersion: 1,
      id: 'b1',
      name: 'Main',
      nodes: [{ id: 'n1', name: 'Legacy', data: { method: 'POST', repeat: 5 } }],
      edges: [],
      layout: { positions: {} },
    }
    const { nodes } = deserializeBoard(board)
    expect(nodes[0].data).not.toHaveProperty('repeat')
    const rewritten = serializeBoard('b1', 'Main', nodes, [])
    expect(JSON.stringify(rewritten)).not.toContain('"repeat"')
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

  it('backfills body. onto unprefixed request field keys (plan 11 D6)', () => {
    const board: BoardJSON = {
      formatVersion: 1,
      id: 'b1',
      name: 'Main',
      nodes: [
        {
          id: 'u1',
          name: 'Create User',
          data: {
            fields: [
              { key: 'amount', source: 'literal', value: '100' },
              { key: 'query.limit', source: 'literal', value: '10' },
              { key: 'header.X-Trace', source: 'literal', value: 'on' },
            ],
          },
        },
        // Pick keys are output names, not request sections — they must not move.
        {
          id: 't1',
          type: 'transform',
          name: 'Shape',
          data: { mode: 'pick', pick: [{ key: 'amount', source: 'literal', value: '1' }] },
        },
      ],
      edges: [],
      layout: { positions: {} },
    }
    const { nodes } = deserializeBoard(board)
    expect((nodes[0] as HttpNode).data.fields.map((f) => f.key)).toEqual([
      'body.amount',
      'query.limit',
      'header.X-Trace',
    ])
    const shape = nodes[1]
    if (shape.type !== 'transform') throw new Error('expected transform node')
    expect(shape.data.pick[0].key).toBe('amount')
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

describe('mock/delay/for nodes round-trip (plan 09 N1)', () => {
  const mockNode: AppNode = {
    id: 'm1',
    type: 'mock',
    position: { x: 5, y: 6 },
    data: {
      name: 'Fixture',
      key: 'fixture',
      status: 'success',
      body: '{"users":[{"name":"ada"}]}',
      statusCode: 201,
    },
  }
  const forNode: AppNode = {
    id: 'f1',
    type: 'for',
    position: { x: 100, y: 0 },
    data: {
      name: 'Seed Users',
      key: 'seedUsers',
      status: 'idle',
      mode: 'each',
      count: 1,
      source: { nodeId: 'm1', path: 'body.users' },
    },
  }
  const childNode: AppNode = {
    id: 'c1',
    type: 'delay',
    parentId: 'f1',
    position: { x: 20, y: 40 },
    data: { name: 'Wait', key: 'wait', status: 'idle', durationMs: 500 },
  }

  it('persists parent on the wire node and round-trips containment', () => {
    const board = serializeBoard('b1', 'Main', [mockNode, forNode, childNode], [])
    expect(board.formatVersion).toBe(BOARD_FORMAT_VERSION)
    expect(board.nodes[2]).toMatchObject({ id: 'c1', type: 'delay', parent: 'f1' })
    expect(board.nodes[0]).not.toHaveProperty('parent')
    expect(board.nodes[1]).not.toHaveProperty('parent')
    // Children keep container-relative coordinates in the layout, untranslated.
    expect(board.layout.positions.c1).toEqual({ x: 20, y: 40 })

    const { nodes } = deserializeBoard(board)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    expect(byId.get('c1')?.parentId).toBe('f1')
    expect(byId.get('c1')?.position).toEqual({ x: 20, y: 40 })
    expect(byId.get('m1')?.parentId).toBeUndefined()
    expect(byId.get('m1')?.data).toMatchObject({
      status: 'idle',
      body: '{"users":[{"name":"ada"}]}',
      statusCode: 201,
    })
    expect(byId.get('f1')?.data).toMatchObject({
      mode: 'each',
      count: 1,
      source: { nodeId: 'm1', path: 'body.users' },
    })
    expect(byId.get('c1')?.data).toMatchObject({ durationMs: 500 })
  })

  it('never persists a loop’s live progress, however the save was triggered', () => {
    const running: AppNode = {
      ...forNode,
      data: { ...forNode.data, status: 'running', progress: { done: 3, total: 20 } },
    }
    const board = serializeBoard('b1', 'Main', [running, childNode], [])
    expect(board.nodes[0].data).not.toHaveProperty('progress')
    expect(JSON.stringify(board)).not.toContain('progress')
    expect(board.nodes[0].data).toMatchObject({ mode: 'each', count: 1 })
  })

  it('reorders children after their container so xyflow can resolve parentId', () => {
    const board = serializeBoard('b1', 'Main', [childNode, forNode], [])
    const { nodes } = deserializeBoard(board)
    expect(nodes.map((n) => n.id)).toEqual(['f1', 'c1'])
  })

  it('round-trips the resized container dimensions through layout.sizes (N5)', () => {
    const sized: AppNode = { ...forNode, width: 520, height: 300 }
    const board = serializeBoard('b1', 'Main', [mockNode, sized], [])
    expect(board.layout.sizes).toEqual({ f1: { width: 520, height: 300 } })
    // Non-container nodes never write a size entry.
    const { nodes } = deserializeBoard(board)
    const loaded = nodes.find((n) => n.id === 'f1')!
    expect(loaded.width).toBe(520)
    expect(loaded.height).toBe(300)
    expect(nodes.find((n) => n.id === 'm1')?.width).toBeUndefined()
  })

  it('defaults absent config and drops parents on non-child-capable types', () => {
    const board: BoardJSON = {
      formatVersion: BOARD_FORMAT_VERSION,
      id: 'b1',
      name: 'Main',
      nodes: [
        { id: 'm1', type: 'mock' },
        { id: 'd1', type: 'delay' },
        { id: 'f1', type: 'for' },
        { id: 'f2', type: 'for', parent: 'f1' },
      ],
      edges: [],
      layout: { positions: {} },
    }
    const { nodes } = deserializeBoard(board)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    expect(byId.get('m1')?.data).toMatchObject({ body: '{}', statusCode: 200 })
    expect(byId.get('d1')?.data).toMatchObject({ durationMs: 1000 })
    expect(byId.get('f1')?.data).toMatchObject({ mode: 'count', count: 1 })
    // A nested for is invalid (v1) — the parent link is dropped on load, not fatal.
    expect(byId.get('f2')?.parentId).toBeUndefined()
  })
})
