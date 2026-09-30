// Copy for the home page. Claims here are checked against the app's code and
// CHANGELOG.md; keep them that way when editing.
import type { IconName } from '$lib/icons'
import type { ShotId } from '$lib/screenshots'

export const HERO = {
  lead: 'Test data that',
  emphasis: 'hangs together.',
  sub: 'Chain real API calls on a canvas. Each response feeds the next request, so one run seeds a whole environment.',
  meta: 'Free and open source under the MIT License. For macOS, Windows and Linux.',
} as const

// --- From script to board ------------------------------------------------------

export type ScriptNoteId = 'bind' | 'loop' | 'env' | 'secret'

export interface ScriptSegment {
  text: string
  note?: ScriptNoteId
}

export interface ScriptNote {
  id: ScriptNoteId
  icon: IconName
  title: string
  body: string
}

export const SCRIPT = {
  title: 'Your seed script, minus the glue',
  body: 'Every seed script rebuilds the same plumbing: catch an id, thread it into the next call, loop, keep the token out of git. In Cascade each of those is something you can see and change.',
  file: 'seed.sh',
} as const

/** A typical seed script, one array per line; noted spans get a marker. */
export const SCRIPT_LINES: readonly (readonly ScriptSegment[])[] = [
  [{ text: 'API=' }, { text: 'https://staging.api.example.com', note: 'env' }],
  [{ text: 'AUTH="Authorization: Bearer ' }, { text: '$STAGING_TOKEN', note: 'secret' }, { text: '"' }],
  [],
  [{ text: 'USER=$(curl -s -H "$AUTH" $API/v1/users \\' }],
  [{ text: `  -d '{"email":"ada@example.com"}' ` }, { text: '| jq -r .id)', note: 'bind' }],
  [{ text: 'ORG=$(curl -s -H "$AUTH" $API/v1/orgs \\' }],
  [{ text: '  -d "{\\"owner_id\\":\\"' }, { text: '$USER', note: 'bind' }, { text: '\\"}" | jq -r .id)' }],
  [],
  [{ text: 'for i in 0 1 2; do', note: 'loop' }],
  [{ text: '  curl -s -H "$AUTH" $API/v1/orgs/$ORG/members \\' }],
  [{ text: '    -d "{\\"email\\":\\"dev+$i@example.com\\"}"' }],
  [{ text: 'done', note: 'loop' }],
]

export const SCRIPT_NOTES: readonly ScriptNote[] = [
  {
    id: 'bind',
    icon: 'link',
    title: 'Bindings',
    body: '`jq -r .id` and `$USER` become `{{createUser.body.id}}`, picked from what the call returned.',
  },
  {
    id: 'loop',
    icon: 'laps',
    title: 'For loops',
    body: 'The shell loop becomes a container that repeats its nodes up to 10,000 times, or once per element of an upstream array.',
  },
  {
    id: 'env',
    icon: 'public',
    title: 'Environments',
    body: 'The base URL becomes an environment: a project default, overridable per node.',
  },
  {
    id: 'secret',
    icon: 'key',
    title: 'Credentials',
    body: 'The token becomes a credential kept in the OS keychain, never in a file you commit.',
  },
]

// --- The workspace --------------------------------------------------------------

export interface WorkspacePart {
  title: string
  body: string
}

export const WORKSPACE = {
  title: 'Everything on one screen',
  body: 'Requests on the left, the chain in the middle, the selected node on the right, and every call underneath.',
  alt: 'The Cascade window mid-run: a sidebar of requests, five connected request nodes with Get Project in flight, the inspector for Create Org, and a log of the four calls that succeeded before it.',
} as const

export const WORKSPACE_PARTS: readonly WorkspacePart[] = [
  { title: 'Requests', body: 'Collections of saved requests, or a custom request added straight on the canvas.' },
  { title: 'Canvas', body: 'Connect nodes to say what depends on what, and each runs after everything it needs.' },
  { title: 'Inspector', body: 'Fields, bindings, environment and credential for the selected node.' },
  { title: 'Logs', body: 'Every request and response of every run, with a filter and failures in red.' },
]

// --- Feature bento --------------------------------------------------------------

/** Grid cells: large spans two rows, half is half a row, full a whole row. */
export type BentoSize = 'large' | 'small' | 'half' | 'full'

