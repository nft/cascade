// The only place a run writes to AppState. Pure and synchronous: every rule
// about how a run repaints the canvas is testable by handing it a scripted
// array of events, with no timers, no promises and no backend.
import { dialogs } from './dialogs.svelte'
import { RunEventKind, type RunEvent, type RunResult } from './runEvents'
import type { AppState } from './state.svelte'

/** Prefix of the toast raised when the engine reports a run-level failure. */
export const RUN_FAILED_MESSAGE = 'Run failed'

/**
 * The (project, board) pair a run is scoped to (plan 11 D17). Both are '' when
 * no project is open — the state unit tests assemble by hand — so the
 * comparison stays a plain string equality on every path.
 */
export function runScopeOf(app: AppState): { projectId: string; boardId: string } {
  return { projectId: app.projectId ?? '', boardId: app.boardId ?? '' }
}

function inScope(app: AppState, e: { projectId: string; boardId: string }): boolean {
  const scope = runScopeOf(app)
  return e.projectId === scope.projectId && e.boardId === scope.boardId
}

/** Apply one live transition. Events for another board are dropped whole. */
export function applyRunEvent(app: AppState, e: RunEvent): void {
  // Events from a run started on another board must not touch this one. Node
  // ids collide across projects by construction (every project is seeded from
  // the same seed/default.json, and a shared board imports with its ids
  // intact), so an id match proves nothing.
  if (!inScope(app, e)) return
  switch (e.kind) {
    case RunEventKind.RunStarted:
      // The engine's set is authoritative; it replaces the pre-flight's guess.
      app.activeRunIds = new Set(e.nodes ?? [])
      return
    case RunEventKind.NodeStarted:
      if (e.node) app.updateNodeData(e.node, { status: 'running' })
      return
    case RunEventKind.NodeFinished:
      applyNodeFinished(app, e)
      return
    case RunEventKind.LoopProgress:
      if (e.node) app.updateNodeData(e.node, { progress: e.progress })
      return
    case RunEventKind.RunFinished:
      if (e.error) dialogs.showToast(`${RUN_FAILED_MESSAGE}: ${e.error}`)
  }
}

function applyNodeFinished(app: AppState, e: RunEvent): void {
  if (!e.node || !e.status) return
  // progress is cleared here rather than by the For's own bookkeeping: a loop
  // that fails mid-iteration still ends, and a stale bar on the header would
  // outlive the run.
  app.updateNodeData(e.node, { status: e.status, note: e.note, progress: undefined })
  if (e.log) app.logs = [...app.logs, e.log]
  if (e.capture) app.responses = { ...app.responses, [e.node]: e.capture }
}

/**
 * Reconcile the canvas against the run's terminal statuses (D12). The event
 * channel is lossless inside Go, but the Wails bus across the webview
 * boundary offers no delivery guarantee — without this a dropped
 * node.finished leaves a node spinning forever with the run already over.
 */
export function applyRunResult(app: AppState, result: RunResult): void {
  if (!inScope(app, result)) return
  for (const [id, status] of Object.entries(result.statuses)) {
    const data = app.nodes.find((n) => n.id === id)?.data
    if (!data || !('status' in data)) continue
    const note = result.notes?.[id]
    if (data.status === status && data.note === note) continue
    app.updateNodeData(id, { status, note })
  }
}
