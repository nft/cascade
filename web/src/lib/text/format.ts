const BYTES_PER_UNIT = 1024
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const
const SIZE_DECIMALS = 1

/** `48123456` → `45.9 MB`. */
export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= BYTES_PER_UNIT && unit < SIZE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT
    unit++
  }
  return unit === 0 ? `${value} ${SIZE_UNITS[unit]}` : `${value.toFixed(SIZE_DECIMALS)} ${SIZE_UNITS[unit]}`
}

// UTC so a date renders the same in the prerendered HTML and after hydration,
// whatever the visitor's time zone.
const LONG_DATE = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' })

/** `2026-09-29` or a full ISO timestamp → `September 29, 2026`. */
export function formatDate(iso: string): string {
  return LONG_DATE.format(new Date(iso))
}

/** The `yyyy-mm-dd` part of an ISO timestamp, for `<time datetime>`. */
export function isoDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

const CLOCK_WIDTH = 2
const MILLIS_WIDTH = 3

/** Local time to the millisecond, the way the app's logs stamp rows: `12:40:39.094`. */
export function formatClock(epochMs: number): string {
  const time = new Date(epochMs)
  const pad = (value: number, width = CLOCK_WIDTH) => String(value).padStart(width, '0')
  return `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}.${pad(time.getMilliseconds(), MILLIS_WIDTH)}`
}
