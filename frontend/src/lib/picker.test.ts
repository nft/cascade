import { describe, expect, it } from 'vitest'
import { arrayPaths } from './picker'
import { inferSchema } from './schema'

describe('arrayPaths (plan 09 N6)', () => {
  it('keeps only array-typed paths, including arrays nested under [0]', () => {
    const schema = inferSchema({
      name: 'ada',
      users: [{ id: 1, tags: ['a'] }],
      meta: { pages: [1, 2] },
    })
    expect(arrayPaths(schema).map((o) => o.path)).toEqual([
      'body.meta.pages',
      'body.users',
      'body.users[0].tags',
    ])
  })

  it('offers the whole body when the response itself is an array', () => {
    expect(arrayPaths(inferSchema([1, 2, 3])).map((o) => o.path)).toContain('body')
  })

  it('returns nothing for a scalar-only schema', () => {
    expect(arrayPaths(inferSchema({ id: 'x', n: 4 }))).toEqual([])
  })
})
