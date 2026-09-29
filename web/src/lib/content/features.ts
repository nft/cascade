// Copy for the features page. Every claim is checked against the app's code
// (core/, store/, share/, frontend/) and CHANGELOG.md.
import type { IconName } from '$lib/icons'
import type { ShotId } from '$lib/screenshots'

export const FEATURES_PAGE = {
  title: 'Everything a seed script does, on a canvas',
  lead: 'Cascade turns the chain of API calls behind your test data into a graph you can see, run, rerun and share. Here is what is in the box.',
  description:
    'Cascade features: six node kinds, bindings between responses, loops, transforms, real runs with logs, environments, keychain credentials and shareable boards.',
  navLabel: 'Features on this page',
} as const

export interface NodeKind {
  icon: IconName
  name: string
  body: string
}

export const NODE_KINDS: readonly NodeKind[] = [
  { icon: 'http', name: 'HTTP request', body: 'Any method, path, query, headers and body, sent by the Go engine.' },
  { icon: 'function', name: 'Transform', body: 'Reshape data between calls with pick rows or a JavaScript script.' },
  { icon: 'laps', name: 'For loop', body: 'A container that repeats its nodes a set number of times or per array element.' },
  { icon: 'data_object', name: 'Mock', body: 'Emits static JSON you write, standing in for an endpoint that does not exist yet.' },
  { icon: 'timer', name: 'Delay', body: 'Pauses the run for up to five minutes, for APIs that settle slowly.' },
  { icon: 'sticky_note_2', name: 'Note', body: 'A sticky note on the canvas, for the context a graph cannot carry.' },
]

export const BINDING_SYNTAX = {
  title: 'Binding syntax',
  lead: 'A field holding one binding keeps the value’s JSON type, so a number stays a number. Bindings inside longer text are written into it.',
  syntaxLabel: 'Write',
  meaningLabel: 'To read',
} as const

export interface BindingExample {
  syntax: string
  /** Inline markdown. */
  meaning: string
}

export const BINDING_EXAMPLES: readonly BindingExample[] = [
  {
    syntax: '{{createUser.body.id}}',
    meaning: 'A value an upstream node returned, by the node’s key. A bare `{{createUser.id}}` reads the body too.',
  },
  { syntax: '{{createUser.status}}', meaning: 'Its status code, or a response header with `headers.Location`.' },
  { syntax: '{{createUser.userId}}', meaning: 'A named export, which a node declares once for everything downstream.' },
  { syntax: '{{res.id}}', meaning: 'The single node directly upstream, without naming it. `{{res}}` alone is its whole body.' },
  { syntax: '{{res.orgs[*].id}}', meaning: 'The `id` of every element of `orgs`, as an array. `orgs[0]` picks one element.' },
  { syntax: '{{i}}', meaning: 'The iteration index inside a loop, counting from 0.' },
  { syntax: '{{item.email}}', meaning: 'The current element, when a loop runs once per element of an array.' },
]

export interface FolderEntry {
  name: string
  /** Nesting level under the data folder. */
  depth: number
  folder?: boolean
  note?: string
}

/** The app's data folder as the store lays it out; the ids are examples. */
export const DATA_FOLDER = {
  root: 'cascade',
  caption: 'Inside your user config folder',
  entries: [
    { name: 'projects.json', depth: 0, note: 'the project list' },
    { name: 'projects', depth: 0, folder: true },
    { name: 'q4mh7zk2ta', depth: 1, folder: true, note: 'one folder per project' },
    { name: 'project.json', depth: 2 },
    { name: 'environments.json', depth: 2 },
    { name: 'credentials.json', depth: 2, note: 'names and kinds, no values' },
    { name: 'boards', depth: 2, folder: true },
    { name: 'x7c2mfp9ke.json', depth: 3 },
    { name: 'collections', depth: 2, folder: true },
    { name: 'b3tn8wq5ld.json', depth: 3 },
  ] satisfies FolderEntry[],
} as const

export type FeatureVisual =
  | { kind: 'shot'; shot: ShotId; alt: string }
  | { kind: 'node-kinds' }
  | { kind: 'data-folder' }
  | { kind: 'board-file' }

export interface FeatureSection {
  id: string
  icon: IconName
  /** Short label for the page navigation. */
  nav: string
  title: string
  /** Inline markdown. */
  lead: string
  /** Inline markdown. */
  points: readonly string[]
  visual: FeatureVisual
  /** A full-width reference under the section. */
  reference?: 'binding-syntax'
}

