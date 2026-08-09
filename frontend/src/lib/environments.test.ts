import { describe, expect, it } from 'vitest'
import { environmentRefCount, isDanglingEnvironment, nextDefaults } from './environments'
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
