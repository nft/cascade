// Request-shape helpers (plan 08 A1): URL assembly for custom origins and
// method/body rules, shared by the request editor, validation, and the
// runner preview. Pure and unit-tested, like graph.ts/refs.ts.
import type { HttpMethod } from './model'

/**
 * Methods that never carry a request body. DELETE/OPTIONS deliberately allow
 * one — RFC semantics are undefined but real APIs (Elasticsearch bulk
 * deletes, batch endpoints) require DELETE bodies.
 */
const BODYLESS_METHODS: ReadonlySet<HttpMethod> = new Set(['GET', 'HEAD'])

export function methodAllowsBody(method: HttpMethod): boolean {
  return !BODYLESS_METHODS.has(method)
}

/** True when the value is an absolute http(s) URL, i.e. carries its own origin. */
export function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

/**
 * Normalizes a node origin for storage: trims whitespace and trailing
 * slashes. Returns null for anything that is not an absolute http(s) URL
 * with a host — the caller decides how to surface the error.
 */
export function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!isAbsoluteUrl(trimmed)) return null
  try {
    return new URL(trimmed).host ? trimmed : null
  } catch {
    return null
  }
}

/** Joins a base URL and a path with exactly one slash at the seam. */
export function joinUrl(base: string, path: string): string {
  const cleanBase = base.replace(/\/+$/, '')
  if (!path) return cleanBase
  return cleanBase + (path.startsWith('/') ? path : `/${path}`)
}

/** The base a node actually targets: its origin override, else the environment's. */
export function effectiveBaseUrl(origin: string | undefined, envBaseUrl: string): string {
  return origin || envBaseUrl
}

/** The host of an absolute URL, or null when it does not parse as one. */
export function urlHost(value: string): string | null {
  if (!isAbsoluteUrl(value)) return null
  try {
    return new URL(value.trim()).host || null
  } catch {
    return null
  }
}

/**
 * Placeholder names in a path (`/v1/users/{id}` → `['id']`), in order of
 * appearance, deduplicated; empty/blank braces are ignored.
 */
export function pathPlaceholders(path: string): string[] {
  const names: string[] = []
  for (const match of path.matchAll(/\{([^{}]+)\}/g)) {
    const name = match[1].trim()
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}
