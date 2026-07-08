// Request-shape helpers (plan 08 A1/A2): URL assembly for custom origins,
// method/body rules, and the sectioned-editor grouping of prefixed field
// keys. Pure and unit-tested, like graph.ts/refs.ts.
import type { HttpMethod, NodeField } from './model'

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

// --- sectioned editor (plan 08 A2) ------------------------------------------
// Field keys keep their storage prefixes (body./path./query./header., plan 05);
// the editor only groups them, so bindings and the engine see no change.

export type RequestSectionId = 'params' | 'headers' | 'body'

export type ParamKind = 'path' | 'query'

const SECTION_PREFIXES: Record<RequestSectionId, readonly string[]> = {
  params: ['path.', 'query.'],
  headers: ['header.'],
  body: ['body.'],
}

export function sectionOfKey(key: string): RequestSectionId | null {
  for (const [section, prefixes] of Object.entries(SECTION_PREFIXES)) {
    if (prefixes.some((p) => key.startsWith(p))) return section as RequestSectionId
  }
  return null
}

export function sectionFields(fields: readonly NodeField[], section: RequestSectionId): NodeField[] {
  return fields.filter((f) => sectionOfKey(f.key) === section)
}

/**
 * The stored key for a name typed into a section's add box. Params default
 * to query; a name matching a current path placeholder becomes a path param
 * instead. Dots inside the name stay legal — in Body they are the nesting
 * syntax (`user.name` → `body.user.name` → `{"user":{"name":…}}`).
 */
export function sectionKey(section: RequestSectionId, name: string, path: string): string {
  if (section === 'headers') return `header.${name}`
  if (section === 'body') return `body.${name}`
  return pathPlaceholders(path).includes(name) ? `path.${name}` : `query.${name}`
}

/** One Params-tab row: a stored field or a placeholder-derived empty row. */
export interface ParamRow {
  field: NodeField
  kind: ParamKind
  /** Placeholder-backed row that must be filled for the request to run. */
  required: boolean
  /** Stored path.* row whose placeholder left the path — flagged, never silently deleted. */
  orphan: boolean
}

/**
 * The Params rows for a node, derived (not stored): one row per current path
 * placeholder — backed by the stored `path.<name>` field when present, an
 * empty literal otherwise, so a `/v1/users/{id}` node always shows an `id`
 * row and editing the path re-seeds rows with nothing persisted until the
 * user types a value. Stored path rows without a placeholder follow, marked
 * orphan; query rows come last.
 */
export function paramRows(fields: readonly NodeField[], path: string): ParamRow[] {
  const placeholders = pathPlaceholders(path)
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const rows: ParamRow[] = placeholders.map((name) => ({
    field: byKey.get(`path.${name}`) ?? { key: `path.${name}`, source: 'literal', value: '' },
    kind: 'path',
    required: true,
    orphan: false,
  }))
  for (const field of fields) {
    if (field.key.startsWith('path.') && !placeholders.includes(field.key.slice('path.'.length))) {
      rows.push({ field, kind: 'path', required: false, orphan: true })
    }
  }
  for (const field of fields) {
    if (field.key.startsWith('query.')) {
      rows.push({ field, kind: 'query', required: false, orphan: false })
    }
  }
  return rows
}
