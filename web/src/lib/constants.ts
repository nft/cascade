/**
 * Names and tokens shared by the markup and the behaviour layer.
 *
 * The `.fhtml` templates never spell a `data-ae` name literally — `AE` is
 * passed into the template data and interpolated (`button(data-ae={ae.runDemo})`),
 * so a rename here cannot leave markup and script out of sync.
 */
export const AE = {
  navToggle: 'nav-toggle',
  navPanel: 'nav-panel',
  copyInstall: 'copy-install',
  copyLabel: 'copy-label',
  runDemo: 'run-demo',
  resetDemo: 'reset-demo',
  demoNode: 'demo-node',
  demoEdge: 'demo-edge',
  demoStatus: 'demo-status',
  demoCounter: 'demo-counter',
  demoLog: 'demo-log',
} as const

export type AeName = (typeof AE)[keyof typeof AE]

/** Named descendants inside a stamped log row, resolved via `ae.parts`. These
 * are row-local part names, never global handles. */
export const LOG_PART = {
  method: 'log-method',
  path: 'log-path',
  status: 'log-status',
  count: 'log-count',
  duration: 'log-duration',
} as const

/** Mirrors the node run states the desktop app paints on its canvas. */
export const NODE_STATE = {
  idle: 'idle',
  running: 'running',
  success: 'success',
  failed: 'failed',
  skipped: 'skipped',
} as const

export type NodeState = (typeof NODE_STATE)[keyof typeof NODE_STATE]

/**
 * State → class name, resolved through a map rather than assembled from the
 * state token. fhtml rejects class names built from expressions (Tailwind's
 * scanner is static), and the behaviour layer needs the same names, so both
 * sides read them from here.
 *
 * These are component classes declared in `style.css`, not utilities.
 */
export const NODE_STATE_CLASS: Record<NodeState, string> = {
  [NODE_STATE.idle]: 'node-idle',
  [NODE_STATE.running]: 'node-running',
  [NODE_STATE.success]: 'node-success',
  [NODE_STATE.failed]: 'node-failed',
  [NODE_STATE.skipped]: 'node-skipped',
}

export const CHIP_CLASS: Record<NodeState, string> = {
  [NODE_STATE.idle]: 'chip-idle',
  [NODE_STATE.running]: 'chip-running',
  [NODE_STATE.success]: 'chip-success',
  [NODE_STATE.failed]: 'chip-failed',
  [NODE_STATE.skipped]: 'chip-skipped',
}

export const EDGE_CLASS = {
  active: 'edge-active',
  done: 'edge-done',
} as const

/** HTTP verb → badge colour, resolved here for the same reason as the maps above. */
export const METHOD_CLASS: Record<string, string> = {
  GET: 'text-sky-300',
  POST: 'text-emerald-300',
  PUT: 'text-amber-300',
  PATCH: 'text-amber-300',
  DELETE: 'text-rose-300',
}

export const METHOD_CLASS_FALLBACK = 'text-muted'

/** `dataset` keys read back by the behaviour layer (camelCase of `data-*`). */
export const DATASET = {
  nodeId: 'nodeId',
  edgeId: 'edgeId',
  clipboard: 'clipboard',
} as const

/** Attribute names as written in markup, paired with `DATASET` above. */
export const DATA_ATTR = {
  nodeId: 'data-node-id',
  edgeId: 'data-edge-id',
  clipboard: 'data-clipboard',
} as const

/** Demo pacing, in milliseconds. */
export const DEMO_TIMING = {
  stepDelay: 620,
  runningDwell: 480,
} as const

/** How long the copy button confirms before reverting its label. */
export const COPY_FEEDBACK_MS = 1600

export const COPY_LABEL = {
  idle: 'Copy',
  done: 'Copied',
  failed: 'Press ⌘C',
} as const
