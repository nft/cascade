// Window-layout preferences: whether the sidebar panel is open and how wide
// it is. Per-machine UI state, so it lives in localStorage (prefsStorage)
// rather than in workspace files.
import { readJSON, writeJSON } from './prefsStorage'

export const SIDEBAR_DEFAULT_WIDTH_PX = 256
export const SIDEBAR_MIN_WIDTH_PX = 200
export const SIDEBAR_MAX_WIDTH_PX = 480

export const LAYOUT_STORAGE_KEY = 'cascade.layout.v1'

export interface LayoutPrefs {
  sidebarOpen: boolean
  sidebarWidth: number
}

export const DEFAULT_LAYOUT_PREFS: Readonly<LayoutPrefs> = {
  sidebarOpen: true,
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH_PX,
}

export function clampSidebarWidth(px: number): number {
  if (!Number.isFinite(px)) return SIDEBAR_DEFAULT_WIDTH_PX
  return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, Math.round(px)))
}

function sanitize(value: unknown): LayoutPrefs {
  const obj = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  return {
    sidebarOpen: typeof obj.sidebarOpen === 'boolean' ? obj.sidebarOpen : DEFAULT_LAYOUT_PREFS.sidebarOpen,
    sidebarWidth:
      typeof obj.sidebarWidth === 'number' ? clampSidebarWidth(obj.sidebarWidth) : DEFAULT_LAYOUT_PREFS.sidebarWidth,
  }
}

export function loadLayoutPrefs(): LayoutPrefs {
  return sanitize(readJSON(LAYOUT_STORAGE_KEY))
}

export function saveLayoutPrefs(prefs: LayoutPrefs): void {
  writeJSON(LAYOUT_STORAGE_KEY, prefs)
}
