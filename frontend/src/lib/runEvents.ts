// The run wire protocol (plan 11 D13): one Wails event name carrying a
// discriminated payload, so "events arrive in emission order" is structural
// rather than something the frontend has to reason about, and there is one
// subscription and one teardown.
//
// Every type here mirrors a Go DTO in runlog.go / run.go. The log row is
// model.ts's own `LogEntry` union on purpose (D14): Go builds exactly that
// shape, and a parallel type would be the drift this decision exists to
// prevent.
import { EventsOn } from '../../wailsjs/runtime/runtime'
import type { BoardJSON, CapturedResponse, LogEntry, NodeStatus } from './model'
import type { RunScope } from './state.svelte'

/** The single Wails event name (main.RunEventName). */
export const RUN_EVENT_NAME = 'run:event'

/** Discriminator values (core/exec EventKind). */
export const RunEventKind = {
  RunStarted: 'run.started',
  NodeStarted: 'node.started',
  NodeFinished: 'node.finished',
  LoopProgress: 'loop.progress',
  RunFinished: 'run.finished',
} as const

export type RunEventKind = (typeof RunEventKind)[keyof typeof RunEventKind]

/**
 * A node's terminal outcome (core/exec Status). Deliberately narrower than
 * NodeStatus: `running` is carried by node.started, and `idle`/`stale` are
 * canvas-only states the engine never reports.
 */
export type RunStatus = Extract<NodeStatus, 'success' | 'failed' | 'skipped'>

export interface RunProgress {
  done: number
  total: number
}

/** Which subgraph to run (main.RunTarget); absent means the whole board. */
export interface RunTarget {
  node: string
  scope: RunScope
}

/** One board run (main.RunRequest). */
export interface RunRequest {
  runId: string
  /** Scopes every emitted event (D17); the run holds its own copy of the board. */
  boardId: string
  /** The LIVE canvas, not the stored board — saving is debounced and can be rejected (D1). */
  board: BoardJSON
  target?: RunTarget
  /** Captures for nodes outside the run set, so a targeted run resolves bindings. */
  seed?: Record<string, CapturedResponse>
}

/**
 * The terminal reconciliation (main.RunResult). Per-node data travels as
 * events; this is the backstop, so an event the Wails bus drops cannot leave
 * the canvas wrong (D12).
 */
export interface RunResult {
  runId: string
  projectId: string
  boardId: string
  statuses: Record<string, RunStatus>
  notes?: Record<string, string>
  cancelled?: boolean
}

/** One live run transition (main.runEvent); kind says which halves are set. */
export interface RunEvent {
  kind: RunEventKind
  runId: string
  projectId: string
  boardId: string
  /** The emitting node; absent on the two run-level kinds. */
  node?: string
  /** 0-based loop iteration; absent outside a loop. */
  iteration?: number
  /** node.finished only. */
  status?: RunStatus
  note?: string
  /** run.started only: the engine's authoritative run set. */
  nodes?: string[]
  /** loop.progress only. */
  progress?: RunProgress
  /** node.finished: the log row, absent for a skip (which produces no record). */
  log?: LogEntry
  /** node.finished: the produced output, absent on failure and on a skip. */
  capture?: CapturedResponse
  /** run.finished only. */
  error?: string
  cancelled?: boolean
}

/**
 * Subscribe to the Go event stream; returns the unsubscribe. Guarded the same
 * way api.ts selects its backend: wailsjs/runtime calls window.runtime, which
 * is undefined outside Wails and would throw in vitest.
 */
export function subscribeRunEvents(handler: (event: RunEvent) => void): () => void {
  if (typeof window === 'undefined' || window.go === undefined) return () => {}
  return EventsOn(RUN_EVENT_NAME, (event: RunEvent) => handler(event))
}