export interface BentoItem {
  id: string
  icon: IconName
  title: string
  body: string
  size: BentoSize
  /** A screenshot crop; items without one show the board file instead. */
  shot?: ShotId
  alt?: string
}

export const BENTO_INTRO = {
  title: 'Built for chains, not single calls',
  body: 'Six node kinds, bindings between them, and loops that run a branch thousands of times.',
} as const

export const BENTO: readonly BentoItem[] = [
  {
    id: 'loops',
    size: 'large',
    icon: 'laps',
    title: 'Loops for volume',
    body: 'Repeat a branch up to 10,000 times, or once per element of an upstream array, with `{{i}}` and `{{item}}` inside.',
    shot: 'loop',
    alt: 'A For loop named Seed projects running its third of five iterations, its edge animated, logs numbered #1 to #3.',
  },
  {
    id: 'transforms',
    size: 'small',
    icon: 'function',
    title: 'Reshape between calls',
    body: 'Pick fields with rows, or write JavaScript in a sandbox with no network, files or timers.',
    shot: 'transform',
    alt: 'A transform node whose script builds an invite payload from the new org, feeding an Invite Member request.',
  },
  {
    id: 'bindings',
    size: 'small',
    icon: 'link',
    title: 'Point, do not paste',
    body: 'The binding picker lists what every upstream node returned, inferred from real responses.',
    shot: 'binding',
    alt: 'The binding picker open on a path parameter, listing the status, headers and body fields of Create User and Create Org.',
  },
  {
    id: 'secrets',
    size: 'half',
    icon: 'key',
    title: 'Secrets stay put',
    body: 'Bearer, basic, header and query credentials, written to the OS keychain and redacted from logs.',
    shot: 'credential',
    alt: 'The New credential dialog: a bearer token that sends an Authorization header, with a write-only secret field.',
  },
  {
    id: 'failures',
    size: 'half',
    icon: 'error',
    title: 'Failures stay contained',
    body: 'A failed call skips only what depends on it. The rest of the board still runs.',
    shot: 'failure',
    alt: 'Create Project failed with 422 Unprocessable Entity, its red edge leading in and Get Project after it skipped.',
  },
  {
    id: 'sharing',
    size: 'full',
    icon: 'data_object',
    title: 'Boards live in git',
    body: 'Export a board as versioned, diff-friendly JSON. Credentials travel as names, never values.',
  },
]

// --- Local by design ------------------------------------------------------------

export interface LocalPoint {
  icon: IconName
  title: string
  body: string
}

export const LOCAL = {
  title: 'Runs on your machine, answers to you',
  body: 'Cascade is a desktop app, not a service. There is nothing to sign up for and nothing phoning home.',
} as const

export const LOCAL_POINTS: readonly LocalPoint[] = [
  {
    icon: 'lock',
    title: 'Keychain, not config files',
    body: 'Credential values go to the OS keychain, or an encrypted file where there is none. Project and export files hold names only.',
  },
  {
    icon: 'http',
    title: 'Real HTTP, from Go',
    body: 'Requests leave from the app’s Go side, so there are no CORS rules to fight and no proxy in between.',
  },
  {
    icon: 'shield',
    title: 'No account, no telemetry',
    body: 'The app does not collect usage data. It talks only to the APIs you point it at.',
  },
  {
    icon: 'folder_open',
    title: 'Plain JSON on disk',
    body: 'Projects and boards are readable JSON in your config folder, and a project can keep captured responses out of them.',
  },
]

// --- Releases -------------------------------------------------------------------

export const RELEASES_INTRO = {
  title: 'Shipped in the open',
  body: 'Every release comes with notes written for the people using it, and the roadmap is public.',
  next: 'Coming next',
} as const

/** The Next list in ROADMAP.md, in the order it is planned. */
export const NEXT_UP: readonly string[] = [
  'OpenAPI import, so the palette comes from your own spec',
  'Value generators for ids, emails and random data',
  'Parallel branches with concurrency and rate limits',
  'Pause and resume for long runs',
]

// --- Closing call to action ---------------------------------------------------------

export const GET_CASCADE = {
  title: 'Wire up your first chain',
  body: 'Free for any use under the MIT License. Grab a build for your platform, or compile it from source.',
} as const
