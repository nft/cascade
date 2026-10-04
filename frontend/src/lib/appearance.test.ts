import { describe, expect, it, vi } from 'vitest'
import { THEME_ATTRIBUTE, UI_SCALE_PROPERTY, applyAppearance, watchSystemTheme } from './appearance'

describe('applyAppearance', () => {
  it('writes the theme attribute and the scale property on the root', () => {
    const root = document.createElement('div')
    applyAppearance(root, 'light', 1.25)
    expect(root.getAttribute(THEME_ATTRIBUTE)).toBe('light')
    expect(root.style.getPropertyValue(UI_SCALE_PROPERTY)).toBe('1.25')
  })
})

describe('watchSystemTheme', () => {
  it('reports the current preference at once and unsubscribes cleanly', () => {
    const onChange = vi.fn()
    const stop = watchSystemTheme(onChange)
    // test-setup's matchMedia polyfill never matches, so the OS reads as light.
    expect(onChange).toHaveBeenCalledWith(false)
    expect(() => stop()).not.toThrow()
  })
})
