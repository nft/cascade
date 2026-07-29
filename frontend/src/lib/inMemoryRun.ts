// The in-memory run: the browser/vitest stand-in for a Go engine run, driving
// the same event stream the real one does. It takes a serialized board and
// returns a RunResult, exactly like RunBoard — so nothing above it knows which
// side executed. Per-node execution lives in inMemoryNodes.ts.
import { deserializeBoard } from './board'
import { componentIds, downstreamIds, upstreamIds } from './graph'
import {
  capture,
  exportsByNodeId,
  iterTag,
  logId,
  logTime,
  runNode,
  TOP_SCOPE,
  type LoopScope,
  type NodeContext,
  type NodeOutcome,
} from './inMemoryNodes'
import {
  FOR_MAX_ITERATIONS,
  FOR_MIN_COUNT,
  isDelayNode,
  isForNode,
  isRunnableNode,
  type AppNode,
  type ForLogEntry,
  type ForNode,
} from './model'
import { directUpstreams, resolveField } from './refs'
import { RunEventKind, type RunEvent, type RunRequest, type RunResult, type RunStatus } from './runEvents'

export interface InMemoryRunOptions {
  projectId: string
  request: RunRequest
  /** Called synchronously as the run goes, so fake timers drive a whole run. */
  emit: (event: RunEvent) => void
  /**
   * True once stopRun named this run. Checked between nodes and between loop
   * iterations — the same two seams exec checks ctx.Err() at.
   */
  cancelled: () => boolean
}

export function inMemoryRun(options: InMemoryRunOptions): Promise<RunResult> {
  return new InMemoryRun(options).execute()
}

class InMemoryRun {
  private readonly ctx: NodeContext
  private readonly statuses: Record<string, RunStatus> = {}
  private readonly notes: Record<string, string> = {}

  constructor(private readonly options: InMemoryRunOptions) {
    const { nodes, edges } = deserializeBoard(options.request.board)
    this.ctx = { nodes, edges, outputs: { ...options.request.seed } }
  }

  async execute(): Promise<RunResult> {
    const runIds = this.plan()
    // A seed for a node inside the run set is ignored (plan 11 D10): the node
    // is about to produce its own output, and a script binding by key — which
    // travels along no edge — would otherwise read the previous run's value
    // instead of finding it absent.
    for (const id of runIds.all) delete this.ctx.outputs[id]
    this.event(RunEventKind.RunStarted, { nodes: runIds.all })

    const failed = new Set<string>()
    for (const id of runIds.order) {
      if (this.options.cancelled()) break
      const node = this.ctx.nodes.find((n) => n.id === id)
      if (!node) continue
      if (this.upstreamFailed(id, failed)) {
        failed.add(id)
        this.skip(id, TOP_SCOPE)
        continue
      }
      this.event(RunEventKind.NodeStarted, { node: id })
      const ok = isForNode(node) ? await this.runFor(node) : await this.runOne(node, TOP_SCOPE)
      if (!ok) failed.add(id)
    }

    const cancelled = this.options.cancelled()
    this.event(RunEventKind.RunFinished, cancelled ? { cancelled } : {})
    return {
      runId: this.options.request.runId,
      projectId: this.options.projectId,
      boardId: this.options.request.boardId,
      statuses: this.statuses,
      ...(Object.keys(this.notes).length > 0 ? { notes: this.notes } : {}),
      ...(cancelled ? { cancelled } : {}),
    }
  }

  /**
   * The run set: the target's subgraph (or the whole board), minus notes —
   * annotations never run — and minus loop children, which their For executes
   * rather than the top level.
   */
  private plan(): { order: string[]; all: string[] } {
    const { nodes, edges } = this.ctx
    const target = this.options.request.target
    const include = target
      ? target.scope === 'upstream'
        ? upstreamIds(edges, target.node)
        : target.scope === 'downstream'
          ? downstreamIds(edges, target.node)
          : componentIds(edges, target.node)
      : null
    const excluded = new Set(nodes.filter((n) => n.type === 'note' || n.parentId).map((n) => n.id))
    const order = executionOrder(nodes, edges).filter(
      (id) => (!include || include.has(id)) && !excluded.has(id),
    )
    const topLevel = new Set(order)
    const loopChildren = nodes.filter((n) => n.parentId && topLevel.has(n.parentId)).map((n) => n.id)
    return { order, all: [...order, ...loopChildren] }
  }

  private upstreamFailed(id: string, failed: ReadonlySet<string>): boolean {
    return this.ctx.edges.some((e) => e.target === id && failed.has(e.source))
  }

  private event(kind: RunEventKind, extra: Omit<RunEvent, 'kind' | 'runId' | 'projectId' | 'boardId'>) {
    this.options.emit({
      kind,
      runId: this.options.request.runId,
      projectId: this.options.projectId,
      boardId: this.options.request.boardId,
      ...extra,
    })
  }

  /** A skip carries a status but no log row — there is no record of a call that never happened. */
  private skip(id: string, scope: LoopScope) {
    this.statuses[id] = 'skipped'
    this.event(RunEventKind.NodeFinished, { node: id, ...iterTag(scope), status: 'skipped' })
  }

