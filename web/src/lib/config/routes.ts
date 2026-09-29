// Every page the site renders. Components link through these (wrapped in
// resolve() from $app/paths, which adds the base path) rather than literals.

export const ROUTES = {
  home: '/',
  features: '/features',
  download: '/download',
  changelog: '/changelog',
  docs: '/docs',
} as const

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES]

export interface NavLink {
  href: RoutePath
  label: string
}

/** Header navigation; Download is its own button, so it is not listed. */
export const NAV_LINKS: readonly NavLink[] = [
  { href: ROUTES.features, label: 'Features' },
  { href: ROUTES.docs, label: 'Docs' },
  { href: ROUTES.changelog, label: 'Changelog' },
]

/** In-page anchors other pages deep-link to. */
export const ANCHORS = {
  install: 'install',
  buildFromSource: 'build-from-source',
  checksums: 'checksums',
} as const
