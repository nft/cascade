import { describe, expect, it } from 'vitest'
import type { AppNode, BoardJSON } from './model'
import { buildPaste } from './paste'

// An envelope board exercising every reference shape the paste pipeline
// rewrites: a structured binding, a template with {{id}} and {{i}} tokens, a
// dangling marker from selection export, and a transform's res-sugar pick.
const envelopeBoard = (): BoardJSON => ({
  formatVersion: 1,
  id: '',
  name: '',
  nodes: [
    {
      id: 'n1',
      type: 'http',
      name: 'Create User',
      data: { key: 'createUser', method: 'POST', path: '/v1/users', environment: 'staging', credential: '', fields: [] },
    },
    {
      id: 'n2',
      type: 'http',
      name: 'Create Invoice',
      data: {
        key: 'createInvoice',
        method: 'POST',
        path: '/v1/invoices',
        environment: 'staging',
        credential: '',
        fields: [
          { key: 'body.user_id', source: 'binding', value: 'n1.body.id', ref: { nodeId: 'n1', path: 'body.id' } },
          { key: 'body.email', source: 'template', value: 'member+{{n1.body.id}}-{{i}}@x.io' },
          { key: 'body.org_id', source: 'literal', value: '', dangling: { originalKey: 'createOrg', path: 'body.id' } },
        ],
      },
    },
    {
      id: 'n3',
      type: 'transform',
      name: 'Pick',
      data: {
        key: 'pickId',
        mode: 'pick',
        pick: [{ key: 'invoice_id', source: 'binding', value: 'res.body.id', ref: { nodeId: '', path: 'body.id' } }],
        script: '',
      },
    },
  ],
  edges: [
    { id: 'e1', from: 'n1', to: 'n2' },
    { id: 'e2', from: 'n2', to: 'n3' },
  ],
  layout: { positions: { n1: { x: 0, y: 0 }, n2: { x: 200, y: 0 }, n3: { x: 400, y: 100 } } },
})

const existingNode = (id: string, key: string): AppNode => ({
  id,
  type: 'http',
  position: { x: 0, y: 0 },
  data: {
    name: id,
    key,
    method: 'GET',
    path: '/v1/x',
    environment: '',
    credential: '',
    status: 'idle',
    fields: [],
  },
})

const makeId = (i: number) => `p${i}`

describe('buildPaste (plan 07 E3)', () => {
  it('assigns fresh ids, remaps edges and marks everything selected', () => {
    const { nodes, edges } = buildPaste(envelopeBoard(), [], { x: 0, y: 0 }, makeId)
    expect(nodes.map((n) => n.id)).toEqual(['p0', 'p1', 'p2'])
    expect(nodes.every((n) => n.selected)).toBe(true)
    expect(edges.map((e) => [e.source, e.target])).toEqual([
      ['p0', 'p1'],
      ['p1', 'p2'],
    ])
    expect(new Set(edges.map((e) => e.id)).size).toBe(2)
  })

  it('recenters the pasted set on the target, keeping relative layout', () => {
    const { nodes } = buildPaste(envelopeBoard(), [], { x: 1000, y: 500 }, makeId)
    // Bounding-box center of (0,0)/(200,0)/(400,100) is (200,50).
    expect(nodes.map((n) => n.position)).toEqual([
      { x: 800, y: 450 },
      { x: 1000, y: 450 },
      { x: 1200, y: 550 },
    ])
  })

  it('re-slugs keys colliding with the target board and keeps the rest', () => {
    const { nodes } = buildPaste(envelopeBoard(), [existingNode('a', 'createUser')], { x: 0, y: 0 }, makeId)
    expect(nodes.map((n) => (n.type === 'note' ? '' : n.data.key))).toEqual([
      'createUser2',
      'createInvoice',
      'pickId',
    ])
  })

  it('rewrites structured bindings onto the fresh ids (bindings store node IDs)', () => {
    const { nodes } = buildPaste(envelopeBoard(), [], { x: 0, y: 0 }, makeId)
    const invoice = nodes[1]
    if (invoice.type !== 'http') throw new Error('expected http node')
    expect(invoice.data.fields[0].ref).toEqual({ nodeId: 'p0', path: 'body.id' })
    expect(invoice.data.fields[0].value).toBe('p0.body.id')
  })

  it('rewrites template id tokens, leaving {{i}} and non-node heads alone', () => {
    const { nodes } = buildPaste(envelopeBoard(), [], { x: 0, y: 0 }, makeId)
    const invoice = nodes[1]
    if (invoice.type !== 'http') throw new Error('expected http node')
    expect(invoice.data.fields[1].value).toBe('member+{{p0.body.id}}-{{i}}@x.io')
  })

  it('carries dangling markers through untouched', () => {
    const { nodes } = buildPaste(envelopeBoard(), [], { x: 0, y: 0 }, makeId)
    const invoice = nodes[1]
    if (invoice.type !== 'http') throw new Error('expected http node')
    expect(invoice.data.fields[2]).toEqual({
      key: 'body.org_id',
      source: 'literal',
      value: '',
      dangling: { originalKey: 'createOrg', path: 'body.id' },
    })
  })

  it('leaves res sugar alone — the remapped edge carries its upstream', () => {
    const { nodes } = buildPaste(envelopeBoard(), [], { x: 0, y: 0 }, makeId)
    const pick = nodes[2]
    if (pick.type !== 'transform') throw new Error('expected transform node')
    expect(pick.data.pick[0].ref).toEqual({ nodeId: '', path: 'body.id' })
  })

  it('guards generated ids against collisions with the target board', () => {
    const { nodes } = buildPaste(
      envelopeBoard(),
      [existingNode('p0', 'other')],
      { x: 0, y: 0 },
      makeId,
    )
    expect(nodes[0].id).toBe('p0-2')
  })

  it('returns nothing for an empty board', () => {
    const empty: BoardJSON = { formatVersion: 1, id: '', name: '', nodes: [], edges: [], layout: { positions: {} } }
    expect(buildPaste(empty, [], { x: 0, y: 0 }, makeId)).toEqual({ nodes: [], edges: [] })
  })
})
