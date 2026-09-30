import { describe, expect, it } from 'vitest'
import type { AppNode, CapturedResponse, RunnableNode } from './model'
import { ancestorNodes, arrayPaths, nodeSchemaSource } from './picker'
import { inferSchema, schemaTree } from './schema'

describe('arrayPaths', () => {
  it('keeps only array-typed paths, including arrays nested under [0]', () => {
    const schema = inferSchema({
      name: 'ada',
      users: [{ id: 1, tags: ['a'] }],
      meta: { pages: [1, 2] },
    })
    expect(arrayPaths(schema).map((o) => o.path)).toEqual([
      'body.meta.pages',
      'body.users',
      'body.users[0].tags',
    ])
  })

  it('offers the whole body when the response itself is an array', () => {
    expect(arrayPaths(inferSchema([1, 2, 3])).map((o) => o.path)).toContain('body')
  })

  it('returns nothing for a scalar-only schema', () => {
    expect(arrayPaths(inferSchema({ id: 'x', n: 4 }))).toEqual([])
  })
})

describe('nodeSchemaSource', () => {
  const node = {
    id: 'n1',
    type: 'http',
    position: { x: 0, y: 0 },
    data: { name: 'n1', key: 'n1', method: 'GET', path: '/v1/x', environment: '', credential: '', status: 'idle', fields: [] },
  } as unknown as RunnableNode

  const captured = (over: Partial<CapturedResponse> = {}): CapturedResponse => ({
    status: 200,
    body: { id: 'u1' },
    at: '2026-07-06T14:02:00Z',
    ...over,
  })

  it('builds the tree from a stored schema when the body was never persisted', () => {
    const schema = { type: 'object', properties: { id: { type: 'string' } } }
    const source = nodeSchemaSource(node, captured({ body: undefined, schema }))
    expect(source?.origin).toBe('inferred')
    expect(source?.schema).toBe(schema)
    expect(schemaTree(source!.schema).children?.map((n) => n.path)).toEqual(['body.id'])
  })

  it('infers from the body when there is no stored schema', () => {
    expect(nodeSchemaSource(node, captured())?.schema).toEqual(inferSchema({ id: 'u1' }))
  })

  it('offers nothing when the capture has neither, or is truncated', () => {
    expect(nodeSchemaSource(node, captured({ body: undefined }))).toBeNull()
    expect(nodeSchemaSource(node, captured({ truncated: true }))).toBeNull()
    expect(nodeSchemaSource(node, undefined)).toBeNull()
  })

  it('still puts a pinned schema first', () => {
    const pinned = { ...node, data: { ...node.data, responseSchema: { type: 'string' } } } as RunnableNode
    expect(nodeSchemaSource(pinned, captured())?.origin).toBe('pinned')
  })
})

describe('ancestorNodes (a loop child reads its loop\'s ancestors)', () => {
  const mock = (id: string, parentId?: string): AppNode => ({
    id,
    type: 'mock',
    position: { x: 0, y: 0 },
    ...(parentId ? { parentId } : {}),
    data: { name: id, key: id, status: 'idle', body: '{}', statusCode: 200 },
  })
  const loop: AppNode = {
    id: 'loop',
    type: 'for',
    position: { x: 0, y: 0 },
    data: { name: 'loop', key: 'loop', status: 'idle', mode: 'count', count: 2 },
  }
  const nodes = [mock('seed'), loop, mock('first', 'loop'), mock('shape', 'loop'), mock('stranger')]
  const edges = [
    { id: 'e1', source: 'seed', target: 'loop' },
    { id: 'e2', source: 'first', target: 'shape' },
  ]

  it('offers a child its in-body upstream as direct and the loop\'s upstream as reachable', () => {
    const offered = ancestorNodes(nodes, edges, 'shape').map(({ node, direct }) => [node.id, direct])
    expect(offered).toEqual([
      ['seed', false],
      ['first', true],
    ])
  })
})
