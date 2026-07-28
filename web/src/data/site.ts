export const REPO_URL = 'https://github.com/nft/cascade'

/** Public origin of the published site, used for canonical and og:url tags. */
export const SITE_URL = 'https://nft.github.io/cascade/'

export const SITE = {
  name: 'Cascade',
  tagline: 'Test data that actually hangs together',
  description:
    'Cascade turns an OpenAPI schema into a visual graph of real API calls. Wire the nodes together, bind each field to an upstream response, and run — relationally consistent data cascades through your stack.',
  repo: REPO_URL,
  /** Bare display form of `repo`, so the footer link text cannot drift from its href. */
  repoLabel: REPO_URL.replace(/^https?:\/\//, ''),
  url: SITE_URL,
  license: 'MIT',
} as const

export interface NavLink {
  href: string
  label: string
  /** Absolute links leave the site and open in a new tab. */
  external?: boolean
}

export const NAV_LINKS: NavLink[] = [
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: 'docs.html', label: 'Docs' },
  { href: REPO_URL, label: 'GitHub', external: true },
]

export const HERO = {
  eyebrow: 'Open source desktop app',
  headline: 'Test data that actually hangs together.',
  lede: 'Stop writing one-off seed scripts that rot. Cascade reads your OpenAPI schema, lets you wire operations into a graph, and cascades real responses downstream — so every row you generate points at something that exists.',
  primaryCta: { href: '#how', label: 'See how it works' },
  secondaryCta: { href: REPO_URL, label: 'View on GitHub' },
} as const

/** Cascade ships from source today, so the site shows the clone line rather
 * than inventing a package-manager channel. */
export const INSTALL = {
  label: 'Build from source',
  command: 'git clone https://github.com/nft/cascade.git',
  note: 'Requires Go 1.23+, Bun, and the Wails v2 CLI.',
} as const

export interface Feature {
  title: string
  body: string
  /** Sprite symbol id, minus the `icon-` prefix. See `partials/icons.fhtml`. */
  icon: string
}

export const FEATURES: Feature[] = [
  {
    title: 'Schema-driven, not hand-rolled',
    body: 'Import OpenAPI 3.x from a URL or a file. Cascade parses every operation, its parameters, request body, and response schema with $refs resolved. Request shapes are read from the spec, never invented.',
    icon: 'schema',
  },
  {
    title: 'Bindings instead of copy-paste',
    body: 'Point a field at an upstream node — body.owner_id ← Create User.response.body.id — and it resolves at call time from the live response. No fixture files, no stale ids.',
    icon: 'binding',
  },
  {
    title: 'Runs as a DAG',
    body: 'Topological order with independent branches in parallel, plus opt-in retry and timeout per node. Cycles are rejected while you edit, not at 3am during a run.',
    icon: 'dag',
  },
  {
    title: 'Fan-out for volume',
    body: 'Repeat a node N times, or loop it over an array an upstream node returned. Three connected calls become three thousand consistent rows.',
    icon: 'fanout',
  },
  {
    title: 'Every call is logged',
    body: 'Resolved URL, request and response headers and bodies, status, and duration for each call. A failed node is one click from the exact request that broke it. Secrets are redacted.',
    icon: 'logs',
  },
  {
    title: 'Environments and credentials',
    body: 'Named base URLs and write-only credentials, chosen per node. Two nodes on the same operation can point at different environments with different keys.',
    icon: 'lock',
  },
  {
    title: 'Git-friendly export',
    body: 'Workspaces export to versioned, diff-friendly JSON built to live in a repo. Secrets never travel with them — credentials export as named placeholders.',
    icon: 'commit',
  },
  {
    title: 'Native, and local by default',
    body: 'A Go engine in a Wails desktop shell. Requests leave from Go, so there is no CORS wall between you and your own staging environment.',
    icon: 'desktop',
  },
]

export interface Step {
  title: string
  body: string
}

export const STEPS: Step[] = [
  {
    title: 'Import a schema',
    body: 'Point Cascade at an OpenAPI document. Every operation it finds becomes something you can drop on the canvas. Re-importing flags drifted nodes as stale instead of deleting them.',
  },
  {
    title: 'Drop operations on the canvas',
    body: 'Search the palette for POST /v1/users, place it, then choose which environment and credential that node calls with.',
  },
  {
    title: 'Wire and bind',
    body: 'An edge means "this node depends on that one". Fill fields with literals, generators, or bindings that read straight out of an upstream response.',
  },
  {
    title: 'Run the cascade',
    body: 'Cascade walks the graph, resolves each binding against live responses, and streams node state back to the canvas while it goes.',
  },
]

