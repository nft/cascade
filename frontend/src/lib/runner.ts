// Starting and stopping a board run. Everything a run writes to the canvas
// goes through applyRunEvent; this module owns only the pre-flight, the call
// itself, and the cleanup that has to happen however the run ended.
import { api } from './api'
import { applyRunEvent, applyRunResult, RUN_FAILED_MESSAGE, runScopeOf } from './applyRunEvent'
import { serializeBoard } from './board'
import { dialogs } from './dialogs.svelte'
import { runSet } from './graph'
import type { RunRequest } from './runEvents'
import type { AppState, RunScope } from './state.svelte'

/** Ids only have to be unique within a session — one run is in flight at a time. */
function newRunId(): string {
  return `run-${Math.random().toString(16).slice(2, 6)}`
}

/**
 * Execute the board, or one node's subgraph, streaming events onto the canvas
 * until it finishes.
 */
export async function startRun(app: AppState, targetId?: string, scope: RunScope = 'upstream') {
  if (app.isRunning) return
  const { projectId, boardId } = runScopeOf(app)
  const runId = newRunId()
  preflight(app, runId, targetId, scope)
  // Subscribed for exactly the run's lifetime. It has to be in place before
  // the call below: the in-memory implementation emits synchronously while
  // runBoard is still awaiting.
  const unsubscribe = api.onRunEvent((event) => applyRunEvent(app, event))
  const request: RunRequest = {
    runId,
    boardId,
    // The live canvas, not the saved board: saving is debounced
    // and can be rejected, so the file may lag what the user is looking at.
    board: serializeBoard(boardId, app.boardName, app.nodes, app.edges, undefined, app.responses),
    ...(targetId ? { target: { node: targetId, scope } } : {}),
    seed: { ...app.responses },
  }
  try {
    applyRunResult(app, await api.runBoard(projectId, request))
  } catch (err) {
    dialogs.showToast(`${RUN_FAILED_MESSAGE}: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    unsubscribe()
    // A run that outlived a board switch, or that a later run replaced, must
    // not clear flags it no longer owns — nor save the new board on its behalf.
    if (app.runId === runId) {
      app.runId = null
      app.isRunning = false
      app.activeRunIds = null
      // Captured responses persist in the board layout.
      app.scheduleBoardSave()
    }
  }
}

/** Cancel the in-flight run, if there is one. Idle is a no-op, so a double click cannot error. */
export async function stopRun(app: AppState) {
  const runId = app.runId
  if (runId) await api.stopRun(runId)
}

/**
 * Paints the run set and clears last run's statuses, synchronously — before
 * the first await, so the canvas responds on the click rather than a round
 * trip later. `runSet` is the engine's own rule, so the `run.started` that
 * replaces this set confirms it rather than correcting it.
 */
function preflight(app: AppState, runId: string, targetId: string | undefined, scope: RunScope) {
  app.isRunning = true
  app.runId = runId
  const include = targetId ? runSet(app.nodes, app.edges, targetId, scope) : null
  // Note nodes are annotations — they never run, so they keep no status.
  const runIds = app.nodes
    .filter((n) => n.type !== 'note' && (!include || include.has(n.id)))
    .map((n) => n.id)
  app.activeRunIds = new Set(runIds)
  for (const id of runIds) app.updateNodeData(id, { status: 'idle', note: undefined })
}
