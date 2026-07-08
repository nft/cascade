import { describe, expect, it } from 'vitest'
import { makeHttpNodeFromRequest } from './nodeFactory'
import type { RequestDef } from './model'

const defaults = { environment: 'staging', credential: 'staging-admin' }
const at = { x: 0, y: 0 }

describe('makeHttpNodeFromRequest (plan 08 B3)', () => {
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
