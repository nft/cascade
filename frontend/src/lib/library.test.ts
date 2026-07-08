import { beforeEach, describe, expect, it } from 'vitest'
import {
  canonicalRequestUrl,
  libraryLinkState,
  requestDefFromNode,
  requestDiffers,
} from './library'
import { demoCollection } from './mock'
import type { HttpNode, OperationNodeData, RequestDef } from './model'
import { app } from './state.svelte'

const data = (patch: Partial<OperationNodeData> = {}): OperationNodeData => ({
  name: 'Create invoice',
  key: 'createInvoice',
  method: 'POST',
  path: '/v1/invoices',
  environment: 'staging',
  credential: 'staging-admin',
  status: 'idle',
  repeat: 3,
  fields: [
    { key: 'body.amount', source: 'literal', value: '100' },
    { key: 'body.userId', source: 'binding', value: 'n1.body.id', ref: { nodeId: 'n1', path: 'body.id' } },
  ],
  exports: [{ key: 'invoiceId', path: 'body.id' }],
  ...patch,
})

describe('requestDefFromNode (plan 08 B3)', () => {
  it('keeps literal fields, turns bound rows into empty defaults, drops board-only bits', () => {
    const def = requestDefFromNode(data(), { id: 'req-1', name: 'Create invoice' })
    expect(def).toEqual({
      id: 'req-1',
      name: 'Create invoice',
      protocol: 'http',
      method: 'POST',
      url: '/v1/invoices',
      defaults: [
        { key: 'body.amount', source: 'literal', value: '100' },
        { key: 'body.userId', source: 'literal', value: '' },
      ],
    })
    // Nothing board-only (or secret) leaks into the library.
    expect(JSON.stringify(def)).not.toMatch(/staging-admin|invoiceId|repeat|status/)
  })

  it('composes an absolute url from an origin override and copies the response schema', () => {
    const schema = { type: 'object', properties: { id: { type: 'string' } } }
    const def = requestDefFromNode(
      data({ origin: 'https://api.other.io', path: '/healthz', fields: [], responseSchema: schema }),
      { id: 'req-1', name: 'Health' },
    )
    expect(def.url).toBe('https://api.other.io/healthz')
    expect(def.defaults).toBeUndefined()
    expect(def.responseSchema).toEqual(schema)
    expect(def.responseSchema).not.toBe(schema) // copied, not shared
  })

  it('keeps the identity fields passed in base (update-back path)', () => {
    const def = requestDefFromNode(data(), {
      id: 'req-1',
      name: 'Kept name',
      description: 'kept',
      requestSchema: { body: { type: 'object' } },
    })
    expect(def.name).toBe('Kept name')
    expect(def.description).toBe('kept')
    expect(def.requestSchema).toEqual({ body: { type: 'object' } })
  })
})

describe('requestDiffers — binding-blind divergence (plan 08 B3)', () => {
  // The library shape a save-to-collection of data() would produce.
  const saved: RequestDef = {
    id: 'req-1',
    name: 'Create invoice',
    protocol: 'http',
    method: 'POST',
    url: '/v1/invoices',
    defaults: [
      { key: 'body.amount', source: 'literal', value: '100' },
      { key: 'body.userId', source: 'literal', value: '' },
    ],
  }

  it('a fully-wired untouched node reports clean', () => {
    expect(requestDiffers(data(), saved)).toBe(false)
  })

  it('method, url, added/removed keys and literal value edits diverge', () => {
    expect(requestDiffers(data({ method: 'PUT' }), saved)).toBe(true)
    expect(requestDiffers(data({ path: '/v2/invoices' }), saved)).toBe(true)
    const extra = data()
    extra.fields = [...extra.fields, { key: 'header.X-Debug', source: 'literal', value: '1' }]
    expect(requestDiffers(extra, saved)).toBe(true)
    const edited = data()
    edited.fields = edited.fields.map((f) =>
      f.key === 'body.amount' ? { ...f, value: '250' } : f,
    )
    expect(requestDiffers(edited, saved)).toBe(true)
  })

  it('rewiring a binding never diverges — board wiring is not request shape', () => {
    const rewired = data()
    rewired.fields = rewired.fields.map((f) =>
      f.key === 'body.userId'
        ? { key: f.key, source: 'template' as const, value: '{{n2.body.id}}' }
        : f,
    )
    expect(requestDiffers(rewired, saved)).toBe(false)
  })

  it('an absolute url compares equal to its origin-split node round trip', () => {
    const request: RequestDef = {
      id: 'r',
      name: 'Health',
      protocol: 'http',
      method: 'GET',
      url: 'https://status.example.com/',
    }
    const node = data({ method: 'GET', origin: 'https://status.example.com', path: '', fields: [] })
    expect(requestDiffers(node, request)).toBe(false)
    expect(canonicalRequestUrl('https://status.example.com/')).toBe('https://status.example.com')
  })
})

