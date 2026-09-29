// The board the hero demo runs: one user, their org, a team invited in a
// loop, and a project. Cards follow the app's node anatomy; ids in responses
// are generated per run by the runner.

export type Method = 'GET' | 'POST'

export interface HttpNodeSpec {
  kind: 'http'
  id: string
  name: string
  method: Method
  /** Request path; `{id}` is filled from the response of the node in `uses`. */
  path: string
  /** Upstream node whose `body.id` this request reads: the card's USES chip. */
  uses?: string
  status: number
  /** Prefix of the id this node's response carries, like the API's `usr_`. */
  produces: string
  /** The loop this node sits inside. */
  parent?: string
}

export interface LoopNodeSpec {
  kind: 'loop'
  id: string
  name: string
  count: number
}

export interface NoteNodeSpec {
  kind: 'note'
  id: string
  text: string
}

export type DemoNodeSpec = HttpNodeSpec | LoopNodeSpec | NoteNodeSpec

export interface EdgeSpec {
  id: string
  from: string
  to: string
}

/** The seeded project's names, as a first launch of the app shows them. */
export const DEMO_PROJECT = 'Default'
export const DEMO_ENVIRONMENT = 'staging'
export const DEMO_CREDENTIAL = 'staging-admin'
export const DEMO_BASE_URL = 'https://staging.api.example.com'
/** What a USES chip shows after the upstream key. */
export const USES_PATH = 'body.id'

export const NODE_IDS = {
  createUser: 'createUser',
  createOrg: 'createOrg',
  inviteTeam: 'inviteTeam',
  inviteMember: 'inviteMember',
  createProject: 'createProject',
  getProject: 'getProject',
  note: 'note',
} as const

const HTTP_CREATED = 201
const HTTP_OK = 200
const TEAM_SIZE = 3

export const DEMO_NODES: readonly DemoNodeSpec[] = [
  {
    kind: 'http',
    id: NODE_IDS.createUser,
    name: 'Create User',
    method: 'POST',
    path: '/v1/users',
    status: HTTP_CREATED,
    produces: 'usr',
  },
  {
    kind: 'http',
    id: NODE_IDS.createOrg,
    name: 'Create Org',
    method: 'POST',
    path: '/v1/orgs',
    uses: NODE_IDS.createUser,
    status: HTTP_CREATED,
    produces: 'org',
  },
  { kind: 'loop', id: NODE_IDS.inviteTeam, name: 'Invite team', count: TEAM_SIZE },
  {
    kind: 'http',
    id: NODE_IDS.inviteMember,
    name: 'Invite Member',
    method: 'POST',
    path: '/v1/orgs/{id}/members',
    uses: NODE_IDS.createOrg,
    status: HTTP_CREATED,
    produces: 'mem',
    parent: NODE_IDS.inviteTeam,
  },
  {
    kind: 'http',
    id: NODE_IDS.createProject,
    name: 'Create Project',
    method: 'POST',
    path: '/v1/projects',
    uses: NODE_IDS.createOrg,
    status: HTTP_CREATED,
    produces: 'prj',
  },
  {
    kind: 'http',
    id: NODE_IDS.getProject,
    name: 'Get Project',
    method: 'GET',
    path: '/v1/projects/{id}',
    uses: NODE_IDS.createProject,
    status: HTTP_OK,
    produces: 'prj',
  },
  { kind: 'note', id: NODE_IDS.note, text: 'Seeds one org with a team of three and a first project.' },
]

export const DEMO_EDGES: readonly EdgeSpec[] = [
  { id: 'user-org', from: NODE_IDS.createUser, to: NODE_IDS.createOrg },
  { id: 'org-team', from: NODE_IDS.createOrg, to: NODE_IDS.inviteTeam },
  { id: 'org-project', from: NODE_IDS.createOrg, to: NODE_IDS.createProject },
  { id: 'project-get', from: NODE_IDS.createProject, to: NODE_IDS.getProject },
]

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export type Flow = 'horizontal' | 'vertical'

/** Node boxes in canvas units; a layout may leave a node (the note) out. */
export interface DemoLayout {
  width: number
  height: number
  flow: Flow
  boxes: Partial<Record<string, Box>>
}

// Card heights at the app's own sizes: a card with a USES row, and one
// without. Boxes are centred on the same line so edges between them run
// straight.
const NODE_W = 212
const NODE_H = 132
const ROOT_H = 110
const ROOT_INSET = (NODE_H - ROOT_H) / 2

/** Desktop: left to right, the loop and the project branching off the org. */
export const WIDE_LAYOUT: DemoLayout = {
  width: 1100,
  height: 460,
  flow: 'horizontal',
  boxes: {
    [NODE_IDS.createUser]: { x: 24, y: 164 + ROOT_INSET, w: NODE_W, h: ROOT_H },
    [NODE_IDS.createOrg]: { x: 296, y: 164, w: NODE_W, h: NODE_H },
    [NODE_IDS.inviteTeam]: { x: 568, y: 20, w: 252, h: 210 },
    [NODE_IDS.inviteMember]: { x: 588, y: 78, w: NODE_W, h: NODE_H },
    [NODE_IDS.createProject]: { x: 588, y: 302, w: NODE_W, h: NODE_H },
    [NODE_IDS.getProject]: { x: 864, y: 302, w: NODE_W, h: NODE_H },
    [NODE_IDS.note]: { x: 864, y: 78, w: NODE_W, h: 96 },
  },
}

const TALL_NODE_W = 188

/** Phones and tablets: top to bottom, the branch side by side. */
export const TALL_LAYOUT: DemoLayout = {
  width: 420,
  height: 676,
  flow: 'vertical',
  boxes: {
    [NODE_IDS.createUser]: { x: 116, y: 16, w: TALL_NODE_W, h: ROOT_H },
    [NODE_IDS.createOrg]: { x: 116, y: 166, w: TALL_NODE_W, h: NODE_H },
    [NODE_IDS.inviteTeam]: { x: 8, y: 346, w: 204, h: 210 },
    [NODE_IDS.inviteMember]: { x: 16, y: 404, w: TALL_NODE_W, h: NODE_H },
    [NODE_IDS.createProject]: { x: 224, y: 346, w: TALL_NODE_W, h: NODE_H },
    [NODE_IDS.getProject]: { x: 224, y: 524, w: TALL_NODE_W, h: NODE_H },
  },
}

export function nodeById(id: string): DemoNodeSpec {
  const node = DEMO_NODES.find((n) => n.id === id)
  if (!node) throw new Error(`demo board has no node "${id}"`)
  return node
}

export function childrenOf(loopId: string): HttpNodeSpec[] {
  return DEMO_NODES.filter((n): n is HttpNodeSpec => n.kind === 'http' && n.parent === loopId)
}