export const FEATURE_SECTIONS: readonly FeatureSection[] = [
  {
    id: 'canvas',
    icon: 'account_tree',
    nav: 'Canvas',
    title: 'A canvas that knows what depends on what',
    lead: 'Every connection is a dependency: the target runs after its source and can read what the source returned.',
    points: [
      'Edges show the named outputs their source hands on.',
      'Right-click the canvas to add any node kind, or an edge to insert a node into it.',
      'The scissors tool cuts every connection you drag across.',
      'Copy, paste and duplicate nodes, or save a request to a collection for reuse.',
    ],
    visual: { kind: 'node-kinds' },
  },
  {
    id: 'bindings',
    icon: 'link',
    nav: 'Bindings',
    title: 'Bindings instead of copy and paste',
    lead: 'Fill any field with a reference to what an upstream node returned. The picker lists every path it can reach.',
    points: [
      'Bindings work in paths, query parameters, headers and bodies.',
      'Response schemas are inferred from the last run, so the picker knows fields before you type them.',
      'A reference to a node that is not upstream is flagged before anything is sent.',
    ],
    visual: {
      kind: 'shot',
      shot: 'inspector',
      alt: 'The inspector for Invite Member: its path parameter is being bound, and the picker lists the status, headers and body fields that Create User and Create Org returned.',
    },
    reference: 'binding-syntax',
  },
  {
    id: 'loops',
    icon: 'laps',
    nav: 'Loops',
    title: 'Loops for real volume',
    lead: 'Put nodes inside a For container and they run as a group, once per iteration.',
    points: [
      'Count mode repeats up to 10,000 times, with `{{i}}` as the index.',
      'Each mode runs once per element of an upstream array, with `{{item}}` as the element.',
      'The container shows live progress, and each log row from inside it carries its iteration number.',
      'If an iteration fails, the loop stops there and fails, so nothing after it runs on partial data.',
    ],
    visual: {
      kind: 'shot',
      shot: 'loop',
      alt: 'A For loop running its third of five iterations, with the edge into it animated.',
    },
  },
  {
    id: 'transforms',
    icon: 'function',
    nav: 'Transforms',
    title: 'Reshape data between calls',
    lead: 'When one API’s response is not the next API’s request, put a transform node between them.',
    points: [
      'Pick mode maps fields with rows, no code needed.',
      'Script mode runs JavaScript with `res`, `nodes.<key>`, `i` and helpers, and returns any JSON value.',
      'Scripts run in an embedded sandbox with no network, file system or timers.',
      'Test a script against the last captured responses before running the board.',
    ],
    visual: {
      kind: 'shot',
      shot: 'transform',
      alt: 'A transform script that builds an invite payload from the new org, beside the node it feeds.',
    },
  },
  {
    id: 'runs',
    icon: 'play_arrow',
    nav: 'Runs and logs',
    title: 'Real runs, every call on record',
    lead: 'Run the whole board, or one node and everything after it. Requests go out from the Go engine, not the webview.',
    points: [
      'Node states change live as the run moves through the graph, and Stop cancels requests in flight.',
      'A failed node skips its dependents; the rest of the board still runs.',
      'The logs panel lists every call, newest first, filters by status or text, and keeps each request and response.',
      'Hover a log entry to find its node on the canvas.',
    ],
    visual: {
      kind: 'shot',
      shot: 'failure',
      alt: 'Create Project failed with 422 Unprocessable Entity; Get Project after it is skipped while Invite Member succeeded.',
    },
  },
  {
    id: 'environments',
    icon: 'public',
    nav: 'Environments',
    title: 'One board, any environment',
    lead: 'Environments are named base URLs. The project has a default, and any node can point somewhere else.',
    points: [
      'New nodes target the project’s default environment.',
      'Override the environment or the origin on a single node when one call lives elsewhere.',
      'The seeded project starts with local, staging and sandbox environments to edit.',
    ],
    visual: {
      kind: 'shot',
      shot: 'environments',
      alt: 'The Envs tab listing local at localhost:8080, staging marked default, and prod-sandbox.',
    },
  },
  {
    id: 'credentials',
    icon: 'key',
    nav: 'Credentials',
    title: 'Credentials that stay secret',
    lead: 'Bearer tokens, basic auth, custom headers and query parameters, chosen node by node.',
    points: [
      'Values are write-only once saved and live in the OS keychain, or an encrypted file where there is none.',
      'Project files and exports carry credential names and kinds, never values.',
      'Secrets are redacted from logs, test responses and transport errors.',
    ],
    visual: {
      kind: 'shot',
      shot: 'credential',
      alt: 'The New credential dialog for a bearer token: the Authorization header it sends with the value masked, and a secret field that is write-only after saving.',
    },
  },
  {
    id: 'projects',
    icon: 'folder_open',
    nav: 'Projects',
    title: 'Projects and collections',
    lead: 'Keep each system you seed in its own project, with its own environments, credentials and collections.',
    points: [
      'Collections hold reusable requests in folders, one click from the canvas.',
      'A saved request’s Test tab sends it on its own and shows the response.',
      'Everything is saved as plain JSON in a folder you can back up, read or diff.',
    ],
    visual: { kind: 'data-folder' },
  },
  {
    id: 'sharing',
    icon: 'swap_horiz',
    nav: 'Sharing',
    title: 'Boards you can review in git',
    lead: 'Export a board as a versioned `.cascade.json` file, with stable key order for clean diffs.',
    points: [
      'Copy and paste nodes between projects, with the bindings between them intact.',
      'On import, map the credentials and environments a board expects to the ones you have.',
      'Exports leave out captured responses, and a project can keep them out of its board files too.',
    ],
    visual: { kind: 'board-file' },
  },
]
