import { HTTP_METHODS, type HttpMethod, type NodeStatus } from './model'

// Split so method <select>s can take the text color alone — their background
// is owned by the Select surface, and stacking the tint on top of it made the
// rendered color ambiguous. Badges/chips use the composed methodBadge.
export const methodText: Record<HttpMethod, string> = {
  GET: 'text-sky-400',
  POST: 'text-emerald-400',
  PUT: 'text-amber-300',
  PATCH: 'text-violet-300',
  DELETE: 'text-rose-400',
  HEAD: 'text-cyan-300',
  OPTIONS: 'text-zinc-300',
}

export const methodTint: Record<HttpMethod, string> = {
  GET: 'bg-sky-500/15',
  POST: 'bg-emerald-500/15',
  PUT: 'bg-amber-500/15',
  PATCH: 'bg-violet-500/15',
  DELETE: 'bg-rose-500/15',
  HEAD: 'bg-cyan-500/15',
  OPTIONS: 'bg-zinc-500/15',
}

export const methodBadge: Record<HttpMethod, string> = Object.fromEntries(
  HTTP_METHODS.map((m) => [m, `${methodTint[m]} ${methodText[m]}`]),
) as Record<HttpMethod, string>

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

/** The status at which a call counts as failed — mirrors exec.HTTPFailureStatus. */
export const HTTP_FAILURE_STATUS = 400

const HTTP_SUCCESS_STATUS = 200
const HTTP_REDIRECT_STATUS = 300

export function httpStatusClass(status: number): string {
  if (status >= HTTP_SUCCESS_STATUS && status < HTTP_REDIRECT_STATUS) return 'text-emerald-400'
  if (status >= HTTP_FAILURE_STATUS) return 'text-rose-400'
  return 'text-zinc-300'
}
