// Guards that the ui/ variant maps stay exhaustive and carry the CSS axes
// they are supposed to own — same style as ui.guard.test.ts.
import { describe, expect, it } from 'vitest'
import {
  BUTTON_SIZE,
  BUTTON_VARIANT,
  FIELD_BG,
  FIELD_BORDER,
  FIELD_SIZE,
  FIELD_TONE,
  ICON_BUTTON_TONE,
  SELECT_CHEVRON_PAD,
  fieldClass,
} from './classes'

describe('field maps', () => {
  it('every size owns padding, radius, and text size', () => {
    for (const [size, cls] of Object.entries(FIELD_SIZE)) {
      expect(cls, size).toMatch(/px-/)
      expect(cls, size).toMatch(/py-/)
      expect(cls, size).toMatch(/rounded/)
      expect(cls, size).toMatch(/text-/)
    }
  })

  it('every surface owns a background and border color', () => {
    for (const [surface, cls] of Object.entries(FIELD_BG)) expect(cls, surface).toMatch(/bg-/)
    for (const [surface, cls] of Object.entries(FIELD_BORDER)) expect(cls, surface).toMatch(/border-/)
  })

  it('every non-default tone replaces the border color', () => {
    for (const [tone, cls] of Object.entries(FIELD_TONE)) expect(cls, tone).toMatch(/border-/)
  })

  it('every size reserves a chevron gutter', () => {
    for (const [size, cls] of Object.entries(SELECT_CHEVRON_PAD)) expect(cls, size).toMatch(/pr-/)
  })

  it('fieldClass emits the resting border-color axis exactly once', () => {
    for (const tone of ['default', 'error', 'accent'] as const) {
      const cls = fieldClass('md', 'raised', tone, false)
      // (^| ) keeps variant-prefixed classes like focus:border-* out of the count
      expect(cls.match(/(^| )border-(zinc|rose|violet)/g), tone).toHaveLength(1)
    }
  })
})

describe('button maps', () => {
  it('every variant owns radius and a color treatment', () => {
    for (const [variant, cls] of Object.entries(BUTTON_VARIANT)) {
      expect(cls, variant).toMatch(/rounded/)
      expect(cls, variant).toMatch(/bg-|text-/)
    }
  })

  it('every size owns padding, gap, and text size', () => {
    for (const [size, cls] of Object.entries(BUTTON_SIZE)) {
      expect(cls, size).toMatch(/px-/)
      expect(cls, size).toMatch(/gap-/)
      expect(cls, size).toMatch(/text-/)
    }
  })

  it('every icon-button tone owns a text color', () => {
    for (const [tone, cls] of Object.entries(ICON_BUTTON_TONE)) expect(cls, tone).toMatch(/text-/)
  })
})
