import { describe, expect, it } from 'vitest'
import { formatClock, formatDuration } from './format'

// vite.config.ts pins TZ to Asia/Tokyo (UTC+9, no DST) so these are fixed.
describe('formatClock', () => {
  it('converts the UTC capture time into the viewer clock', () => {
    expect(formatClock('2026-07-06T14:02:00.000Z')).toBe('23:02')
  })

  it('rolls into the next day rather than slicing the string', () => {
    expect(formatClock('2026-07-06T23:30:00.000Z')).toBe('08:30')
  })

  it('renders an unparseable timestamp as nothing', () => {
    expect(formatClock('not a date')).toBe('')
  })
})

describe('formatDuration', () => {
  it('formats sub-second durations as milliseconds', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('formats seconds with two decimals', () => {
    expect(formatDuration(1000)).toBe('1.00s')
    expect(formatDuration(12345)).toBe('12.35s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(60_000)).toBe('1m 0s')
    expect(formatDuration(90_500)).toBe('1m 31s')
  })

  it('renders invalid input as a placeholder', () => {
    expect(formatDuration(-1)).toBe('–')
    expect(formatDuration(Number.NaN)).toBe('–')
  })
})
