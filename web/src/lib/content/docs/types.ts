import type { RoutePath } from '$lib/config/routes'

export type NoteTone = 'info' | 'warning'

/** A link to another page of the site, optionally to an anchor on it. */
export interface DocLink {
  label: string
  href: RoutePath
  hash?: string
}

/** One block of a docs section. Every `text`, `items` and cell is inline markdown. */
export type DocBlock =
  | { kind: 'text'; text: string }
  | { kind: 'steps'; items: readonly string[] }
  | { kind: 'list'; items: readonly string[] }
  | { kind: 'shell'; lines: readonly string[] }
  | { kind: 'code'; label: string; lines: readonly string[] }
  | { kind: 'table'; head: readonly string[]; rows: readonly (readonly string[])[] }
  | { kind: 'note'; tone: NoteTone; text: string }
  | { kind: 'links'; items: readonly DocLink[] }

export interface DocSubsection {
  id: string
  title: string
  blocks: readonly DocBlock[]
}

export interface DocSection {
  id: string
  title: string
  blocks: readonly DocBlock[]
  subsections?: readonly DocSubsection[]
}
