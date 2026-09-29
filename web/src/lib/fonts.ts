import { ICONS } from './icons'

const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2'

/** Figtree for text, JetBrains Mono for code; both variable, weight axis only. */
export const TEXT_FONTS_URL = `${GOOGLE_FONTS_CSS}?family=Figtree:wght@300..800&family=JetBrains+Mono:wght@400..600&display=swap`

// Optical size and weight stay variable; fill switches outline/solid.
const ICON_AXES = 'opsz,wght,FILL,GRAD@20..48,300..600,0..1,0'

/**
 * Material Symbols Rounded, subset to the given glyphs. Google rejects the
 * request unless icon_names is sorted, and `block` keeps ligature names from
 * flashing as text before the font arrives.
 */
export function iconFontUrl(names: readonly string[] = ICONS): string {
  const sorted = [...new Set(names)].sort()
  return `${GOOGLE_FONTS_CSS}?family=Material+Symbols+Rounded:${ICON_AXES}&icon_names=${sorted.join(',')}&display=block`
}
