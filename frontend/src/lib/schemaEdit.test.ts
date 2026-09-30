import { describe, expect, it } from 'vitest'
import type { SchemaJSON } from './model'
import { inferSchema, schemaTree } from './schema'
import {
  addPropertyAt,
  mergeInferred,
  removePropertyAt,
  renamePropertyAt,
  schemaAt,
  setFormatAt,
  setNullableAt,
  setTypeAt,
  updateSchemaAt,
  type SchemaPath,
} from './schemaEdit'

const base = (): SchemaJSON => ({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    amount: { type: 'integer' },
    customer: { type: 'object', properties: { email: { type: 'string', format: 'email' } } },
    lines: { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' } } } },
  },
})

const at = (...steps: (string | 0)[]): SchemaPath =>
  steps.map((s) => (s === 0 ? { kind: 'items' as const } : { kind: 'prop' as const, key: s }))

describe('schema path addressing', () => {
  it('schemaAt walks properties and items; misses return null', () => {
    expect(schemaAt(base(), at('customer', 'email'))?.format).toBe('email')
    expect(schemaAt(base(), at('lines', 0, 'sku'))?.type).toBe('string')
    expect(schemaAt(base(), at('nope'))).toBeNull()
    expect(schemaAt(base(), at('id', 0))).toBeNull()
  })

  it('updateSchemaAt rebuilds only the path; the original is untouched', () => {
    const root = base()
    const next = updateSchemaAt(root, at('customer', 'email'), (s) => ({ ...s, nullable: true }))
    expect(schemaAt(next, at('customer', 'email'))?.nullable).toBe(true)
    expect(schemaAt(root, at('customer', 'email'))?.nullable).toBeUndefined()
    // Untouched siblings keep their identity (no needless clones).
    expect(next.properties!.lines).toBe(root.properties!.lines)
  })
})

describe('schema edit operations', () => {
  it('add/rename/remove property, preserving key order on rename', () => {
    let root = addPropertyAt(base(), [], 'status')!
    expect(schemaAt(root, at('status'))).toEqual({ type: 'string' })
    expect(addPropertyAt(root, [], 'status')).toBeNull() // duplicate
    expect(addPropertyAt(root, [], '  ')).toBeNull()

    root = renamePropertyAt(root, [], 'status', 'state')!
    expect(Object.keys(root.properties!)).toEqual(['id', 'amount', 'customer', 'lines', 'state'])
    expect(renamePropertyAt(root, [], 'state', 'id')).toBeNull() // taken

    root = removePropertyAt(root, [], 'state')
    expect(schemaAt(root, at('state'))).toBeNull()
  })

  it('nested adds land inside arrays via the items step', () => {
    const root = addPropertyAt(base(), at('lines', 0), 'qty', { type: 'integer' })!
    expect(schemaAt(root, at('lines', 0, 'qty'))).toEqual({ type: 'integer' })
  })

  it('setTypeAt drops facets that no longer apply and seeds object/array shells', () => {
    let root = setTypeAt(base(), at('customer'), 'string')
    expect(schemaAt(root, at('customer'))).toEqual({ type: 'string' })

    root = setTypeAt(base(), at('id'), 'array')
    expect(schemaAt(root, at('id'))).toEqual({ type: 'array', items: { type: 'string' } })

    root = setTypeAt(base(), at('amount'), 'object')
    expect(schemaAt(root, at('amount'))).toEqual({ type: 'object', properties: {} })

    // A union type collapses to the picked type; nullable survives.
    const union: SchemaJSON = { type: ['string', 'number'], nullable: true }
    expect(setTypeAt(union, [], 'string')).toEqual({ type: 'string', nullable: true })
  })

  it('setFormatAt and setNullableAt set and clear their facets', () => {
    let root = setFormatAt(base(), at('id'), 'date-time')
    expect(schemaAt(root, at('id'))?.format).toBe('date-time')
    root = setFormatAt(root, at('id'), '')
    expect(schemaAt(root, at('id'))?.format).toBeUndefined()

    root = setNullableAt(root, at('amount'), true)
    expect(schemaAt(root, at('amount'))?.nullable).toBe(true)
    root = setNullableAt(root, at('amount'), false)
    expect(schemaAt(root, at('amount'))?.nullable).toBeUndefined()
  })

  it('every edit result round-trips through schemaTree', () => {
    let root = addPropertyAt(base(), at('customer'), 'name')!
    root = setTypeAt(root, at('customer', 'name'), 'array')
    root = setTypeAt(root, at('customer', 'name', 0), 'object')
    root = addPropertyAt(root, at('customer', 'name', 0), 'given')!
    const tree = schemaTree(root)
    const paths: string[] = []
    const walk = (n: ReturnType<typeof schemaTree>) => {
      paths.push(n.path)
      n.children.forEach(walk)
    }
    walk(tree)
    expect(paths).toContain('body.customer.name[0].given')
  })
})

describe('mergeInferred (merge with existing)', () => {
  it('user edits win over re-inference; new keys are added', () => {
    // User inferred once, then fixed a format, retyped a field, and deleted noise.
    const edited: SchemaJSON = {
      type: 'object',
      properties: {
        created: { type: 'string', format: 'date-time' }, // user fixed the format
        amount: { type: 'number' }, // user widened integer → number
      },
    }
    const reInferred = inferSchema({ created: 'yesterday', amount: 7, trace: 'abc' })
    const merged = mergeInferred(edited, reInferred)
    expect(merged.properties!.created).toEqual({ type: 'string', format: 'date-time' })
    expect(merged.properties!.amount).toEqual({ type: 'number' })
    expect(merged.properties!.trace).toEqual({ type: 'string' }) // new key added
  })

  it('recurses into shared objects and array items', () => {
    const edited: SchemaJSON = {
      type: 'object',
      properties: {
        lines: { type: 'array', items: { type: 'object', properties: { sku: { type: 'string', format: 'uuid' } } } },
      },
    }
    const inferred = inferSchema({ lines: [{ sku: 'x', qty: 2 }] })
    const merged = mergeInferred(edited, inferred)
    expect(schemaAt(merged, at('lines', 0, 'sku'))?.format).toBe('uuid')
    expect(schemaAt(merged, at('lines', 0, 'qty'))?.type).toBe('integer')
  })
})
