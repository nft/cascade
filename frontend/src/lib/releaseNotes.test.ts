import { describe, expect, it } from 'vitest'
import { inline, parseReleaseNotes } from './releaseNotes'

const text = (s: string) => ({ kind: 'text', text: s })
const code = (s: string) => ({ kind: 'code', text: s })

describe('parseReleaseNotes', () => {
  it('renders the changelog section the release workflow publishes', () => {
    const notes = [
      '## [0.2.0] - 2026-10-10',
      '',
      'A short intro paragraph',
      'that wraps onto two lines.',
      '',
      '### Added',
      '',
      '- Auto-update from **Settings › About**, see [the docs](https://example.test).',
      '  Continues here.',
      '* Pan tool with `H`.',
      '',
      '---',
      '',
      'Install notes and checksums: https://nft.github.io/cascade/download',
    ].join('\n')

    expect(parseReleaseNotes(notes)).toEqual([
      { kind: 'heading', level: 2, segments: [text('0.2.0 - 2026-10-10')] },
      { kind: 'paragraph', segments: [text('A short intro paragraph that wraps onto two lines.')] },
      { kind: 'heading', level: 3, segments: [text('Added')] },
      { kind: 'bullet', segments: [text('Auto-update from Settings › About, see the docs. Continues here.')] },
      { kind: 'bullet', segments: [text('Pan tool with '), code('H'), text('.')] },
    ])
  })

  it('never produces markup, whatever the notes contain', () => {
    const blocks = parseReleaseNotes('- <img src=x onerror=alert(1)> and `<b>`')
    expect(blocks).toEqual([
      { kind: 'bullet', segments: [text('<img src=x onerror=alert(1)> and '), code('<b>')] },
    ])
  })

  it('handles empty notes and Windows line endings', () => {
    expect(parseReleaseNotes('')).toEqual([])
    expect(parseReleaseNotes('### Fixed\r\n\r\n- A thing.\r\n')).toEqual([
      { kind: 'heading', level: 3, segments: [text('Fixed')] },
      { kind: 'bullet', segments: [text('A thing.')] },
    ])
  })
})

describe('inline', () => {
  it('splits code spans and strips emphasis, links and brackets around them', () => {
    expect(inline('Use `{{res.id}}` or _italics_ and __bold__')).toEqual([
      text('Use '),
      code('{{res.id}}'),
      text(' or italics and bold'),
    ])
    expect(inline('plain')).toEqual([text('plain')])
    expect(inline('`only code`')).toEqual([code('only code')])
  })
})
