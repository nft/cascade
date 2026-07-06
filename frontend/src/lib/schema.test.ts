import { describe, expect, it } from 'vitest'
import { inferSchema, schemaTree } from './schema'

describe('inferSchema (TS mirror of core/schema/infer, plan 05 §8)', () => {
  it('infers nested objects and arrays with sorted keys', () => {
    const schema = inferSchema({
      data: { items: [{ id: 'a1', score: 1 }, { id: 'a2', score: 2.5 }] },
    })
    expect(schema).toEqual({
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: { id: { type: 'string' }, score: { type: 'number' } },
              },
            },
          },
        },
      },
    })
  })

  it('merges mixed-type array elements into a sorted type union', () => {
    const schema = inferSchema({ values: [1, 'two', 3.5, true] })
    expect(schema.properties?.values.items?.type).toEqual(['boolean', 'number', 'string'])
  })

  it('marks keys absent or null in some elements as nullable', () => {
    const schema = inferSchema({
      members: [
        { id: 1, nickname: 'ada', email: null },
        { id: 2, email: 'grace@example.com' },
      ],
    })
    const items = schema.properties?.members.items
    expect(items?.properties?.id).toEqual({ type: 'integer' })
    expect(items?.properties?.nickname).toEqual({ type: 'string', nullable: true })
    expect(items?.properties?.email).toEqual({ type: 'string', nullable: true })
  })

  it('guesses formats strictly', () => {
    const schema = inferSchema({
      id: '3f2a8c1e-1b2d-4e5f-8a9b-0c1d2e3f4a5b',
      email: 'ada@example.com',
      created_at: '2026-07-06T14:02:11Z',
      almost: 'not-an-email@',
    })
    expect(schema.properties?.id.format).toBe('uuid')
    expect(schema.properties?.email.format).toBe('email')
    expect(schema.properties?.created_at.format).toBe('date-time')
    expect(schema.properties?.almost.format).toBeUndefined()
  })

  it('caps recursion depth', () => {
    let v: unknown = 'leaf'
    for (let i = 0; i < 40; i++) v = { child: v }
    expect(() => inferSchema(v)).not.toThrow()
  })
})

describe('schemaTree (picker rows)', () => {
  it('builds insertable accessor paths, arrays via [0]', () => {
    const tree = schemaTree(inferSchema({ items: [{ id: 'x' }], name: 'a' }))
    expect(tree.path).toBe('body')
    const items = tree.children.find((c) => c.label === 'items')!
    expect(items.path).toBe('body.items')
    expect(items.children[0].path).toBe('body.items[0]')
    expect(items.children[0].children[0].path).toBe('body.items[0].id')
    expect(tree.children.find((c) => c.label === 'name')!.type).toBe('string')
  })
})
