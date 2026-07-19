// Demo-only run simulation, extracted from state.svelte.ts (which owns the
// real state); replaced wholesale by engine events once M1 is wired in.
// Transforms execute for real (Pick on the mirrored resolver, Script in the
// Go sandbox); only http calls are simulated.
import { componentIds, downstreamIds, upstreamIds } from './graph'
import {
  DELAY_MAX_MS,
  DELAY_MIN_MS,
  isDelayNode,
  isForNode,
  isHttpNode,
  isMockNode,
  isRunnableNode,
  isTransformNode,
  type CapturedResponse,
  type DelayNode,
  type HttpNode,
  type MockNode,
  type NodeField,
  type TransformNode,
} from './model'
import { directUpstreams, keyByNodeId, resolveField, type ResolveContext } from './refs'
import type { AppState, RunScope } from './state.svelte'
import { executeTransform, setKeyPath } from './transform'

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
  // Loop children never run at top level either: the For executes them
  // (sim support lands with plan 09 N7; until then they sit out entirely).
  const excluded = new Set(
    app.nodes.filter((n) => n.type === 'note' || n.parentId).map((n) => n.id),
  )
  const order = executionOrder(app).filter(
    (id) => (!include || include.has(id)) && !excluded.has(id),
  )
  app.activeRunIds = new Set(order)

  for (const id of order) app.updateNodeData(id, { status: 'idle', note: undefined })

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
    if (isTransformNode(node)) {
      const ok = await runTransformNode(app, node, runId)
      if (!ok) failed.add(id)
      continue
    }
    if (isMockNode(node)) {
      if (!runMockNode(app, node)) failed.add(id)
      continue
    }
    if (isDelayNode(node)) {
      if (!(await runDelayNode(app, node))) failed.add(id)
      continue
    }
    if (isForNode(node)) {
      // Honest placeholder until N7: the sim cannot iterate loops yet, so
      // the For fails (skipping its downstream) instead of hanging.
      app.updateNodeData(id, { status: 'failed', note: 'loop runs are not simulated yet' })
      failed.add(id)
      continue
    }
    if (!isHttpNode(node)) continue
    await sleep(500)
    const fails = id === 'create-project'
    app.updateNodeData(
      id,
      fails ? { status: 'failed', note: '422 Unprocessable Entity' } : { status: 'success' },
    )
    if (fails) failed.add(id)
    const captured = fails ? null : captureSimulatedResponse(app, node)
    app.logs = [
      ...app.logs,
      {
        kind: 'http',
        id: `${runId}-${id}`,
        runId,
        time: new Date().toISOString().slice(11, 23),
        node: node.data.name,
        nodeId: id,
        method: node.data.method,
        url: `https://staging.api.example.com${node.data.path.replace('{id}', 'org_01HZX9')}`,
        status: fails ? 422 : 201,
        durationMs: 80 + Math.floor(Math.random() * 300),
        error: fails ? 'name "Apollo" already exists in org_01HZX9' : undefined,
        response: captured ? JSON.stringify(captured.body) : undefined,
      },
    ]
  }
  app.activeRunIds = null
  app.isRunning = false
  // Captured responses persist in the board layout (plan 05 §8).
  app.scheduleBoardSave()
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
async function runTransformNode(app: AppState, node: TransformNode, runId: string): Promise<boolean> {
  const started = performance.now()
  const keys = keyByNodeId(app.nodes)
  const entry = {
    kind: 'transform' as const,
    id: `${runId}-${node.id}`,
    runId,
    time: new Date().toISOString().slice(11, 23),
    node: node.data.name,
    nodeId: node.id,
    inputNodes: directUpstreams(app.edges, node.id).map((id) => keys.get(id) ?? id),
  }
  try {
    const body = await executeTransform(node, app.nodes, app.edges, app.responses, exportsByNodeId(app))
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
 * the authored JSON, emit it under the configured status. No log entry yet —
 * mock log rows ride with the LogsPanel work (N6/N7). Returns success.
 */
function runMockNode(app: AppState, node: MockNode): boolean {
  let body: unknown
  try {
    body = JSON.parse(node.data.body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    app.updateNodeData(node.id, { status: 'failed', note: message })
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
  return true
}

/**
 * Runs a delay node in the sim like the engine will (plan 09): waits, then
 * passes its single upstream's captured response through unchanged so
 * downstream bindings resolve as if the delay were not there; with zero or
 * 2+ upstreams it outputs a status-0 null body (a gate, not a joiner). An
 * out-of-range duration is a config-tier failure — it fails only this node.
 * No log entry yet — delay log rows ride with the LogsPanel work (N6/N7).
 */
async function runDelayNode(app: AppState, node: DelayNode): Promise<boolean> {
  const { durationMs } = node.data
  if (durationMs < DELAY_MIN_MS || durationMs > DELAY_MAX_MS) {
    app.updateNodeData(node.id, {
      status: 'failed',
      note: `duration must be ${DELAY_MIN_MS}–${DELAY_MAX_MS} ms`,
    })
    return false
  }
  await sleep(Math.min(durationMs, SIM_DELAY_CAP_MS))
  const ups = directUpstreams(app.edges, node.id)
  const passthrough = ups.length === 1 ? app.responses[ups[0]] : undefined
  app.responses = {
    ...app.responses,
    [node.id]: passthrough ?? { status: 0, body: null, at: new Date().toISOString() },
  }
  app.updateNodeData(node.id, { status: 'success' })
  return true
}

/**
 * Fabricate and store the node's response for the demo sim: body.* fields
 * (or the raw body in raw mode, plan 10 §3c) resolve against upstream
 * captures (so bindings, res sugar, templates and {{i}} behave like the real
 * engine), plus a server-shaped id/created_at.
 */
function captureSimulatedResponse(app: AppState, node: HttpNode): CapturedResponse {
  const ctx: ResolveContext = {
    outputs: app.responses,
    exports: exportsByNodeId(app),
    upstreams: directUpstreams(app.edges, node.id),
    index: 0,
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
