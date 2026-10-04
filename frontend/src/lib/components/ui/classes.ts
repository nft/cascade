// Variant vocabulary for the ui/ primitives (Input, Select, Textarea, Field,
// Button, IconButton). These maps own every conflicting CSS axis — padding,
// radius, font-size, background, border color, text color, font family — so a
// component never emits two utilities for the same property and call sites
// stay free of styling. Call sites may only pass LAYOUT classes through the
// `class` prop (w-full, flex-1, min-w-0, mt-1, shrink-0, …).

export type FieldSize = 'md' | 'dense' | 'sm' | 'xs' | '2xs'
export type FieldSurface = 'base' | 'raised' | 'popover'
export type FieldTone = 'default' | 'error' | 'accent'

export const FIELD_BASE = 'border outline-none placeholder:text-zinc-600 focus:border-zinc-500 disabled:opacity-50'

// Box + radius + text size per size step. 'dense' shares md's height but drops
// to 11px text (URL/path fields, method selects).
export const FIELD_SIZE: Record<FieldSize, string> = {
  md: 'rounded-md px-2 py-1.5 text-xs',
  dense: 'rounded-md px-2 py-1.5 text-[11px]',
  sm: 'rounded-md px-2 py-1 text-[11px]',
  xs: 'rounded px-1.5 py-1 text-[11px]',
  '2xs': 'rounded px-1.5 py-0.5 text-[10px]',
}

// 'base' sits on the zinc-950 app/modal background, 'raised' on zinc-900
// panels (inspector, sidebar), 'popover' on floating zinc-950 menus that use
// the lighter border to separate from their shadowed container.
export const FIELD_BG: Record<FieldSurface, string> = {
  base: 'bg-zinc-950',
  raised: 'bg-zinc-900',
  popover: 'bg-zinc-950',
}

export const FIELD_BORDER: Record<FieldSurface, string> = {
  base: 'border-zinc-800',
  raised: 'border-zinc-800',
  popover: 'border-zinc-700',
}

// Non-default tones replace the surface border so the border-color axis stays
// single-sourced. 'accent' marks a value bound to another node's output.
export const FIELD_TONE: Record<Exclude<FieldTone, 'default'>, string> = {
  error: 'border-rose-500/40',
  accent: 'border-violet-500/30 text-violet-200',
}

export const FIELD_MONO = 'font-mono'

// The uppercase micro-label above fields; Field.svelte renders it, and
// non-label section headers import it directly.
export const FIELD_LABEL = 'text-[10px] font-medium tracking-wide text-zinc-500 uppercase'

// Right padding reserving the select-chevron gutter (style.css @utility).
// pr-* is emitted after px-* in Tailwind's property order, so it wins.
export const SELECT_CHEVRON_PAD: Record<FieldSize, string> = {
  md: 'pr-6',
  dense: 'pr-6',
  sm: 'pr-6',
  xs: 'pr-5',
  '2xs': 'pr-5',
}

export function fieldClass(size: FieldSize, surface: FieldSurface, tone: FieldTone, mono: boolean): string {
  return [
    FIELD_BASE,
    FIELD_SIZE[size],
    FIELD_BG[surface],
    tone === 'default' ? FIELD_BORDER[surface] : FIELD_TONE[tone],
    mono ? FIELD_MONO : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'secondary' | 'dashed' | 'danger'
export type ButtonSize = 'md' | 'sm' | 'xs'

export const BUTTON_BASE = 'inline-flex items-center justify-center disabled:cursor-not-allowed'

export const BUTTON_SIZE: Record<ButtonSize, string> = {
  md: 'gap-1.5 px-2.5 py-1.5 text-xs',
  sm: 'gap-1 px-2 py-1 text-[11px]',
  xs: 'gap-1 px-1.5 py-1 text-[11px]',
}

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'rounded bg-emerald-600 font-medium text-white hover:bg-emerald-500 disabled:opacity-50',
  accent: 'rounded-md bg-violet-600 font-medium text-white hover:bg-violet-500 disabled:opacity-50',
  ghost: 'rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
  secondary:
    'rounded-md border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:text-zinc-700 disabled:hover:bg-transparent',
  dashed: 'rounded-md border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-300',
  danger: 'rounded-md border border-rose-500/30 text-rose-400 hover:bg-rose-500/10',
}

export type IconButtonTone = 'default' | 'accent' | 'info' | 'danger' | 'quiet' | 'quiet-danger'

export const ICON_BUTTON_BASE =
  'flex shrink-0 items-center rounded px-1 py-0.5 disabled:cursor-not-allowed disabled:text-zinc-700'

// 'quiet' skips the hover background for dense tree rows where a bg flash
// per row is noisy; toggles switch tone ('default' ↔ 'accent'/'info').
export const ICON_BUTTON_TONE: Record<IconButtonTone, string> = {
  default: 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200',
  accent: 'text-violet-300 hover:bg-zinc-800',
  info: 'text-sky-300 hover:bg-zinc-800',
  danger: 'text-zinc-600 hover:bg-zinc-800 hover:text-rose-400',
  quiet: 'text-zinc-600 hover:text-zinc-300',
  'quiet-danger': 'text-zinc-600 hover:text-rose-400',
}

// Toggle (switch). The thumb stays white in both themes, iOS-style, with a
// shadow so it reads on the light theme's pale off-track.
export const TOGGLE_TRACK =
  'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50'

export const TOGGLE_TRACK_STATE: Record<'on' | 'off', string> = {
  on: 'border-emerald-600 bg-emerald-600',
  off: 'border-zinc-700 bg-zinc-800',
}

export const TOGGLE_THUMB = 'absolute h-3 w-3 rounded-full bg-white shadow-sm transition-transform'

export const TOGGLE_THUMB_STATE: Record<'on' | 'off', string> = {
  on: 'translate-x-3.5',
  off: 'translate-x-0.5',
}
