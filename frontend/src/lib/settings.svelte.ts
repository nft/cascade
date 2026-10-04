// User settings (Settings dialog): appearance and behaviour preferences that
// belong to this machine, not to a project. Persisted through prefsStorage;
// project-scoped settings (response capture) stay on the Go side.
import { readJSON, writeJSON } from './prefsStorage'

export const SETTINGS_STORAGE_KEY = 'cascade.settings.v1'

export const THEMES = ['dark', 'light', 'system'] as const
export type Theme = (typeof THEMES)[number]
export type ResolvedTheme = Exclude<Theme, 'system'>

export const CANVAS_GRIDS = ['dots', 'lines', 'cross', 'none'] as const
export type CanvasGrid = (typeof CANVAS_GRIDS)[number]

/** Interface scale steps. Scales the panels and menus only; the canvas has its own zoom. */
export const UI_SCALES = [0.9, 1, 1.1, 1.25] as const
export type UiScale = (typeof UI_SCALES)[number]

export interface Settings {
  theme: Theme
  uiScale: UiScale
  showMinimap: boolean
  canvasGrid: CanvasGrid
  /** Ask before deleting a For container that still holds children. */
  confirmDeleteWithChildren: boolean
}

// Dark stays the default: the light theme is new, and nothing should change
// for existing installs on update.
export const DEFAULT_SETTINGS: Readonly<Settings> = {
  theme: 'dark',
  uiScale: 1,
  showMinimap: true,
  canvasGrid: 'dots',
  confirmDeleteWithChildren: true,
}

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

const oneOf = <T>(options: readonly T[], value: unknown, fallback: T): T =>
  (options as readonly unknown[]).includes(value) ? (value as T) : fallback

const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

/** Coerces anything (stored JSON, a partial patch) into a complete, valid Settings. */
export function sanitizeSettings(value: unknown): Settings {
  const obj = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  return {
    theme: oneOf(THEMES, obj.theme, DEFAULT_SETTINGS.theme),
    uiScale: oneOf(UI_SCALES, obj.uiScale, DEFAULT_SETTINGS.uiScale),
    showMinimap: bool(obj.showMinimap, DEFAULT_SETTINGS.showMinimap),
    canvasGrid: oneOf(CANVAS_GRIDS, obj.canvasGrid, DEFAULT_SETTINGS.canvasGrid),
    confirmDeleteWithChildren: bool(obj.confirmDeleteWithChildren, DEFAULT_SETTINGS.confirmDeleteWithChildren),
  }
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' ? matchMedia(DARK_SCHEME_QUERY).matches : true
}

export class SettingsState {
  theme = $state<Theme>(DEFAULT_SETTINGS.theme)
  uiScale = $state<UiScale>(DEFAULT_SETTINGS.uiScale)
  showMinimap = $state(DEFAULT_SETTINGS.showMinimap)
  canvasGrid = $state<CanvasGrid>(DEFAULT_SETTINGS.canvasGrid)
  confirmDeleteWithChildren = $state(DEFAULT_SETTINGS.confirmDeleteWithChildren)
  /** Mirrors prefers-color-scheme; App.svelte keeps it current via watchSystemTheme. */
  systemDark = $state(systemPrefersDark())

  constructor() {
    this.apply(sanitizeSettings(readJSON(SETTINGS_STORAGE_KEY)))
  }

  /** The theme actually in effect, with 'system' resolved against the OS preference. */
  get resolvedTheme(): ResolvedTheme {
    if (this.theme === 'system') return this.systemDark ? 'dark' : 'light'
    return this.theme
  }

  snapshot(): Settings {
    return {
      theme: this.theme,
      uiScale: this.uiScale,
      showMinimap: this.showMinimap,
      canvasGrid: this.canvasGrid,
      confirmDeleteWithChildren: this.confirmDeleteWithChildren,
    }
  }

  update(patch: Partial<Settings>) {
    this.apply(sanitizeSettings({ ...this.snapshot(), ...patch }))
    writeJSON(SETTINGS_STORAGE_KEY, this.snapshot())
  }

  reset() {
    this.update({ ...DEFAULT_SETTINGS })
  }

  private apply(next: Settings) {
    this.theme = next.theme
    this.uiScale = next.uiScale
    this.showMinimap = next.showMinimap
    this.canvasGrid = next.canvasGrid
    this.confirmDeleteWithChildren = next.confirmDeleteWithChildren
  }
}

export const settings = new SettingsState()
