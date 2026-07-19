// Demo-only run simulation, extracted from state.svelte.ts (which owns the
// real state); replaced wholesale by engine events once M1 is wired in.
// Transforms execute for real (Pick on the mirrored resolver, Script in the
// Go sandbox); only http calls are simulated.
import { componentIds, downstreamIds, upstreamIds } from './graph'
import {
  DELAY_MAX_MS,
  DELAY_MIN_MS,
  FOR_MAX_ITERATIONS,
  FOR_MIN_COUNT,
  isDelayNode,
  isForNode,
  isHttpNode,
  isMockNode,
  isRunnableNode,
  isTransformNode,
  type AppNode,
  type CapturedResponse,
  type DelayNode,
  type ForLogEntry,
  type ForNode,
  type HttpNode,
  type MockNode,
  type NodeField,
  type TransformNode,
} from './model'
import { directUpstreams, keyByNodeId, resolveField, type ResolveContext } from './refs'
import type { AppState, RunScope } from './state.svelte'
import { executeTransform, setKeyPath } from './transform'

/**
 * The loop scope a node runs under (plan 09 N7): iteration index and, in
 * each mode, the current array element. Top level runs under TOP_SCOPE.
 */
interface SimScope {
  /** 0-based loop iteration; undefined outside a loop. */
  iteration?: number
  item?: unknown
  hasItem: boolean
}

const TOP_SCOPE: SimScope = { hasItem: false }

/** Log row id — iteration runs need a per-iteration suffix to stay unique. */
function logId(runId: string, nodeId: string, scope: SimScope): string {
  return scope.iteration === undefined
    ? `${runId}-${nodeId}`
    : `${runId}-${nodeId}-${scope.iteration}`
}

/** The optional `iteration` log field, spread into entries. */
function iterTag(scope: SimScope): { iteration?: number } {
  return scope.iteration === undefined ? {} : { iteration: scope.iteration }
}

const logTime = () => new Date().toISOString().slice(11, 23)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Demo-sim id generator: uuid-shaped so schema inference can show its format guess. */
function pseudoUuid(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16)
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, hex)
}

/** Captured response bodies above this JSON size are dropped (plan 05 §8). */
const RESPONSE_BODY_CAP_BYTES = 256 * 1024

/** Demo-sim delays sleep for real but capped — a 5-minute delay must not wedge the demo (plan 09 N7). */
export const SIM_DELAY_CAP_MS = 3000

/**
 * Demo run simulation. With a target, only the target's upstream set,
 * downstream chain, or weakly-connected component runs — the same node-set
 * semantics as the engine's planned `Options.Target` subgraph runs (M1 WP5).
 * Nodes outside the set keep their previous status.
 */
export async function simulateRun(app: AppState, targetId?: string, scope: RunScope = 'upstream') {
  if (app.isRunning) return
  app.isRunning = true
  const runId = `run-${Math.random().toString(16).slice(2, 6)}`
  const include = targetId
    ? scope === 'upstream'
      ? upstreamIds(app.edges, targetId)
      : scope === 'downstream'
        ? downstreamIds(app.edges, targetId)
        : componentIds(app.edges, targetId)
    : null
  // Note nodes are annotations — they never run, so they keep no status.
  // Loop children never run at top level: their For executes them.
  const excluded = new Set(
    app.nodes.filter((n) => n.type === 'note' || n.parentId).map((n) => n.id),
  )
  const order = executionOrder(app).filter(
    (id) => (!include || include.has(id)) && !excluded.has(id),
  )
  const topLevel = new Set(order)
  const loopChildren = app.nodes
    .filter((n) => n.parentId && topLevel.has(n.parentId))
    .map((n) => n.id)
  app.activeRunIds = new Set([...order, ...loopChildren])

  for (const id of [...order, ...loopChildren])
    app.updateNodeData(id, { status: 'idle', note: undefined })

  const failed = new Set<string>()
  for (const id of order) {
    const node = app.nodes.find((n) => n.id === id)
    if (!node) continue
    const upstreamFailed = app.edges.some((e) => e.target === id && failed.has(e.source))
    if (upstreamFailed) {
      failed.add(id)
      app.updateNodeData(id, { status: 'skipped' })
      continue
    }
    app.updateNodeData(id, { status: 'running' })
    if (isForNode(node)) {
      if (!(await runForNode(app, node, runId))) failed.add(id)
      continue
    }
    if (!(await runNode(app, node, runId, TOP_SCOPE))) failed.add(id)
  }
  app.activeRunIds = null
  app.isRunning = false
  // Captured responses persist in the board layout (plan 05 §8).
  app.scheduleBoardSave()
}

