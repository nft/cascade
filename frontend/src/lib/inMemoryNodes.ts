// Per-node execution for the in-memory run — the browser/vitest stand-in for
// core/exec, driven by inMemoryRun.ts. Transforms execute for real (Pick on
// the mirrored resolver, Script in the Go sandbox); only http calls are
// fabricated, because this path fundamentally cannot make CORS-free requests
// or reach a keychain.
import {
  DELAY_MAX_MS,
  DELAY_MIN_MS,
  isDelayNode,
  isHttpNode,
  isMockNode,
  isRunnableNode,
  isTransformNode,
  type AppEdge,
  type AppNode,
  type CapturedResponse,
  type DelayNode,
  type HttpNode,
  type LogEntry,
  type MockNode,
  type NodeField,
  type TransformNode,
} from './model'
import { rawBodyField } from './nodeIO'
import { directUpstreams, keyByNodeId, resolveField, type ResolveContext } from './refs'
import { BODY_KEY_PREFIX } from './request'
import type { RunStatus } from './runEvents'
import { executeTransform, setKeyPath } from './transform'

/** The loop scope a node runs under: iteration index and, in each mode, the element. */
export interface LoopScope {
  /** 0-based loop iteration; undefined outside a loop. */
  iteration?: number
  item?: unknown
  hasItem: boolean
}

export const TOP_SCOPE: LoopScope = { hasItem: false }

/** Captured response bodies above this JSON size are dropped. */
const RESPONSE_BODY_CAP_BYTES = 256 * 1024

/** Demo delays sleep for real but capped — a 5-minute delay must not wedge the demo. */
export const SIM_DELAY_CAP_MS = 3000

/** Fabricated http status; the demo's one deliberate failure answers 422. */
const SIM_HTTP_STATUS = 201
const SIM_FAILURE_STATUS = 422
/** The demo fixture's deliberately failing node, so the seeded board shows a red card. */
const SIM_FAILING_NODE_ID = 'create-project'
const SIM_FAILURE_NOTE = '422 Unprocessable Entity'
const SIM_FAILURE_ERROR = 'name "Apollo" already exists in org_01HZX9'
const SIM_ORIGIN = 'https://staging.api.example.com'
const SIM_PATH_PLACEHOLDER = '{id}'
const SIM_PATH_ID = 'org_01HZX9'
const SIM_HTTP_LATENCY_MS = 500
const SIM_HTTP_DURATION_MIN_MS = 80
const SIM_HTTP_DURATION_SPREAD_MS = 300

/** Everything a node needs to resolve its inputs and record what it did. */
export interface NodeContext {
  nodes: AppNode[]
  edges: AppEdge[]
  /** Captures by node id: the run's seed plus everything it has produced. */
  outputs: Record<string, CapturedResponse>
}

/** What one executed node produced, in the shape the run turns into events. */
export interface NodeOutcome {
  status: RunStatus
  note?: string
  log: LogEntry
  /** Absent on failure, so a failed re-run leaves the previous capture in place. */
  capture?: CapturedResponse
}

/** Log row id — iteration runs need a per-iteration suffix to stay unique. */
export function logId(runId: string, nodeId: string, scope: LoopScope): string {
  return scope.iteration === undefined ? `${runId}-${nodeId}` : `${runId}-${nodeId}-${scope.iteration}`
}

/** The optional `iteration` field, spread into log rows and events. */
export function iterTag(scope: LoopScope): { iteration?: number } {
  return scope.iteration === undefined ? {} : { iteration: scope.iteration }
}

export const logTime = () => new Date().toISOString().slice(11, 23)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Demo id generator: uuid-shaped so schema inference can show its format guess. */
function pseudoUuid(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16)
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, hex)
}

/** A capture with the body cap applied. */
export function capture(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): CapturedResponse {
  const captured: CapturedResponse = { status, ...(headers ? { headers } : {}), body, at: new Date().toISOString() }
  if (JSON.stringify(captured.body).length > RESPONSE_BODY_CAP_BYTES) {
    captured.body = null
    captured.truncated = true
  }
  return captured
}