export interface StackItem {
  name: string
  role: string
  href: string
}

export const STACK: StackItem[] = [
  { name: 'Go', role: 'Engine and HTTP client', href: 'https://go.dev' },
  { name: 'Wails v2', role: 'Desktop shell', href: 'https://wails.io' },
  { name: 'Svelte 5', role: 'App interface', href: 'https://svelte.dev' },
  { name: 'Svelte Flow', role: 'Node canvas', href: 'https://svelteflow.dev' },
]

/** Credits for the stack this marketing site itself is built on. */
export const SITE_STACK: StackItem[] = [
  { name: 'fhtml', role: 'Markup', href: 'https://nft.github.io/fhtml/' },
  { name: 'ae', role: 'Reactivity', href: 'https://nft.github.io/ae/' },
  { name: 'Tailwind CSS', role: 'Styling', href: 'https://tailwindcss.com' },
  { name: 'Vite', role: 'Build', href: 'https://vite.dev' },
]

export interface FooterColumn {
  heading: string
  links: NavLink[]
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: 'Product',
    links: [
      { href: '#how', label: 'How it works' },
      { href: '#features', label: 'Features' },
      { href: 'docs.html', label: 'Documentation' },
    ],
  },
  {
    heading: 'Project',
    links: [
      { href: REPO_URL, label: 'Source', external: true },
      { href: `${REPO_URL}/blob/main/PROJECT.md`, label: 'Scope & architecture', external: true },
      { href: `${REPO_URL}/blob/main/docs/ROADMAP.md`, label: 'Roadmap', external: true },
      { href: `${REPO_URL}/issues`, label: 'Issues', external: true },
    ],
  },
]

export interface DocsSection {
  id: string
  heading: string
  paragraphs: string[]
  code?: { caption: string; body: string }
  bullets?: string[]
}

export const DOCS_INTRO =
  'Cascade is in active development. This page covers what exists today: getting the app running, the concepts behind the canvas, and the shape of the files it writes.'

export const DOCS_SECTIONS: DocsSection[] = [
  {
    id: 'getting-started',
    heading: 'Getting started',
    paragraphs: [
      'Cascade is a Wails desktop app: a Go engine with a Svelte interface. You need Go 1.23 or newer, Bun, and the Wails v2 CLI on your path.',
    ],
    code: {
      caption: 'Clone and run with hot reload',
      body: [
        'go install github.com/wailsapp/wails/v2/cmd/wails@latest',
        'git clone https://github.com/nft/cascade.git',
        'cd cascade',
        'wails dev',
      ].join('\n'),
    },
    bullets: [
      'wails dev runs the app with hot reload for both Go and the frontend.',
      'wails build produces a production binary in build/bin.',
      'go test ./... runs the engine tests; cd frontend && bun run test runs the interface tests.',
    ],
  },
  {
    id: 'concepts',
    heading: 'Concepts',
    paragraphs: [
      'A workspace holds imported schemas, environments, credentials, and graphs. A graph is a set of nodes and the edges between them.',
      'A node is one operation from an imported schema, aimed at one environment with one credential. An edge means the target depends on the source — it sets execution order and makes the source\'s response available for binding.',
      'A binding reads a value out of an upstream response at call time: a JSON path into the body, a header, or the status. Fields that are not bound take a literal or a generator.',
    ],
  },
  {
    id: 'execution',
    heading: 'Execution',
    paragraphs: [
      'A run walks the graph in topological order. Independent branches run in parallel, and a node starts only once every upstream node has succeeded. Nodes downstream of a failure are marked skipped rather than attempted.',
      'You can run the whole graph, or run a single node and everything it needs to get there.',
    ],
  },
  {
    id: 'logs',
    heading: 'Logs',
    paragraphs: [
      'Every executed call produces a log entry with the timestamp, node, operation, resolved URL, request headers and body after binding resolution, response status, headers and body, and duration.',
      'Logs filter by run, node, status, and free text. Credential values are redacted in both the log display and any export.',
    ],
  },
  {
    id: 'files',
    heading: 'Files on disk',
    paragraphs: [
      'A workspace exports to a single JSON file, versioned and formatted to diff cleanly so it can live in a repository next to the service it seeds.',
      'Secrets are stored separately and never enter that file. Credentials export as named placeholders, which the importing machine fills in locally.',
    ],
  },
]