/** Per-type dispatch shared by the top level and loop iterations. Returns success. */
async function runNode(app: AppState, node: AppNode, runId: string, scope: SimScope): Promise<boolean> {
  if (isTransformNode(node)) return runTransformNode(app, node, runId, scope)
  if (isMockNode(node)) return runMockNode(app, node, runId, scope)
  if (isDelayNode(node)) return runDelayNode(app, node, runId, scope)
  if (isHttpNode(node)) return runHttpNode(app, node, runId, scope)
  return true
}

async function runHttpNode(app: AppState, node: HttpNode, runId: string, scope: SimScope): Promise<boolean> {
  await sleep(500)
  const fails = node.id === 'create-project'
  app.updateNodeData(
    node.id,
    fails ? { status: 'failed', note: '422 Unprocessable Entity' } : { status: 'success' },
  )
  const captured = fails ? null : captureSimulatedResponse(app, node, scope)
  app.logs = [
    ...app.logs,
    {
      kind: 'http',
      id: logId(runId, node.id, scope),
      runId,
      time: logTime(),
      node: node.data.name,
      nodeId: node.id,
      ...iterTag(scope),
      method: node.data.method,
      url: `https://staging.api.example.com${node.data.path.replace('{id}', 'org_01HZX9')}`,
      status: fails ? 422 : 201,
      durationMs: 80 + Math.floor(Math.random() * 300),
      error: fails ? 'name "Apollo" already exists in org_01HZX9' : undefined,
      response: captured ? JSON.stringify(captured.body) : undefined,
    },
  ]
  return !fails
}

/** Declared exports by node id, for binding resolution (http and transform nodes alike). */
function exportsByNodeId(app: AppState): ResolveContext['exports'] {
  return Object.fromEntries(
    app.nodes.filter(isRunnableNode).map((n) => [n.id, n.data.exports ?? []]),
  )
}

/**
 * Executes one transform node during the sim and captures its synthetic
 * output (status 0) like any response, so downstream bindings, the picker
 * and schema inference work with zero special cases. Returns success.
 */
async function runTransformNode(
  app: AppState,
  node: TransformNode,
  runId: string,
  scope: SimScope,
): Promise<boolean> {
  const started = performance.now()
  const keys = keyByNodeId(app.nodes)
  const entry = {
    kind: 'transform' as const,
    id: logId(runId, node.id, scope),
    runId,
    time: logTime(),
    node: node.data.name,
    nodeId: node.id,
    ...iterTag(scope),
    inputNodes: directUpstreams(app.edges, node.id).map((id) => keys.get(id) ?? id),
  }
  try {
    const body = await executeTransform(node, app.nodes, app.edges, app.responses, exportsByNodeId(app), {
      index: scope.iteration ?? 0,
      item: scope.item,
      hasItem: scope.hasItem,
    })
    const captured: CapturedResponse = { status: 0, body, at: new Date().toISOString() }
    if (JSON.stringify(captured.body).length > RESPONSE_BODY_CAP_BYTES) {
      captured.body = null
      captured.truncated = true
    }
    app.responses = { ...app.responses, [node.id]: captured }
    app.updateNodeData(node.id, { status: 'success' })
    app.logs = [
      ...app.logs,
      { ...entry, durationMs: Math.round(performance.now() - started), output: JSON.stringify(body) },
    ]
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    app.updateNodeData(node.id, { status: 'failed', note: message })
    app.logs = [
      ...app.logs,
      { ...entry, durationMs: Math.round(performance.now() - started), error: message },
    ]
    return false
  }
}

/**
 * Runs a mock node in the sim exactly like the engine will (plan 09): parse
 * the authored JSON, emit it under the configured status. Returns success.
 */
