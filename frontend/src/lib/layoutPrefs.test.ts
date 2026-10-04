import { beforeEach, describe, expect, it } from 'vitest'
import {
  clampSidebarWidth,
  DEFAULT_LAYOUT_PREFS,
  LAYOUT_STORAGE_KEY,
  loadLayoutPrefs,
  saveLayoutPrefs,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
} from './layoutPrefs'

beforeEach(() => localStorage.clear())

describe('clampSidebarWidth', () => {
  it('keeps the width inside the min/max band and on whole pixels', () => {
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN_WIDTH_PX)
    expect(clampSidebarWidth(10_000)).toBe(SIDEBAR_MAX_WIDTH_PX)
    expect(clampSidebarWidth(300.6)).toBe(301)
  })

  it('falls back to the default width for non-finite input', () => {
    expect(clampSidebarWidth(Number.NaN)).toBe(DEFAULT_LAYOUT_PREFS.sidebarWidth)
  })
})

describe('layout prefs storage', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(loadLayoutPrefs()).toEqual(DEFAULT_LAYOUT_PREFS)
  })

  it('round-trips saved prefs', () => {
    saveLayoutPrefs({ sidebarOpen: false, sidebarWidth: 320 })
    expect(loadLayoutPrefs()).toEqual({ sidebarOpen: false, sidebarWidth: 320 })
  })

  it('sanitizes malformed or out-of-range stored values', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, '{"sidebarOpen":"yes","sidebarWidth":5}')
    expect(loadLayoutPrefs()).toEqual({ sidebarOpen: true, sidebarWidth: SIDEBAR_MIN_WIDTH_PX })
    localStorage.setItem(LAYOUT_STORAGE_KEY, 'not json')
    expect(loadLayoutPrefs()).toEqual(DEFAULT_LAYOUT_PREFS)
  })
})
