// Response-schema inference (plan 05 §8) — the TypeScript mirror of Go's
// core/schema/infer, sharing its wire shape (SchemaJSON) and rules: sorted
// keys, depth cap, array item schemas merged across elements (union of keys,
// nullable where absent/null), strict format guesses. The frontend infers
// locally so the binding picker works in vitest and plain-browser dev where
// the Go side is absent.
import type { SchemaJSON } from './model'

/** Recursion cap — deeper values infer as an untyped schema. */
export const MAX_INFER_DEPTH = 20

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const DATE_TIME_RE =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/

export function inferSchema(sample: unknown, depth = 0): SchemaJSON {
  if (depth >= MAX_INFER_DEPTH) return {}
  if (sample === null || sample === undefined) return { nullable: true }
  switch (typeof sample) {
    case 'boolean':
      return { type: 'boolean' }
    case 'number':
      return Number.isInteger(sample) && Math.abs(sample) <= Number.MAX_SAFE_INTEGER
        ? { type: 'integer' }
        : { type: 'number' }
    case 'string': {
      const format = guessFormat(sample)
      return format ? { type: 'string', format } : { type: 'string' }
    }
  }
  if (Array.isArray(sample)) {
    let items: SchemaJSON | undefined
    for (const el of sample) {
      const s = inferSchema(el, depth + 1)
      items = items ? mergeSchemas(items, s) : s
    }
    return items ? { type: 'array', items } : { type: 'array' }
  }
  if (typeof sample === 'object') {
    const properties: Record<string, SchemaJSON> = {}
    for (const key of Object.keys(sample).sort()) {
      properties[key] = inferSchema((sample as Record<string, unknown>)[key], depth + 1)
    }
    return { type: 'object', properties }
  }
  return {}
}

function guessFormat(s: string): string | undefined {
  if (UUID_RE.test(s)) return 'uuid'
  if (EMAIL_RE.test(s)) return 'email'
  if (DATE_TIME_RE.test(s)) return 'date-time'
  return undefined
}

function typeSet(t: SchemaJSON['type']): Set<string> {
  if (t === undefined) return new Set()
  return new Set(Array.isArray(t) ? t : [t])
}

function mergeTypes(a: SchemaJSON['type'], b: SchemaJSON['type']): SchemaJSON['type'] {
  const set = typeSet(a)
  for (const t of typeSet(b)) set.add(t)
  // integer is a subset of number; the union of both is just number.
  if (set.has('integer') && set.has('number')) set.delete('integer')
  const types = [...set].sort()
  if (types.length === 0) return undefined
  return types.length === 1 ? types[0] : types
}

/** Merges two element schemas from the same array. */
export function mergeSchemas(a: SchemaJSON, b: SchemaJSON): SchemaJSON {
  const out: SchemaJSON = {}
  const type = mergeTypes(a.type, b.type)
  if (type !== undefined) out.type = type
  if (a.format && a.format === b.format) out.format = a.format
  if (a.nullable || b.nullable) out.nullable = true
  if (a.properties || b.properties) {
    const properties: Record<string, SchemaJSON> = {}
    const keys = [...new Set([...Object.keys(a.properties ?? {}), ...Object.keys(b.properties ?? {})])].sort()
    for (const key of keys) {
      const inA = a.properties?.[key]
      const inB = b.properties?.[key]
      properties[key] =
        inA && inB ? mergeSchemas(inA, inB) : { ...(inA ?? inB)!, nullable: true }
    }
    out.properties = properties
  }
  if (a.items || b.items) {
    out.items = a.items && b.items ? mergeSchemas(a.items, b.items) : (a.items ?? b.items)
  }
  return out
}

// --- picker tree -------------------------------------------------------------

/** One row of the binding picker's response tree. */
export interface SchemaTreeNode {
  /** Display label (a key name or `[0]` for array items). */
  label: string
  /** Accessor path to insert (`body.data.items[0].id`). */
  path: string
  /** Short type annotation for the row (`string · uuid`, `object`). */
  type: string
  children: SchemaTreeNode[]
}

function typeLabel(schema: SchemaJSON): string {
  const types = [...typeSet(schema.type)]
  const base = types.length > 0 ? types.join(' | ') : 'any'
  return schema.format ? `${base} · ${schema.format}` : base
}

function childTree(schema: SchemaJSON, basePath: string): SchemaTreeNode[] {
  const children: SchemaTreeNode[] = []
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    children.push({
      label: key,
      path: `${basePath}.${key}`,
      type: typeLabel(child),
      children: childTree(child, `${basePath}.${key}`),
    })
  }
  if (schema.items) {
    // A sample first element stands in for the whole array in insert paths.
    const path = `${basePath}[0]`
    children.push({
      label: '[0]',
      path,
      type: typeLabel(schema.items),
      children: childTree(schema.items, path),
    })
  }
  return children
}

/**
 * The response tree rows for a node's schema, rooted at `body`. The returned
 * root row is `body` itself so the picker can offer the whole body too.
 */
export function schemaTree(schema: SchemaJSON, basePath = 'body'): SchemaTreeNode {
  return { label: basePath, path: basePath, type: typeLabel(schema), children: childTree(schema, basePath) }
}
