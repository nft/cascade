// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { danglingFieldMessage } from './refs'

// The inspector flags a cut binding in the words the engine refuses it with.
// Two copies of one sentence drift silently, so this pins the TS message to
// the Go format it was copied from.
const FIELD_GO = fileURLToPath(new URL('../../../core/nodespec/field.go', import.meta.url))

function goConst(source: string, name: string): string {
  const match = source.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`))
  if (!match) throw new Error(`${name} not found in field.go`)
  return match[1]
}

describe('dangling field message matches nodespec', () => {
  const source = readFileSync(FIELD_GO, 'utf8')

  it('formats nodespec.danglingFormat the way Go %s does', () => {
    const expected = goConst(source, 'danglingFormat').replace('%s', 'createOrg.body.items[0].id')
    expect(danglingFieldMessage({ originalKey: 'createOrg', path: 'body.items[0].id' })).toBe(expected)
  })
})