/** Declared exports by node id, for binding resolution (http and transform alike). */
export function exportsByNodeId(nodes: AppNode[]): ResolveContext['exports'] {
  return Object.fromEntries(nodes.filter(isRunnableNode).map((n) => [n.id, n.data.exports ?? []]))
}

function resolveContext(ctx: NodeContext, nodeId: string, scope: LoopScope): ResolveContext {
  return {
    outputs: ctx.outputs,
    exports: exportsByNodeId(ctx.nodes),
    upstreams: directUpstreams(ctx.edges, nodeId),
    index: scope.iteration ?? 0,
    item: scope.item,
    hasItem: scope.hasItem,
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Per-type dispatch shared by the top level and loop iterations. */
export function runNode(
  ctx: NodeContext,
  node: AppNode,
  runId: string,
  scope: LoopScope,
): Promise<NodeOutcome> | NodeOutcome | null {
  if (isTransformNode(node)) return runTransformNode(ctx, node, runId, scope)
  if (isMockNode(node)) return runMockNode(node, runId, scope)
  if (isDelayNode(node)) return runDelayNode(ctx, node, runId, scope)
  if (isHttpNode(node)) return runHttpNode(ctx, node, runId, scope)
  return null
}

/** Fields every row carries, so the five variants only add their own. */
function rowBase(node: AppNode, runId: string, scope: LoopScope) {
  return {
    id: logId(runId, node.id, scope),
    runId,
    time: logTime(),
    node: isRunnableNode(node) ? node.data.name : node.id,
    nodeId: node.id,
    ...iterTag(scope),
  }
}

async function runHttpNode(
  ctx: NodeContext,
  node: HttpNode,
  runId: string,
  scope: LoopScope,
): Promise<NodeOutcome> {
  await sleep(SIM_HTTP_LATENCY_MS)
  const fails = node.id === SIM_FAILING_NODE_ID
  const captured = fails ? undefined : fabricateResponse(ctx, node, scope)
  const log: LogEntry = {
    ...rowBase(node, runId, scope),
    kind: 'http',
    method: node.data.method,
    url: `${SIM_ORIGIN}${node.data.path.replace(SIM_PATH_PLACEHOLDER, SIM_PATH_ID)}`,
    status: fails ? SIM_FAILURE_STATUS : SIM_HTTP_STATUS,
    durationMs: SIM_HTTP_DURATION_MIN_MS + Math.floor(Math.random() * SIM_HTTP_DURATION_SPREAD_MS),
    error: fails ? SIM_FAILURE_ERROR : undefined,
    response: captured ? JSON.stringify(captured.body) : undefined,
  }
  if (fails) return { status: 'failed', note: SIM_FAILURE_NOTE, log }
  return { status: 'success', log, capture: captured }
}

/**
 * Executes one transform node and captures its synthetic output (status 0)
 * like any response, so downstream bindings, the picker and schema inference
 * work with zero special cases.
 */
async function runTransformNode(
  ctx: NodeContext,
  node: TransformNode,
  runId: string,
  scope: LoopScope,
): Promise<NodeOutcome> {
  const started = performance.now()
  const keys = keyByNodeId(ctx.nodes)
  const row = {
    ...rowBase(node, runId, scope),
    kind: 'transform' as const,
    inputNodes: directUpstreams(ctx.edges, node.id).map((id) => keys.get(id) ?? id),
  }
  try {
    const body = await executeTransform(node, ctx.nodes, ctx.edges, ctx.outputs, exportsByNodeId(ctx.nodes), {
      index: scope.iteration ?? 0,
      item: scope.item,
      hasItem: scope.hasItem,
    })
    const durationMs = Math.round(performance.now() - started)
    return {
      status: 'success',
      log: { ...row, durationMs, output: JSON.stringify(body) },
      capture: capture(0, body),
    }
  } catch (err) {
    const note = message(err)
    return { status: 'failed', note, log: { ...row, durationMs: Math.round(performance.now() - started), error: note } }
  }
}

/** Parses the authored JSON and emits it under the configured status. */
function runMockNode(node: MockNode, runId: string, scope: LoopScope): NodeOutcome {
  const row = {
    ...rowBase(node, runId, scope),
    kind: 'mock' as const,
    durationMs: 0,
    status: node.data.statusCode,
  }
  let body: unknown
  try {
    body = JSON.parse(node.data.body)
  } catch (err) {
    const note = message(err)
    return { status: 'failed', note, log: { ...row, error: note } }
  }
  const captured = capture(node.data.statusCode, body)
  return { status: 'success', log: { ...row, output: JSON.stringify(captured.body) }, capture: captured }
}

/**
 * Waits, then passes its single upstream's capture through unchanged so
 * downstream bindings resolve as if the delay were not there; with zero or
 * 2+ upstreams it outputs a status-0 null body (a gate, not a joiner). An
 * out-of-range duration is a config-tier failure — it fails only this node.
 */
async function runDelayNode(
  ctx: NodeContext,
  node: DelayNode,
  runId: string,
  scope: LoopScope,
): Promise<NodeOutcome> {
  const row = { ...rowBase(node, runId, scope), kind: 'delay' as const }
  const { durationMs } = node.data
  if (durationMs < DELAY_MIN_MS || durationMs > DELAY_MAX_MS) {
    const note = `duration must be ${DELAY_MIN_MS}–${DELAY_MAX_MS} ms`
    return { status: 'failed', note, log: { ...row, durationMs: 0, error: note } }
  }
  const waited = Math.min(durationMs, SIM_DELAY_CAP_MS)
  await sleep(waited)
  const ups = directUpstreams(ctx.edges, node.id)
  const passthrough = ups.length === 1 ? ctx.outputs[ups[0]] : undefined
  return { status: 'success', log: { ...row, durationMs: waited }, capture: passthrough ?? capture(0, null) }
}

/**
 * Fabricate the node's response: body.* fields (or the raw body in raw
 * mode) resolve against upstream captures — so bindings, res sugar,
 * templates and {{i}} behave like the real engine — over a server-shaped
 * id/created_at stub.
 */
function fabricateResponse(ctx: NodeContext, node: HttpNode, scope: LoopScope): CapturedResponse {
  const resolve = resolveContext(ctx, node.id, scope)
  const body = node.data.rawBody
    ? fabricateRawBody(node.data.rawBody.text, resolve)
    : fabricateFieldsBody(node.data.fields, resolve)
  return capture(SIM_HTTP_STATUS, body, { 'Content-Type': 'application/json' })
}

/** Fields mode: body.* rows over a server-shaped id/created_at stub. */
function fabricateFieldsBody(fields: readonly NodeField[], ctx: ResolveContext): unknown {
  const body: Record<string, unknown> = { id: pseudoUuid(), created_at: new Date().toISOString() }
  for (const field of fields) {
    if (!field.key.startsWith(BODY_KEY_PREFIX)) continue
    let value: unknown
    try {
      value = resolveField(field, ctx)
    } catch (err) {
      value = `«unresolved: ${message(err)}»`
    }
    setKeyPath(body, field.key.slice(BODY_KEY_PREFIX.length), value)
  }
  return body
}

/**
 * Raw mode: resolve {{…}} templates in the text, then echo a
 * JSON object merged over the id/created_at stub (user keys win, so a payload
 * without an id still supports the standard body.id binding demos), other
 * JSON values as-is, and non-JSON text as the string itself — truer than
 * substituting a JSON stub downstream bindings would misleadingly resolve
 * against.
 */
function fabricateRawBody(text: string, ctx: ResolveContext): unknown {
  let resolved: unknown
  try {
    resolved = resolveField(rawBodyField(text), ctx)
  } catch (err) {
    return `«unresolved: ${message(err)}»`
  }
  let parsed: unknown = resolved
  if (typeof resolved === 'string') {
    try {
      parsed = JSON.parse(resolved)
    } catch {
      return resolved
    }
  }
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { id: pseudoUuid(), created_at: new Date().toISOString(), ...parsed }
  }
  return parsed
}