function runMockNode(app: AppState, node: MockNode, runId: string, scope: SimScope): boolean {
  const entry = {
    kind: 'mock' as const,
    id: logId(runId, node.id, scope),
    runId,
    time: logTime(),
    node: node.data.name,
    nodeId: node.id,
    ...iterTag(scope),
    durationMs: 0,
    status: node.data.statusCode,
  }
  let body: unknown
  try {
    body = JSON.parse(node.data.body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    app.updateNodeData(node.id, { status: 'failed', note: message })
    app.logs = [...app.logs, { ...entry, error: message }]
    return false
  }
  const captured: CapturedResponse = {
    status: node.data.statusCode,
    body,
    at: new Date().toISOString(),
  }
  if (JSON.stringify(captured.body).length > RESPONSE_BODY_CAP_BYTES) {
    captured.body = null
    captured.truncated = true
  }
  app.responses = { ...app.responses, [node.id]: captured }
  app.updateNodeData(node.id, { status: 'success' })
  app.logs = [...app.logs, { ...entry, output: JSON.stringify(captured.body) }]
  return true
}

/**
 * Runs a delay node in the sim like the engine will (plan 09): waits, then
 * passes its single upstream's captured response through unchanged so
 * downstream bindings resolve as if the delay were not there; with zero or
 * 2+ upstreams it outputs a status-0 null body (a gate, not a joiner). An
 * out-of-range duration is a config-tier failure — it fails only this node.
 */
async function runDelayNode(app: AppState, node: DelayNode, runId: string, scope: SimScope): Promise<boolean> {
  const entry = {
    kind: 'delay' as const,
    id: logId(runId, node.id, scope),
    runId,
    time: logTime(),
    node: node.data.name,
    nodeId: node.id,
    ...iterTag(scope),
  }
  const { durationMs } = node.data
  if (durationMs < DELAY_MIN_MS || durationMs > DELAY_MAX_MS) {
    const message = `duration must be ${DELAY_MIN_MS}–${DELAY_MAX_MS} ms`
    app.updateNodeData(node.id, { status: 'failed', note: message })
    app.logs = [...app.logs, { ...entry, durationMs: 0, error: message }]
    return false
  }
  const waited = Math.min(durationMs, SIM_DELAY_CAP_MS)
  await sleep(waited)
  const ups = directUpstreams(app.edges, node.id)
  const passthrough = ups.length === 1 ? app.responses[ups[0]] : undefined
  app.responses = {
    ...app.responses,
    [node.id]: passthrough ?? { status: 0, body: null, at: new Date().toISOString() },
  }
  app.updateNodeData(node.id, { status: 'success' })
  app.logs = [...app.logs, { ...entry, durationMs: waited }]
  return true
}

/**
 * Runs a For container in the sim like the engine does (plan 09): count or
 * each iterations over the child sub-order, `i`/`item` in scope, fail-fast,
 * live progress on the header, and a per-child aggregate output keyed by
 * child key (delay children excluded) that downstream `[*]` bindings map
 * over. Config problems fail only this node. Returns success.
 */
async function runForNode(app: AppState, node: ForNode, runId: string): Promise<boolean> {
  const started = performance.now()
  const fail = (note: string, iterations: number): false => {
    app.updateNodeData(node.id, { status: 'failed', note, progress: undefined })
    app.logs = [...app.logs, forSummary(node, runId, started, iterations, note)]
    return false
  }

  const children = app.nodes.filter((n) => n.parentId === node.id).filter(isRunnableNode)
  if (children.length === 0) return fail('loop has no children', 0)

  let items: unknown[] | undefined
  let total: number
  if (node.data.mode === 'each') {
    const src = node.data.source
    if (!src) return fail('each mode needs an array source', 0)
    let value: unknown
    try {
      value = resolveField(
        { key: 'source', source: 'binding', value: '', ref: src },
        {
          outputs: app.responses,
          exports: exportsByNodeId(app),
          upstreams: directUpstreams(app.edges, node.id),
          index: 0,
        },
      )
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err), 0)
    }
    if (!Array.isArray(value)) return fail(`each source must be an array, got ${jsonTypeName(value)}`, 0)
    items = value.slice(0, FOR_MAX_ITERATIONS)
    total = items.length
  } else {
    if (node.data.count < FOR_MIN_COUNT || node.data.count > FOR_MAX_ITERATIONS)
      return fail(`count must be ${FOR_MIN_COUNT}–${FOR_MAX_ITERATIONS}`, 0)
    total = node.data.count
  }

  const childIds = new Set(children.map((c) => c.id))
  const order = executionOrder(app).filter((id) => childIds.has(id))
  const aggregates: Record<string, unknown[]> = {}
  for (const child of children) if (!isDelayNode(child)) aggregates[child.data.key] = []

  app.updateNodeData(node.id, { progress: { done: 0, total } })
  for (let k = 0; k < total; k++) {
    const scope: SimScope = { iteration: k, item: items?.[k], hasItem: items !== undefined }
    const iterFailed = new Set<string>()
    for (const id of order) {
      const child = app.nodes.find((n) => n.id === id)
      if (!child) continue
      if (app.edges.some((e) => e.target === id && iterFailed.has(e.source))) {
        iterFailed.add(id)
        app.updateNodeData(id, { status: 'skipped' })
        continue
      }
      app.updateNodeData(id, { status: 'running' })
      if (!(await runNode(app, child, runId, scope))) iterFailed.add(id)
    }
    // Fail-fast: a failed iteration aborts the remaining ones (plan 09).
    if (iterFailed.size > 0) return fail(`iteration ${k + 1} of ${total} failed`, k)
    for (const child of children) {
      if (isDelayNode(child)) continue
      aggregates[child.data.key].push(app.responses[child.id]?.body ?? null)
    }
    app.updateNodeData(node.id, { progress: { done: k + 1, total } })
  }

  const captured: CapturedResponse = { status: 0, body: aggregates, at: new Date().toISOString() }
  if (JSON.stringify(captured.body).length > RESPONSE_BODY_CAP_BYTES) {
    captured.body = null
    captured.truncated = true
  }
  app.responses = { ...app.responses, [node.id]: captured }
  app.updateNodeData(node.id, { status: 'success', progress: undefined })
  app.logs = [...app.logs, forSummary(node, runId, started, total)]
  return true
}

