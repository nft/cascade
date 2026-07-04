import { describe, expect, it } from 'vitest'
import { formatDuration } from './format'

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
