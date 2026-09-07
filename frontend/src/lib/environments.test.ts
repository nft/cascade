import { describe, expect, it } from 'vitest'
import {
  environmentFromDraft,
  environmentRefCount,
  isDanglingEnvironment,
  NO_TARGET_MESSAGE,
  nextDefaults,
  targetProblem,
  unknownEnvironmentMessage,
  validateEnvironmentDraft,
} from './environments'
import type { EnvironmentDef } from './model'

const local: EnvironmentDef = { name: 'local', baseUrl: 'http://localhost:8080' }
const staging: EnvironmentDef = { name: 'staging', baseUrl: 'https://staging.example.com/v1' }

describe('isDanglingEnvironment', () => {
  it('accepts a live name, and an absent one — a node may target nothing yet', () => {
    expect(isDanglingEnvironment([local], 'local')).toBe(false)
    expect(isDanglingEnvironment([local], '')).toBe(false)
    expect(isDanglingEnvironment([local], undefined)).toBe(false)
  })

  it('flags a name the list no longer holds', () => {
    expect(isDanglingEnvironment([local], 'staging')).toBe(true)
    expect(isDanglingEnvironment([], 'local')).toBe(true)
  })
})

describe('environmentRefCount', () => {
  it('counts only the nodes targeting that name', () => {
    const nodes = [
      { data: { environment: 'local' } },
      { data: { environment: 'local' } },
      { data: { environment: 'staging' } },
      { data: {} },
    ]
    expect(environmentRefCount(nodes, 'local')).toBe(2)
    expect(environmentRefCount(nodes, 'prod')).toBe(0)
  })
})

describe('validateEnvironmentDraft', () => {
  const none = new Set<string>()

  it('accepts a name and an absolute base URL', () => {
    expect(validateEnvironmentDraft({ name: 'local', baseUrl: 'http://localhost:8080' }, none)).toBeNull()
    expect(validateEnvironmentDraft({ name: 'api', baseUrl: 'https://api.example.com/v1' }, none)).toBeNull()
  })

  it('requires a name, and rejects one another environment already holds', () => {
    expect(validateEnvironmentDraft({ name: '  ', baseUrl: 'http://x.io' }, none)).toMatch(/name/)
    expect(
      validateEnvironmentDraft({ name: 'local', baseUrl: 'http://x.io' }, new Set(['local'])),
    ).toMatch(/already exists/)
  })

  it('requires a base URL that carries its own origin', () => {
    expect(validateEnvironmentDraft({ name: 'local', baseUrl: '' }, none)).toMatch(/required/)
    expect(validateEnvironmentDraft({ name: 'local', baseUrl: '/v1' }, none)).toMatch(/absolute/)
    expect(validateEnvironmentDraft({ name: 'local', baseUrl: 'localhost:8080' }, none)).toMatch(/absolute/)
  })
})

describe('environmentFromDraft', () => {
  it('trims the name and drops trailing slashes, keeping a path prefix', () => {
    expect(environmentFromDraft({ name: ' api ', baseUrl: ' https://api.example.com/v1/ ' })).toEqual({
      name: 'api',
      baseUrl: 'https://api.example.com/v1',
    })
  })
})

describe('nextDefaults', () => {
  it('claims the default for the first environment there is', () => {
    expect(nextDefaults({}, [local])).toEqual({ environment: 'local' })
    expect(nextDefaults(undefined, [local])).toEqual({ environment: 'local' })
  })

  it('leaves a still-valid default alone when another environment is added', () => {
    expect(nextDefaults({ environment: 'local' }, [local, staging])).toEqual({ environment: 'local' })
  })

  it('hands the default to what remains when the default one is deleted', () => {
    expect(nextDefaults({ environment: 'local' }, [staging])).toEqual({ environment: 'staging' })
  })

  it('clears the default only when the last environment goes', () => {
    expect(nextDefaults({ environment: 'local' }, [])).toEqual({ environment: '' })
  })

  it('honours an explicit pick and ignores one that is not in the list', () => {
    expect(nextDefaults({ environment: 'local' }, [local, staging], 'staging')).toEqual({
      environment: 'staging',
    })
    expect(nextDefaults({ environment: 'local' }, [local, staging], 'ghost')).toEqual({
      environment: 'local',
    })
  })

  it('carries the credential default through untouched', () => {
    expect(nextDefaults({ environment: 'local', credential: 'admin' }, [staging])).toEqual({
      environment: 'staging',
      credential: 'admin',
    })
  })
})

describe('targetProblem', () => {
  const node = (over: Partial<{ path: string; origin: string; environment: string }> = {}) => ({
    path: '/v1/users',
    origin: '',
    environment: '',
    ...over,
  })

  it('passes a node whose environment resolves to a base URL', () => {
    expect(targetProblem([local], node({ environment: 'local' }))).toBeNull()
  })

  it('names the missing target when the node has no environment', () => {
    expect(targetProblem([local], node())).toBe(NO_TARGET_MESSAGE)
  })

  it('names the environment when it is deleted or has no base URL', () => {
    expect(targetProblem([], node({ environment: 'local' }))).toBe(unknownEnvironmentMessage('local'))
    expect(targetProblem([{ name: 'local', baseUrl: '' }], node({ environment: 'local' }))).toBe(
      unknownEnvironmentMessage('local'),
    )
  })

  it('passes either way a node carries its own origin, as BuildRequest does', () => {
    expect(targetProblem([], node({ origin: 'https://api.other.io' }))).toBeNull()
    expect(targetProblem([], node({ path: 'https://api.other.io/v1/x' }))).toBeNull()
  })

  it('does not let an origin override rescue a blank one', () => {
    expect(targetProblem([], node({ origin: '   ' }))).toBe(NO_TARGET_MESSAGE)
  })
})
