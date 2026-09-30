import { describe, expect, it } from 'vitest'
import {
  makeCustomHttpNode,
  makeDelayNode,
  makeForNode,
  makeHttpNode,
  makeHttpNodeFromRequest,
  makeMockNode,
} from './nodeFactory'
import type { RequestDef } from './model'

const defaults = { environment: 'staging', credential: 'staging-admin' }
const at = { x: 0, y: 0 }

describe('makeHttpNodeFromRequest', () => {
  it('copies the request shape, materializes defaults, and links back via requestRef', () => {
    const request: RequestDef = {
      id: 'create-invoice',
      name: 'Create invoice',
      protocol: 'http',
      method: 'POST',
      url: '/v1/invoices',
      defaults: [{ key: 'body.amount', source: 'literal', value: '100' }],
      responseSchema: { type: 'object', properties: { id: { type: 'string' } } },
    }
    const node = makeHttpNodeFromRequest('col1', request, 'n1', [], defaults, at)
    if (node.type !== 'http') throw new Error('expected an http node')
    expect(node.data.method).toBe('POST')
    expect(node.data.path).toBe('/v1/invoices')
    expect(node.data.origin).toBeUndefined()
    expect(node.data.environment).toBe('staging')
    expect(node.data.credential).toBe('staging-admin')
    expect(node.data.fields).toEqual(request.defaults)
    expect(node.data.fields).not.toBe(request.defaults) // copied, not shared
    expect(node.data.responseSchema).toEqual(request.responseSchema)
    expect(node.data.requestRef).toEqual({ collectionId: 'col1', requestId: 'create-invoice' })
  })

  it('turns an absolute url into an origin override and opts out of credentials', () => {
    const request: RequestDef = {
      id: 'health',
      name: 'Health check',
      protocol: 'http',
      method: 'GET',
      url: 'https://status.example.com/healthz',
    }
    const node = makeHttpNodeFromRequest('col1', request, 'n1', [], defaults, at)
    if (node.type !== 'http') throw new Error('expected an http node')
    expect(node.data.origin).toBe('https://status.example.com')
    expect(node.data.path).toBe('/healthz')
    // Same opt-into-secrets rule as ad-hoc nodes: an arbitrary origin never
    // inherits the project credential.
    expect(node.data.credential).toBe('')
    expect(node.data.environment).toBe('staging')
  })
})

describe('raw-JSON-first bodies', () => {
  it('makeCustomHttpNode seeds an empty raw JSON body', () => {
    const node = makeCustomHttpNode('n1', [], defaults, at)
    if (node.type !== 'http') throw new Error('expected an http node')
    expect(node.data.rawBody).toEqual({ contentType: 'application/json', text: '' })
  })

  it('makeHttpNode from an operation stays in fields mode', () => {
    const node = makeHttpNode(
      { ref: 'op1', method: 'POST', path: '/v1/users', summary: 'Create user', group: 'users' },
      'n1',
      [],
      defaults,
      at,
    )
    if (node.type !== 'http') throw new Error('expected an http node')
    expect(node.data.rawBody).toBeUndefined()
  })

  it('makeHttpNodeFromRequest copies the request rawBody, unshared', () => {
    const request: RequestDef = {
      id: 'raw-req',
      name: 'Raw request',
      protocol: 'http',
      method: 'POST',
      url: '/v1/things',
      rawBody: { contentType: 'application/json', text: '{"a":1}' },
    }
    const node = makeHttpNodeFromRequest('col1', request, 'n1', [], defaults, at)
    if (node.type !== 'http') throw new Error('expected an http node')
    expect(node.data.rawBody).toEqual(request.rawBody)
    expect(node.data.rawBody).not.toBe(request.rawBody)
  })
})

describe('makeMockNode', () => {
  it('seeds an empty JSON body with the default status and a board-unique key', () => {
    const keyOf = (n: { data: Record<string, unknown> }) => n.data.key
    const existing = [makeMockNode('mock-1', [], { x: 0, y: 0 })]
    const node = makeMockNode('mock-2', existing, { x: 10, y: 20 })
    expect(node.type).toBe('mock')
    expect(node.data).toMatchObject({ body: '{}', statusCode: 200, status: 'idle' })
    expect(keyOf(node)).not.toBe(keyOf(existing[0]))
  })
})

describe('makeForNode', () => {
  it('seeds a sized count-mode container with a board-unique key', () => {
    const keyOf = (n: { data: Record<string, unknown> }) => n.data.key
    const existing = [makeForNode('for-1', [], { x: 0, y: 0 })]
    const node = makeForNode('for-2', existing, { x: 10, y: 20 })
    expect(node.type).toBe('for')
    expect(node.data).toMatchObject({ mode: 'count', count: 3, status: 'idle' })
    expect(node.width).toBeGreaterThan(0)
    expect(node.height).toBeGreaterThan(0)
    expect(keyOf(node)).not.toBe(keyOf(existing[0]))
  })
})

describe('makeDelayNode', () => {
  it('seeds the default duration and a board-unique key', () => {
    const keyOf = (n: { data: Record<string, unknown> }) => n.data.key
    const existing = [makeDelayNode('delay-1', [], { x: 0, y: 0 })]
    const node = makeDelayNode('delay-2', existing, { x: 10, y: 20 })
    expect(node.type).toBe('delay')
    expect(node.data).toMatchObject({ durationMs: 1000, status: 'idle' })
    expect(keyOf(node)).not.toBe(keyOf(existing[0]))
  })
})
