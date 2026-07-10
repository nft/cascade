// Guards that UI style maps stay exhaustive as unions grow (plan 08 C1) —
// the Record types already enforce this at compile time; this keeps the
// failure visible in test output too, like icons.guard.test.ts.
import { describe, expect, it } from 'vitest'
import { HTTP_METHODS } from './model'
import { methodBadge, methodText, methodTint } from './ui'

describe('methodBadge', () => {
  it('has a badge style for every HTTP method', () => {
    for (const method of HTTP_METHODS) {
      expect(methodBadge[method], method).toMatch(/bg-/)
      expect(methodBadge[method], method).toMatch(/text-/)
    }
  })

  it('splits into text-only and tint-only maps', () => {
    for (const method of HTTP_METHODS) {
      expect(methodText[method], method).toMatch(/^text-/)
      expect(methodTint[method], method).toMatch(/^bg-/)
    }
  })
})
