// The desktop app's node styling (frontend/src/lib/ui.ts), for the replica.
import type { Method } from './board'
import type { NodeStatus } from './runner.svelte'

export const METHOD_BADGE: Record<Method, string> = {
  GET: 'bg-sky-500/15 text-sky-400',
  POST: 'bg-emerald-500/15 text-emerald-400',
}

export const STATUS_DOT: Record<NodeStatus, string> = {
  idle: 'bg-zinc-500',
  running: 'bg-amber-400 animate-pulse',
  success: 'bg-emerald-400',
}

export const NODE_BORDER: Record<NodeStatus, string> = {
  idle: 'border-zinc-700',
  running: 'border-amber-400/70',
  success: 'border-zinc-700',
}

/** The loop container has no status row; its frame shows the run state. */
export const LOOP_BORDER: Record<NodeStatus, string> = {
  idle: 'border-zinc-700',
  running: 'border-sky-500/80',
  success: 'border-emerald-500/60',
}
