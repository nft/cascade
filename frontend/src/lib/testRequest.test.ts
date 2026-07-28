import { describe, expect, it } from 'vitest'
import type { NodeField, RequestDef } from './model'
import { buildTestRequest } from './testRequest'

const def = (over: Partial<RequestDef> = {}, defaults?: NodeField[]): RequestDef => ({
  id: 'r1',
  name: 'Create invoice',
  protocol: 'http',
  method: 'POST',
  url: '/v1/invoices',
  ...(defaults ? { defaults } : {}),
  ...over,
})

const lit = (key: string, value: string): NodeField => ({ key, source: 'literal', value })

describe('buildTestRequest (plan 08 C9)', () => {
  it('groups prefixed defaults into params/query/headers and nests the body', () => {
    const result = buildTestRequest(
      def({ url: '/v1/orgs/{id}/invoices' }, [
        lit('path.id', 'org_1'),
        lit('query.limit', '10'),
        lit('header.X-Debug', 'on'),
        lit('body.amount', '100'),
        lit('body.customer.email', 'a@b.co'),
      ]),
      'https://staging.example.com',
      '',
    )
    expect(result).toEqual({
      request: {
        protocol: 'http',
        method: 'POST',
        envBase: 'https://staging.example.com',
        path: '/v1/orgs/{id}/invoices',
        pathParams: { id: 'org_1' },
        query: { limit: '10' },
        headers: { 'X-Debug': 'on' },
        body: { amount: '100', customer: { email: 'a@b.co' } },
      },
    })
  })

  it('an absolute URL carries its own origin and needs no environment', () => {
    const result = buildTestRequest(def({ url: 'https://api.stripe.com/v1/charges' }), '', 'stripe-key')
    expect(result).toEqual({
      request: {
        protocol: 'http',
        method: 'POST',
        origin: 'https://api.stripe.com',
        path: '/v1/charges',
        credential: 'stripe-key',
      },
    })
  })

  it('a relative URL without an environment cannot be sent', () => {
    const result = buildTestRequest(def(), '', '')
    expect(result).toEqual({ error: 'the URL is relative — pick an environment to resolve it against' })
  })

  it('unfilled path placeholders are rejected with the parameter name', () => {
    const result = buildTestRequest(def({ url: '/v1/users/{userId}' }), 'https://x.io', '')
    expect('error' in result && result.error).toContain('"userId"')
  })

  it('a raw-mode request sends rawBody, and never the body rows alongside it', () => {
    const rawBody = { contentType: 'application/xml', text: '<invoice amount="100"/>' }
    const result = buildTestRequest(
      def({ rawBody }, [lit('header.X-Debug', 'on'), lit('body.amount', '100')]),
      'https://staging.example.com',
      '',
    )
    expect(result).toEqual({
      request: {
        protocol: 'http',
        method: 'POST',
        envBase: 'https://staging.example.com',
        path: '/v1/invoices',
        headers: { 'X-Debug': 'on' },
        rawBody,
      },
    })
  })

  it('GET drops body rows instead of failing; ws is rejected (plan 08 C10)', () => {
    const get = buildTestRequest(def({ method: 'GET' }, [lit('body.junk', '1')]), 'https://x.io', '')
    expect('request' in get && get.request.body).toBeUndefined()

    // A bodyless method drops a raw body the same way — httpcall.Do rejects it.
    const rawGet = buildTestRequest(
      def({ method: 'GET', rawBody: { contentType: 'application/json', text: '{"a":1}' } }),
      'https://x.io',
      '',
    )
    expect('request' in rawGet && rawGet.request.rawBody).toBeUndefined()

    const ws = buildTestRequest(def({ protocol: 'ws', method: undefined }), 'https://x.io', '')
    expect(ws).toEqual({ error: 'ws requests cannot be sent yet — only http executes' })
  })
})