  /** Executes one non-For node and records what it produced. Returns success. */
  private async runOne(node: AppNode, scope: LoopScope): Promise<boolean> {
    const outcome = await runNode(this.ctx, node, this.options.request.runId, scope)
    // A node type that does not execute (only notes today, and those are
    // excluded from the run set) leaves no row and blocks nothing downstream.
    if (!outcome) {
      this.statuses[node.id] = 'success'
      return true
    }
    this.record(node.id, scope, outcome)
    return outcome.status === 'success'
  }

  private record(id: string, scope: LoopScope, outcome: NodeOutcome) {
    this.statuses[id] = outcome.status
    if (outcome.note !== undefined) this.notes[id] = outcome.note
    if (outcome.capture) this.ctx.outputs[id] = outcome.capture
    this.event(RunEventKind.NodeFinished, {
      node: id,
      ...iterTag(scope),
      status: outcome.status,
      ...(outcome.note !== undefined ? { note: outcome.note } : {}),
      log: outcome.log,
      ...(outcome.capture ? { capture: outcome.capture } : {}),
    })
  }

  /**
   * Runs a For container (plan 09): count or each iterations over the child
   * sub-order, `i`/`item` in scope, fail-fast, live progress, and a per-child
   * aggregate output keyed by child key (delay children excluded) that
   * downstream `[*]` bindings map over. Config problems fail only this node.
   */
  private async runFor(node: ForNode): Promise<boolean> {
    const started = performance.now()
    const fail = (note: string, iterations: number): false => {
      this.record(node.id, TOP_SCOPE, { status: 'failed', note, log: this.forRow(node, started, iterations, note) })
      return false
    }

    const children = this.ctx.nodes.filter((n) => n.parentId === node.id).filter(isRunnableNode)
    if (children.length === 0) return fail('loop has no children', 0)

    let items: unknown[] | undefined
    let total: number
    if (node.data.mode === 'each') {
      const source = node.data.source
      if (!source) return fail('each mode needs an array source', 0)
      let value: unknown
      try {
        value = resolveField(
          { key: 'source', source: 'binding', value: '', ref: source },
          {
            outputs: this.ctx.outputs,
            exports: exportsByNodeId(this.ctx.nodes),
            upstreams: directUpstreams(this.ctx.edges, node.id),
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
    const order = executionOrder(this.ctx.nodes, this.ctx.edges).filter((id) => childIds.has(id))
    const aggregates: Record<string, unknown[]> = {}
    for (const child of children) if (!isDelayNode(child)) aggregates[child.data.key] = []

    this.event(RunEventKind.LoopProgress, { node: node.id, progress: { done: 0, total } })
    for (let k = 0; k < total; k++) {
      if (this.options.cancelled()) break
      const scope: LoopScope = { iteration: k, item: items?.[k], hasItem: items !== undefined }
      const iterationFailed = new Set<string>()
      for (const id of order) {
        const child = this.ctx.nodes.find((n) => n.id === id)
        if (!child) continue
        if (this.upstreamFailed(id, iterationFailed)) {
          iterationFailed.add(id)
          this.skip(id, scope)
          continue
        }
        this.event(RunEventKind.NodeStarted, { node: id, ...iterTag(scope) })
        if (!(await this.runOne(child, scope))) iterationFailed.add(id)
      }
      // Fail-fast: a failed iteration aborts the remaining ones (plan 09).
      if (iterationFailed.size > 0) return fail(`iteration ${k + 1} of ${total} failed`, k)
      for (const child of children) {
        if (isDelayNode(child)) continue
        aggregates[child.data.key].push(this.ctx.outputs[child.id]?.body ?? null)
      }
      this.event(RunEventKind.LoopProgress, { node: node.id, progress: { done: k + 1, total } })
    }

    this.record(node.id, TOP_SCOPE, {
      status: 'success',
      log: this.forRow(node, started, total),
      capture: capture(0, aggregates),
    })
    return true
  }

  private forRow(node: ForNode, started: number, iterations: number, error?: string): ForLogEntry {
    return {
      kind: 'for',
      id: logId(this.options.request.runId, node.id, TOP_SCOPE),
      runId: this.options.request.runId,
      time: logTime(),
      node: node.data.name,
      nodeId: node.id,
      durationMs: Math.round(performance.now() - started),
      iterations,
      ...(error === undefined ? {} : { error }),
    }
  }
}

function jsonTypeName(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/** Topological order; nodes in cycles are dropped (the canvas rejects cycles anyway). */
function executionOrder(nodes: AppNode[], edges: readonly { source: string; target: string }[]): string[] {
  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  for (const e of edges) indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
  const ready = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id)
  const order: string[] = []
  while (ready.length > 0) {
    const id = ready.shift()!
    order.push(id)
    for (const e of edges) {
      if (e.source !== id) continue
      const remaining = (indegree.get(e.target) ?? 0) - 1
      indegree.set(e.target, remaining)
      if (remaining === 0) ready.push(e.target)
    }
  }
  return order
}
