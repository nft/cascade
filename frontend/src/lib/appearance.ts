// Applies appearance settings to the document: the theme attribute that
// style.css keys its palettes on, and the interface-scale custom property the
// `ui-scaled` utility reads.
import type { ResolvedTheme } from './settings.svelte'

export const THEME_ATTRIBUTE = 'data-theme'
export const UI_SCALE_PROPERTY = '--ui-scale'

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

export function applyAppearance(root: HTMLElement, theme: ResolvedTheme, uiScale: number): void {
  root.setAttribute(THEME_ATTRIBUTE, theme)
  root.style.setProperty(UI_SCALE_PROPERTY, String(uiScale))
}

/** Reports the OS dark-mode preference now and on every change; returns the unsubscribe. */
export function watchSystemTheme(onChange: (dark: boolean) => void): () => void {
  if (typeof matchMedia !== 'function') return () => {}
  const query = matchMedia(DARK_SCHEME_QUERY)
  const handler = (event: MediaQueryListEvent) => onChange(event.matches)
  onChange(query.matches)
  query.addEventListener('change', handler)
  return () => query.removeEventListener('change', handler)
}