function forSummary(
  node: ForNode,
  runId: string,
  started: number,
  iterations: number,
  error?: string,
): ForLogEntry {
  return {
    kind: 'for',
    id: `${runId}-${node.id}`,
    runId,
    time: logTime(),
    node: node.data.name,
    nodeId: node.id,
    durationMs: Math.round(performance.now() - started),
    iterations,
    ...(error === undefined ? {} : { error }),
  }
}

function jsonTypeName(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/**
 * Fabricate and store the node's response for the demo sim: body.* fields
 * (or the raw body in raw mode, plan 10 §3c) resolve against upstream
 * captures (so bindings, res sugar, templates and {{i}} behave like the real
 * engine), plus a server-shaped id/created_at.
 */
function captureSimulatedResponse(app: AppState, node: HttpNode, scope: SimScope): CapturedResponse {
  const ctx: ResolveContext = {
    outputs: app.responses,
    exports: exportsByNodeId(app),
    upstreams: directUpstreams(app.edges, node.id),
    index: scope.iteration ?? 0,
    item: scope.item,
    hasItem: scope.hasItem,
  }
  const body = node.data.rawBody
    ? fabricateRawBody(node.data.rawBody.text, ctx)
    : fabricateFieldsBody(node.data.fields, ctx)
  const captured: CapturedResponse = {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body,
    at: new Date().toISOString(),
  }
  if (JSON.stringify(captured.body).length > RESPONSE_BODY_CAP_BYTES) {
    captured.body = null
    captured.truncated = true
  }
  app.responses = { ...app.responses, [node.id]: captured }
  return captured
}

/** Fields mode: body.* rows over a server-shaped id/created_at stub. */
function fabricateFieldsBody(fields: readonly NodeField[], ctx: ResolveContext): unknown {
  const body: Record<string, unknown> = {
    id: pseudoUuid(),
    created_at: new Date().toISOString(),
  }
  for (const field of fields) {
    if (!field.key.startsWith('body.')) continue
    let value: unknown
    try {
      value = resolveField(field, ctx)
    } catch (err) {
      value = `«unresolved: ${err instanceof Error ? err.message : String(err)}»`
    }
    setKeyPath(body, field.key.slice('body.'.length), value)
  }
  return body
}

/**
 * Raw mode (plan 10 §3c): resolve {{…}} templates in the text, then echo a
 * JSON object merged over the id/created_at stub (user keys win, so a payload
 * without an id still supports the standard body.id binding demos), other
 * JSON values as-is, and non-JSON text as the string itself — truer than
 * substituting a JSON stub downstream bindings would misleadingly resolve
 * against.
 */
function fabricateRawBody(text: string, ctx: ResolveContext): unknown {
  let resolved: unknown
  try {
    resolved = resolveField({ key: 'rawBody', source: 'template', value: text }, ctx)
  } catch (err) {
    return `«unresolved: ${err instanceof Error ? err.message : String(err)}»`
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

/** Topological order over the current canvas; nodes in cycles are dropped (canvas rejects cycles anyway). */
function executionOrder(app: AppState): string[] {
  const indegree = new Map<string, number>(app.nodes.map((n) => [n.id, 0]))
  for (const e of app.edges) indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
  const ready = app.nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id)
  const order: string[] = []
  while (ready.length > 0) {
    const id = ready.shift()!
    order.push(id)
    for (const e of app.edges) {
      if (e.source !== id) continue
      const d = (indegree.get(e.target) ?? 0) - 1
      indegree.set(e.target, d)
      if (d === 0) ready.push(e.target)
    }
  }
  return order
}
