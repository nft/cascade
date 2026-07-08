import type { HttpMethod, NodeStatus } from './model'

export const methodBadge: Record<HttpMethod, string> = {
  GET: 'bg-sky-500/15 text-sky-400',
  POST: 'bg-emerald-500/15 text-emerald-400',
  PUT: 'bg-amber-500/15 text-amber-300',
  PATCH: 'bg-violet-500/15 text-violet-300',
  DELETE: 'bg-rose-500/15 text-rose-400',
  HEAD: 'bg-cyan-500/15 text-cyan-300',
  OPTIONS: 'bg-zinc-500/15 text-zinc-300',
}

export const statusDot: Record<NodeStatus, string> = {
  idle: 'bg-zinc-500',
  running: 'bg-amber-400 animate-pulse',
  success: 'bg-emerald-400',
  failed: 'bg-rose-400',
  skipped: 'bg-zinc-600',
  stale: 'bg-orange-400',
}

export const statusLabel: Record<NodeStatus, string> = {
  idle: 'idle',
  running: 'running',
  success: 'success',
  failed: 'failed',
  skipped: 'skipped',
  stale: 'stale',
}

export function httpStatusClass(status: number): string {
  if (status >= 200 && status < 300) return 'text-emerald-400'
  if (status >= 400) return 'text-rose-400'
  return 'text-zinc-300'
}
