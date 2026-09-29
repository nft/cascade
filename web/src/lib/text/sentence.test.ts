import { describe, expect, it } from 'vitest'
import { firstSentence } from './sentence'

describe('firstSentence', () => {
  it('stops at the first sentence break', () => {
    expect(firstSentence('Real runs from Go. Watch states change.')).toBe('Real runs from Go.')
  })

  it('ignores periods inside code spans and before lowercase', () => {
    expect(firstSentence('Fill `{{a.B.id}}` with e.g. values. Next one.')).toBe('Fill `{{a.B.id}}` with e.g. values.')
  })

  it('returns single sentences whole', () => {
    expect(firstSentence('Mock nodes emit fixture JSON.')).toBe('Mock nodes emit fixture JSON.')
  })
})
