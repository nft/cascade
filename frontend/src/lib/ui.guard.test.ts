// Guards that UI style maps stay exhaustive as unions grow (plan 08 C1) —
// the Record types already enforce this at compile time; this keeps the
// failure visible in test output too, like icons.guard.test.ts.
import { describe, expect, it } from 'vitest'
import { HTTP_METHODS } from './model'
import { methodBadge } from './ui'

describe('methodBadge', () => {
  it('has a badge style for every HTTP method', () => {
    for (const method of HTTP_METHODS) {
      expect(methodBadge[method], method).toMatch(/bg-/)
    }
  })
})
