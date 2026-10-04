import { beforeEach, describe, expect, it } from 'vitest'
import { readJSON } from './prefsStorage'
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, SettingsState, sanitizeSettings } from './settings.svelte'

beforeEach(() => localStorage.clear())

describe('sanitizeSettings', () => {
  it('fills defaults for missing, malformed and unknown values', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings({ theme: 'sepia', uiScale: 3, showMinimap: 'no', canvasGrid: 'hex' })).toEqual(
      DEFAULT_SETTINGS,
    )
  })

  it('keeps every valid value', () => {
    const valid = { theme: 'light', uiScale: 1.25, showMinimap: false, canvasGrid: 'none', confirmDeleteWithChildren: false }
    expect(sanitizeSettings(valid)).toEqual(valid)
  })
})

describe('SettingsState', () => {
  it('starts from what is stored, defaulting the rest', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ theme: 'light', canvasGrid: 'lines' }))
    const state = new SettingsState()
    expect(state.theme).toBe('light')
    expect(state.canvasGrid).toBe('lines')
    expect(state.showMinimap).toBe(true)
  })

  it('update persists the whole snapshot and drops invalid fields', () => {
    const state = new SettingsState()
    state.update({ showMinimap: false, uiScale: 7 as never })
    expect(state.showMinimap).toBe(false)
    expect(state.uiScale).toBe(DEFAULT_SETTINGS.uiScale)
    expect(readJSON(SETTINGS_STORAGE_KEY)).toEqual({ ...DEFAULT_SETTINGS, showMinimap: false })
  })

  it('resolves the system theme against the OS preference', () => {
    const state = new SettingsState()
    state.update({ theme: 'system' })
    state.systemDark = false
    expect(state.resolvedTheme).toBe('light')
    state.systemDark = true
    expect(state.resolvedTheme).toBe('dark')
    state.update({ theme: 'light' })
    expect(state.resolvedTheme).toBe('light')
  })

  it('reset returns to the defaults and persists them', () => {
    const state = new SettingsState()
    state.update({ theme: 'light', confirmDeleteWithChildren: false })
    state.reset()
    expect(state.snapshot()).toEqual(DEFAULT_SETTINGS)
    expect(readJSON(SETTINGS_STORAGE_KEY)).toEqual(DEFAULT_SETTINGS)
  })
})
