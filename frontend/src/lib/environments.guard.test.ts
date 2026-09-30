// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NO_TARGET_MESSAGE, unknownEnvironmentMessage } from './environments'

// The inspector says at edit time what nodespec says at run time, in the same
// words. Two copies of one sentence drift silently, so this
// pins the TS constants to the Go ones they were copied from.
const HTTPBUILD_GO = fileURLToPath(new URL('../../../core/nodespec/httpbuild.go', import.meta.url))

function goConst(source: string, name: string): string {
  const match = source.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`))
  if (!match) throw new Error(`${name} not found in httpbuild.go`)
  return match[1]
}

describe('target messages match nodespec', () => {
  const source = readFileSync(HTTPBUILD_GO, 'utf8')

  it('reads the Go constants', () => {
    expect(source).toContain('noTargetMessage')
  })

  it('uses nodespec.noTargetMessage verbatim', () => {
    expect(NO_TARGET_MESSAGE).toBe(goConst(source, 'noTargetMessage'))
  })

  it('formats nodespec.unknownEnvFormat the way Go %q does', () => {
    const expected = goConst(source, 'unknownEnvFormat').replace('%q', '"staging"')
    expect(unknownEnvironmentMessage('staging')).toBe(expected)
  })
})
