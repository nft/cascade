/**
 * HH:MM of an ISO-8601 capture timestamp in the viewer's own clock.
 *
 * The timestamp is UTC (`runlog.go` captureTimeLayout), so slicing the string
 * would print a UTC hour beside the run log's local one — the same event
 * apparently happening at two times in one panel.
 */
export function formatClock(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Label for the armed second click of a delete confirm, naming how many nodes
 * reference the thing being deleted. Shared so the credential and environment
 * panels warn in the same words.
 */
export function deleteConfirmLabel(refs: number): string {
  if (refs === 0) return 'Really delete?'
  return `Really? ${refs === 1 ? '1 node uses' : `${refs} nodes use`} it`
}

/** Formats a millisecond duration for display in the logs section. */
export function formatDuration(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return '–'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

const BYTES_PER_UNIT = 1024
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const
/** Sizes below this many units stay fractional ("1.5 MB"); above it they round ("12 MB"). */
const FRACTION_BELOW = 10

/** "41.3 MB" for a download size; exact bytes below a kilobyte. */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= BYTES_PER_UNIT && unit < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT
    unit++
  }
  const digits = unit > 0 && value < FRACTION_BELOW ? 1 : 0
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`
}
