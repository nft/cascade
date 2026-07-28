import { CANVAS_SIZE, layoutEdges, topoLevels, type EdgeLayout, type NodeSpec } from '../lib/graph'
import { CHIP_CLASS, NODE_STATE, type NodeState } from '../lib/constants'

export interface DemoNode extends NodeSpec {
  /** Fan-out factor, summed into the "records created" counter. */
  repeat: number
}

/**
 * The graph the hero animates: a user fans out into an org and a profile, and
 * each of those fans out again. Coordinates are hand-placed in the canvas
 * space declared by `CANVAS_SIZE`.
 */
const COLUMN_X = { first: 6, second: 285, third: 564 } as const

export const DEMO_NODES: DemoNode[] = [
  {
    id: 'create_user',
    label: 'Create User',
    method: 'POST',
    path: '/v1/users',
    x: COLUMN_X.first,
    y: 186,
    dependsOn: [],
    repeat: 12,
  },
  {
    id: 'create_org',
    label: 'Create Org',
    method: 'POST',
    path: '/v1/orgs',
    x: COLUMN_X.second,
    y: 84,
    dependsOn: ['create_user'],
    repeat: 12,
  },
  {
    id: 'create_profile',
    label: 'Create Profile',
    method: 'POST',
    path: '/v1/profiles',
    x: COLUMN_X.second,
    y: 288,
    dependsOn: ['create_user'],
    repeat: 12,
  },
  {
    id: 'create_project',
    label: 'Create Project',
    method: 'POST',
    path: '/v1/projects',
    x: COLUMN_X.third,
    y: 16,
    dependsOn: ['create_org'],
    repeat: 36,
  },
  {
    id: 'invite_member',
    label: 'Invite Member',
    method: 'POST',
    path: '/v1/orgs/{id}/members',
    x: COLUMN_X.third,
    y: 152,
    dependsOn: ['create_org'],
    repeat: 24,
  },
  {
    id: 'upload_avatar',
    label: 'Upload Avatar',
    method: 'PUT',
    path: '/v1/profiles/{id}/avatar',
    x: COLUMN_X.third,
    y: 288,
    dependsOn: ['create_profile'],
    repeat: 12,
  },
]

export const DEMO_EDGES: EdgeLayout[] = layoutEdges(DEMO_NODES)

/** Execution levels — each inner array lights up together, as parallel branches do. */
export const DEMO_LEVELS: string[][] = topoLevels(DEMO_NODES)

export const DEMO_CANVAS = CANVAS_SIZE

export const DEMO_TOTAL_RECORDS = DEMO_NODES.reduce((sum, n) => sum + n.repeat, 0)

/** A representative binding per node, shown under the label. */
export const DEMO_BINDINGS: Record<string, string> = {
  create_user: 'email ← faker.email',
  create_org: 'owner_id ← Create User.id',
  create_profile: 'user_id ← Create User.id',
  create_project: 'org_id ← Create Org.id',
  invite_member: 'org_id ← Create Org.id',
  upload_avatar: 'profile_id ← Create Profile.id',
}

/** Legend for the run states the canvas paints, mirroring the app. */
export interface StateChip {
  state: NodeState
  label: string
  description: string
  /** Swatch class, resolved here so the template never builds one. */
  swatch: string
}

function chip(state: NodeState, label: string, description: string): StateChip {
  return { state, label, description, swatch: CHIP_CLASS[state] }
}

export const STATE_CHIPS: StateChip[] = [
  chip(NODE_STATE.idle, 'Idle', 'Not run yet'),
  chip(NODE_STATE.running, 'Running', 'Request in flight'),
  chip(NODE_STATE.success, 'Success', 'Response captured'),
  chip(NODE_STATE.failed, 'Failed', 'One click to the log'),
  chip(NODE_STATE.skipped, 'Skipped', 'Upstream failed'),
]
