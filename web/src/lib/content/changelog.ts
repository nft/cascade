import type { IconName } from '$lib/icons'

export const CHANGELOG_PAGE = {
  title: 'Changelog',
  lead: 'What changed in every release of Cascade, written for the people using it. The same notes ship with each GitHub release.',
  description: 'Patch notes for every Cascade release: new features, fixes, security changes and known limitations.',
} as const

/** Keep a Changelog's section names, with an icon each; others get the fallback. */
export const SECTION_ICONS: Readonly<Record<string, IconName>> = {
  Added: 'add',
  Changed: 'swap_horiz',
  Fixed: 'check',
  Security: 'shield',
  Removed: 'remove',
  Deprecated: 'history',
  'Known limitations': 'info',
}

export const SECTION_ICON_FALLBACK: IconName = 'description'
