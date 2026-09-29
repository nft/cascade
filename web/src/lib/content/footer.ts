import { ROUTES, type RoutePath } from '$lib/config/routes'
import { LINKS } from '$lib/config/site'

export type FooterLink = { label: string; route: RoutePath } | { label: string; url: string }

export interface FooterColumn {
  heading: string
  links: readonly FooterLink[]
}

export const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', route: ROUTES.features },
      { label: 'Download', route: ROUTES.download },
      { label: 'Changelog', route: ROUTES.changelog },
    ],
  },
  {
    heading: 'Learn',
    links: [
      { label: 'Docs', route: ROUTES.docs },
      { label: 'Roadmap', url: LINKS.roadmap },
      { label: 'Board file format', url: LINKS.formatSpec },
    ],
  },
  {
    heading: 'Project',
    links: [
      { label: 'Source on GitHub', url: LINKS.repo },
      { label: 'Report a problem', url: LINKS.newIssue },
      { label: 'MIT License', url: LINKS.license },
    ],
  },
]

export const FOOTER_BLURB =
  'A free, open-source desktop app for seeding environments through your API, one connected graph at a time.'

export const COPYRIGHT_HOLDER = 'The Cascade Authors'
