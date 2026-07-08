import { describe, expect, it } from 'vitest'
import {
  effectiveBaseUrl,
  isAbsoluteUrl,
  joinUrl,
  methodAllowsBody,
  normalizeOrigin,
  paramRows,
  pathPlaceholders,
  sectionFields,
  sectionKey,
  sectionOfKey,
  urlHost,
} from './request'
import { HTTP_METHODS, type NodeField } from './model'

describe('methodAllowsBody (plan 08 A1)', () => {
  it('refuses bodies only on GET and HEAD', () => {
    expect(methodAllowsBody('GET')).toBe(false)
    expect(methodAllowsBody('HEAD')).toBe(false)
  })

  it('allows bodies on everything else, including DELETE and OPTIONS', () => {
    for (const method of HTTP_METHODS.filter((m) => m !== 'GET' && m !== 'HEAD')) {
      expect(methodAllowsBody(method), method).toBe(true)
    }
  })
})

describe('joinUrl', () => {
  // Trailing-slash base × leading/no-slash path matrix — every combination
  // must produce exactly one slash at the seam.
  it.each([
    ['https://api.example.com', '/v1/users', 'https://api.example.com/v1/users'],
    ['https://api.example.com/', '/v1/users', 'https://api.example.com/v1/users'],
    ['https://api.example.com', 'v1/users', 'https://api.example.com/v1/users'],
    ['https://api.example.com//', 'v1/users', 'https://api.example.com/v1/users'],
    ['https://api.example.com/', '', 'https://api.example.com'],
  ])('joinUrl(%s, %s) → %s', (base, path, expected) => {
    expect(joinUrl(base, path)).toBe(expected)
  })
})

describe('normalizeOrigin', () => {
  it('accepts an absolute http(s) URL and strips trailing slashes', () => {
    expect(normalizeOrigin(' https://api.other-service.io/ ')).toBe('https://api.other-service.io')
    expect(normalizeOrigin('http://localhost:8080')).toBe('http://localhost:8080')
  })

  it('rejects values without scheme, host, or that are not URLs at all', () => {
    expect(normalizeOrigin('api.example.com')).toBeNull()
    expect(normalizeOrigin('ftp://api.example.com')).toBeNull()
    expect(normalizeOrigin('https://')).toBeNull()
    expect(normalizeOrigin('')).toBeNull()
    expect(normalizeOrigin('not a url')).toBeNull()
  })
})

describe('isAbsoluteUrl / urlHost / effectiveBaseUrl', () => {
  it('detects absolute URLs', () => {
    expect(isAbsoluteUrl('https://x.io/v1')).toBe(true)
    expect(isAbsoluteUrl('/v1/users')).toBe(false)
  })

  it('extracts the host including port', () => {
    expect(urlHost('http://localhost:8080/v1')).toBe('localhost:8080')
    expect(urlHost('/v1/users')).toBeNull()
  })

  it('prefers the node origin over the environment base URL', () => {
    expect(effectiveBaseUrl('https://other.io', 'https://staging.example.com')).toBe('https://other.io')
    expect(effectiveBaseUrl(undefined, 'https://staging.example.com')).toBe('https://staging.example.com')
    expect(effectiveBaseUrl('', 'https://staging.example.com')).toBe('https://staging.example.com')
  })
})

describe('pathPlaceholders', () => {
  it('extracts names in order, deduplicated', () => {
    expect(pathPlaceholders('/v1/orgs/{orgId}/members/{id}/{orgId}')).toEqual(['orgId', 'id'])
  })

  it('ignores empty or blank braces and paths without placeholders', () => {
    expect(pathPlaceholders('/v1/users/{}/x/{ }')).toEqual([])
    expect(pathPlaceholders('/v1/users')).toEqual([])
  })
})

describe('sectioned editor grouping (plan 08 A2)', () => {
  const field = (key: string): NodeField => ({ key, source: 'literal', value: 'x' })
  const fields = [
    field('body.email'),
    field('path.id'),
    field('query.limit'),
    field('header.X-Api-Key'),
    field('body.user.name'),
  ]

  it('sectionOfKey groups prefixed keys; unknown prefixes are unsectioned', () => {
    expect(sectionOfKey('path.id')).toBe('params')
    expect(sectionOfKey('query.limit')).toBe('params')
    expect(sectionOfKey('header.X-Foo')).toBe('headers')
    expect(sectionOfKey('body.user.name')).toBe('body')
    expect(sectionOfKey('weird')).toBeNull()
  })

  it('sectionFields filters by section', () => {
    expect(sectionFields(fields, 'headers').map((f) => f.key)).toEqual(['header.X-Api-Key'])
    expect(sectionFields(fields, 'body').map((f) => f.key)).toEqual(['body.email', 'body.user.name'])
    expect(sectionFields(fields, 'params').map((f) => f.key)).toEqual(['path.id', 'query.limit'])
  })

  it('sectionKey auto-prefixes; dots inside a body name stay the nesting syntax', () => {
    expect(sectionKey('headers', 'X-Internal-Token', '')).toBe('header.X-Internal-Token')
    expect(sectionKey('body', 'user.name', '')).toBe('body.user.name')
    expect(sectionKey('params', 'limit', '/v1/users/{id}')).toBe('query.limit')
    // A name matching a current placeholder becomes a path param instead.
    expect(sectionKey('params', 'id', '/v1/users/{id}')).toBe('path.id')
  })
})

describe('paramRows (plan 08 A2)', () => {
  const field = (key: string, value = 'x'): NodeField => ({ key, source: 'literal', value })

  it('seeds an empty required row per placeholder, backed by the stored field when present', () => {
    const rows = paramRows([field('path.orgId', 'org_1')], '/v1/orgs/{orgId}/members/{id}')
    expect(rows.map((r) => r.field.key)).toEqual(['path.orgId', 'path.id'])
    expect(rows[0].field.value).toBe('org_1')
    expect(rows[1].field.value).toBe('')
    expect(rows.every((r) => r.kind === 'path' && r.required && !r.orphan)).toBe(true)
  })

  it('flags stored path rows whose placeholder left the path as orphans', () => {
    const rows = paramRows([field('path.id')], '/v1/users')
    expect(rows).toHaveLength(1)
    expect(rows[0].orphan).toBe(true)
    expect(rows[0].required).toBe(false)
  })

  it('lists query rows after path rows', () => {
    const rows = paramRows([field('query.limit'), field('path.id')], '/v1/users/{id}')
    expect(rows.map((r) => `${r.kind}:${r.field.key}`)).toEqual(['path:path.id', 'query:query.limit'])
  })
})
