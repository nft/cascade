import { describe, expect, it } from 'vitest'
import { formatBytes, formatClock, formatDate, isoDay } from './format'
import { INLINE_CLASS, escapeHtml, inlineHtml } from './inline'

describe('inlineHtml', () => {
  it('escapes markup before formatting', () => {
    expect(inlineHtml('<b> & "q"')).toBe('&lt;b&gt; &amp; &quot;q&quot;')
  })

  it('renders code, bold and https links', () => {
    expect(inlineHtml('`a` **b** [c](https://x.dev)')).toBe(
      `<code class="${INLINE_CLASS.code}">a</code> <strong class="${INLINE_CLASS.strong}">b</strong> ` +
        `<a class="${INLINE_CLASS.link}" href="https://x.dev" rel="noopener" target="_blank">c</a>`,
    )
  })

  it('keeps markdown inside code spans literal', () => {
    expect(inlineHtml('`**not bold**`')).toBe(`<code class="${INLINE_CLASS.code}">**not bold**</code>`)
  })

  it('leaves non-http links as text', () => {
    expect(inlineHtml('[x](javascript:alert(1))')).toBe('[x](javascript:alert(1))')
  })

  it('escapes every special character', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [2048, '2.0 KB'],
    [48_123_456, '45.9 MB'],
  ])('%d bytes → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})

describe('dates', () => {
  it('formats in UTC so SSR and the browser agree', () => {
    expect(formatDate('2026-09-29')).toBe('September 29, 2026')
    expect(formatDate('2026-09-29T23:30:00Z')).toBe('September 29, 2026')
  })

  it('reduces timestamps to a day', () => {
    expect(isoDay('2026-09-29T23:30:00Z')).toBe('2026-09-29')
  })
})

describe('formatClock', () => {
  it('pads each part like the app log stamps', () => {
    expect(formatClock(new Date(2026, 8, 29, 3, 4, 5, 6).getTime())).toBe('03:04:05.006')
    expect(formatClock(new Date(2026, 8, 29, 12, 40, 39, 94).getTime())).toBe('12:40:39.094')
  })
})
