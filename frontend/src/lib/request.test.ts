import { describe, expect, it } from 'vitest'
import {
  effectiveBaseUrl,
  isAbsoluteUrl,
  joinUrl,
  methodAllowsBody,
  normalizeOrigin,
  pathPlaceholders,
  urlHost,
} from './request'
import { HTTP_METHODS } from './model'

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
