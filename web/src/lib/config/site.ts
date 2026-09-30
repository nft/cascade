// Names and addresses the whole site links to. The Pages and release
// workflows assume the same repository, so a move touches all three.

export const REPO_OWNER = 'nft'
export const REPO_NAME = 'cascade'
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`

/**
 * Origin the site is published under. Canonical and og:url are this plus the
 * page's pathname, which already carries the base path, so moving to a custom
 * domain means changing this and BASE_PATH in the Pages workflow.
 */
export const SITE_ORIGIN = 'https://nft.github.io'

export const SITE = {
  name: 'Cascade',
  tagline: 'Test data that hangs together',
  description:
    'Cascade is a free, open-source desktop app for seeding environments through your API. Wire real calls into a graph, bind each step to the responses before it, and run it.',
  license: 'MIT',
  /** The social card, relative to the static directory. */
  ogImage: {
    path: '/og.png',
    width: 1200,
    height: 630,
    alt: 'Cascade: test data that hangs together. Four request nodes chained on a canvas, each reading the one before.',
  },
} as const

export const LINKS = {
  repo: REPO_URL,
  releases: `${REPO_URL}/releases`,
  releasesFeed: `${REPO_URL}/releases.atom`,
  issues: `${REPO_URL}/issues`,
  newIssue: `${REPO_URL}/issues/new/choose`,
  license: `${REPO_URL}/blob/main/LICENSE`,
  changelogSource: `${REPO_URL}/blob/main/CHANGELOG.md`,
  roadmap: `${REPO_URL}/blob/main/ROADMAP.md`,
  formatSpec: `${REPO_URL}/blob/main/docs/format.md`,
  readme: `${REPO_URL}#readme`,
  wails: 'https://wails.io',
} as const

/** Joins a page title with the site name, or returns the bare site title. */
export function pageTitle(title?: string): string {
  return title ? `${title} | ${SITE.name}` : `${SITE.name} | ${SITE.tagline}`
}
