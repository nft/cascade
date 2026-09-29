// Copy for the error page. GitHub Pages serves the prerendered 404.html for
// any unknown path, and the router renders this page into it.
import { ROUTES, type RoutePath } from '$lib/config/routes'
import type { IconName } from '$lib/icons'

export const HTTP_NOT_FOUND = 404

export const NOT_FOUND = {
  title: 'This page is not on the board',
  lead: 'The link may be out of date, or the page has moved. One of these should get you back on track.',
} as const

export const OTHER_ERROR = {
  title: 'Something went wrong',
  lead: 'This page could not be shown. Try again, or head somewhere else on the site.',
} as const

export interface ErrorLink {
  href: RoutePath
  icon: IconName
  label: string
  body: string
}

export const ERROR_LINKS: readonly ErrorLink[] = [
  { href: ROUTES.home, icon: 'account_tree', label: 'Home', body: 'Watch a board run.' },
  { href: ROUTES.features, icon: 'bolt', label: 'Features', body: 'What Cascade can do.' },
  { href: ROUTES.download, icon: 'download', label: 'Download', body: 'macOS, Windows and Linux.' },
  { href: ROUTES.docs, icon: 'description', label: 'Docs', body: 'Get started and look things up.' },
]
