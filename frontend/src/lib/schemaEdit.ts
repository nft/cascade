// Schema editing operations: pure, immutable transforms over
// SchemaJSON, addressed by a path of property/items steps. SchemaEditor.svelte
// renders the tree; every edit routes through these so the result is always a
// valid SchemaJSON that round-trips through schemaTree().
import type { SchemaJSON } from './model'

/** The types the editor's dropdown offers (JSON Schema names). */
export const SCHEMA_TYPES = ['string', 'number', 'integer', 'boolean', 'object', 'array'] as const
export type SchemaType = (typeof SCHEMA_TYPES)[number]

/** One step into a schema: a named property, or an array's items schema. */
export type SchemaPathStep = { kind: 'prop'; key: string } | { kind: 'items' }
export type SchemaPath = readonly SchemaPathStep[]

/** The sub-schema at a path, or null when the path doesn't exist. */
export function schemaAt(root: SchemaJSON, path: SchemaPath): SchemaJSON | null {
  let node: SchemaJSON | undefined = root
  for (const step of path) {
    node = step.kind === 'prop' ? node?.properties?.[step.key] : node?.items
    if (node === undefined) return null
  }
  return node
}

/**
 * Rebuilds the root with `fn` applied to the schema at `path`. Missing
 * intermediate steps make the update a no-op (the tree the editor renders is
 * always derived from the same root, so a miss means a stale event).
 */
export function updateSchemaAt(
  root: SchemaJSON,
  path: SchemaPath,
  fn: (schema: SchemaJSON) => SchemaJSON,
): SchemaJSON {
  if (path.length === 0) return fn(root)
  const [step, ...rest] = path
  if (step.kind === 'items') {
    if (!root.items) return root
    return { ...root, items: updateSchemaAt(root.items, rest, fn) }
  }
  const child = root.properties?.[step.key]
  if (!child) return root
  return {
    ...root,
    properties: { ...root.properties, [step.key]: updateSchemaAt(child, rest, fn) },
  }
}

/**
 * Adds a property to the object schema at `path`. Returns null when the key
 * is empty or already present — the caller surfaces the rejection.
 */
export function addPropertyAt(
  root: SchemaJSON,
  path: SchemaPath,
  key: string,
  child: SchemaJSON = { type: 'string' },
): SchemaJSON | null {
  const target = schemaAt(root, path)
  const name = key.trim()
  if (!target || name === '' || target.properties?.[name] !== undefined) return null
  return updateSchemaAt(root, path, (s) => ({
    ...s,
    type: s.type ?? 'object',
    properties: { ...s.properties, [name]: child },
  }))
}

/**
 * Renames a property of the object at `path`, preserving key order. Returns
 * null when the old key is missing or the new one is empty/taken.
 */
export function renamePropertyAt(
  root: SchemaJSON,
  path: SchemaPath,
  oldKey: string,
  newKey: string,
): SchemaJSON | null {
  const target = schemaAt(root, path)
  const name = newKey.trim()
  if (!target?.properties?.[oldKey] || name === '') return null
  if (name !== oldKey && target.properties[name] !== undefined) return null
  return updateSchemaAt(root, path, (s) => ({
    ...s,
    properties: Object.fromEntries(
      Object.entries(s.properties!).map(([k, v]) => (k === oldKey ? [name, v] : [k, v])),
    ),
  }))
}

/** Removes a property of the object at `path`; a miss is a no-op. */
export function removePropertyAt(root: SchemaJSON, path: SchemaPath, key: string): SchemaJSON {
  return updateSchemaAt(root, path, (s) => {
    if (s.properties?.[key] === undefined) return s
    const properties = { ...s.properties }
    delete properties[key]
    return { ...s, properties }
  })
}

/**
 * Sets the type at `path`, collapsing any union to the single chosen type and
 * dropping facets that no longer apply: only objects keep `properties`, only
 * arrays keep `items` (seeded when absent), only strings keep `format`.
 */
export function setTypeAt(root: SchemaJSON, path: SchemaPath, type: SchemaType): SchemaJSON {
  return updateSchemaAt(root, path, (s) => {
    const next: SchemaJSON = { type }
    if (s.nullable) next.nullable = true
    if (type === 'object') next.properties = s.properties ?? {}
    if (type === 'array') next.items = s.items ?? { type: 'string' }
    if (type === 'string' && s.format) next.format = s.format
    return next
  })
}

/** Sets the string format at `path`; an empty format deletes the facet. */
export function setFormatAt(root: SchemaJSON, path: SchemaPath, format: string): SchemaJSON {
  return updateSchemaAt(root, path, (s) => {
    const next = { ...s }
    if (format.trim() === '') delete next.format
    else next.format = format.trim()
    return next
  })
}

/** Sets or clears the nullable flag at `path`. */
export function setNullableAt(root: SchemaJSON, path: SchemaPath, nullable: boolean): SchemaJSON {
  return updateSchemaAt(root, path, (s) => {
    const next = { ...s }
    if (nullable) next.nullable = true
    else delete next.nullable
    return next
  })
}

/**
 * Merges a freshly inferred schema into a user-edited one ("merge with
 * existing"): the existing schema wins every conflict — type,
 * format, nullable, and any property it already describes keep the user's
 * edits (deliberately stricter than mergeSchemas, which unions types) —
 * while properties/items only the new inference knows are added.
 */
export function mergeInferred(existing: SchemaJSON, inferred: SchemaJSON): SchemaJSON {
  const out: SchemaJSON = { ...existing }
  if (existing.properties || inferred.properties) {
    const properties: Record<string, SchemaJSON> = {}
    for (const [key, child] of Object.entries(existing.properties ?? {})) {
      const other = inferred.properties?.[key]
      properties[key] = other ? mergeInferred(child, other) : child
    }
    for (const [key, child] of Object.entries(inferred.properties ?? {})) {
      if (properties[key] === undefined) properties[key] = child
    }
    out.properties = properties
  }
  if (existing.items || inferred.items) {
    out.items =
      existing.items && inferred.items
        ? mergeInferred(existing.items, inferred.items)
        : (existing.items ?? inferred.items)
  }
  return out
}