describe('libraryLinkState (plan 08 B3)', () => {
  const collections = [structuredClone(demoCollection)]
  const linked = () =>
    data({
      method: 'POST',
      path: '/v1/invoices',
      fields: [
        { key: 'body.amount', source: 'literal', value: '100' },
        { key: 'body.currency', source: 'literal', value: 'EUR' },
      ],
      requestRef: { collectionId: demoCollection.id, requestId: 'create-invoice' },
    })

  it('none without a ref, and none when the ref dangles', () => {
    expect(libraryLinkState(collections, data())).toBe('none')
    const dangling = linked()
    dangling.requestRef = { collectionId: 'gone', requestId: 'create-invoice' }
    expect(libraryLinkState(collections, dangling)).toBe('none')
    dangling.requestRef = { collectionId: demoCollection.id, requestId: 'gone' }
    expect(libraryLinkState(collections, dangling)).toBe('none')
  })

  it('clean when shapes match, diverged after an edit', () => {
    expect(libraryLinkState(collections, linked())).toBe('clean')
    const edited = linked()
    edited.method = 'PUT'
    expect(libraryLinkState(collections, edited)).toBe('diverged')
  })
})

describe('library flows through AppState (plan 08 B3)', () => {
  const node = (patch: Partial<OperationNodeData> = {}): HttpNode => ({
    id: 'n1',
    type: 'http',
    position: { x: 0, y: 0 },
    data: data(patch),
  })

  beforeEach(() => {
    app.nodes = [node()]
    app.edges = []
    app.boardId = null
    app.project = {
      project: { id: 'p1', name: 'Test', defaults: {} },
      sources: [],
      environments: [],
      credentials: [],
      boards: [],
      collections: [structuredClone(demoCollection)],
    }
  })

  it('saveNodeToCollection writes the stripped request into the folder and links the node', () => {
    const requestId = app.saveNodeToCollection('n1', demoCollection.id, 'billing', 'Invoice v2')
    expect(requestId).not.toBeNull()
    const folder = app.collections[0].root.folders?.find((f) => f.id === 'billing')
    const saved = folder?.requests.find((r) => r.id === requestId)
    expect(saved?.name).toBe('Invoice v2')
    expect(saved?.defaults).toEqual([
      { key: 'body.amount', source: 'literal', value: '100' },
      { key: 'body.userId', source: 'literal', value: '' },
    ])
    const canvas = app.nodes[0] as HttpNode
    expect(canvas.data.requestRef).toEqual({ collectionId: demoCollection.id, requestId })
    expect(libraryLinkState(app.collections, canvas.data)).toBe('clean')
  })

  it('updateCollectionRequestFromNode pushes the shape back, keeping identity fields', () => {
    app.nodes = [
      node({
        method: 'PUT',
        fields: [{ key: 'body.amount', source: 'literal', value: '999' }],
        requestRef: { collectionId: demoCollection.id, requestId: 'create-invoice' },
      }),
    ]
    expect(app.updateCollectionRequestFromNode('n1')).toBe(true)
    const folder = app.collections[0].root.folders?.find((f) => f.id === 'billing')
    const updated = folder?.requests.find((r) => r.id === 'create-invoice')
    expect(updated?.name).toBe('Create invoice') // identity kept
    expect(updated?.method).toBe('PUT')
    expect(updated?.defaults).toEqual([{ key: 'body.amount', source: 'literal', value: '999' }])
  })

  it('updateCollectionRequestFromNode is a no-op on a dangling ref', () => {
    app.nodes = [node({ requestRef: { collectionId: demoCollection.id, requestId: 'gone' } })]
    expect(app.updateCollectionRequestFromNode('n1')).toBe(false)
  })

  it('upsertCollectionRequest adds new requests and replaces existing ones in place', () => {
    const fresh: RequestDef = { id: 'req-new', name: 'Fresh', protocol: 'http', method: 'GET', url: '/v1/fresh' }
    expect(app.upsertCollectionRequest(demoCollection.id, 'root', fresh)).toBe(true)
    expect(app.collections[0].root.requests.some((r) => r.id === 'req-new')).toBe(true)

    const replaced = { ...fresh, name: 'Renamed', url: '/v2/fresh' }
    // folderId is ignored for existing requests — they keep their place.
    expect(app.upsertCollectionRequest(demoCollection.id, 'billing', replaced)).toBe(true)
    const inRoot = app.collections[0].root.requests.find((r) => r.id === 'req-new')
    expect(inRoot?.url).toBe('/v2/fresh')
    const billing = app.collections[0].root.folders?.find((f) => f.id === 'billing')
    expect(billing?.requests.some((r) => r.id === 'req-new')).toBe(false)
  })
})
