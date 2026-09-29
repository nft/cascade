import { describe, expect, it } from 'vitest'
import changelogMarkdown from '$repo/CHANGELOG.md?raw'
import { hasContent, parseChangelog, releaseAnchor } from './parse'

const SAMPLE = `# Changelog

Intro text that belongs to no release.

## [Unreleased]

## [1.2.0] - 2026-10-01

A summary line
that wraps.

Second paragraph.

### Added

- First item with \`code\`.
- Second item that wraps
  onto a continuation line.

### Fixed

* Starred bullet.

## 1.1.0 - 2026-09-01

### Changed

- Bare heading without brackets.

[Unreleased]: https://example.com/compare/v1.2.0...HEAD
[1.2.0]: https://example.com/releases/tag/v1.2.0
`

describe('parseChangelog', () => {
  const releases = parseChangelog(SAMPLE)

  it('reads every release heading in file order', () => {
    expect(releases.map((r) => r.version)).toEqual(['Unreleased', '1.2.0', '1.1.0'])
  })

  it('marks the unreleased section and leaves it without a date', () => {
    expect(releases[0]).toMatchObject({ unreleased: true, date: null })
    expect(hasContent(releases[0])).toBe(false)
  })

  it('joins wrapped summary lines and keeps paragraphs apart', () => {
    expect(releases[1].summary).toEqual(['A summary line that wraps.', 'Second paragraph.'])
  })

  it('collects sections, bullets and continuation lines', () => {
    expect(releases[1].sections).toEqual([
      { title: 'Added', items: ['First item with `code`.', 'Second item that wraps onto a continuation line.'] },
      { title: 'Fixed', items: ['Starred bullet.'] },
    ])
  })

  it('accepts headings without brackets and attaches link definitions', () => {
    expect(releases[2]).toMatchObject({ version: '1.1.0', date: '2026-09-01', url: null })
    expect(releases[1].url).toBe('https://example.com/releases/tag/v1.2.0')
  })

  it('ignores text before the first release', () => {
    expect(releases.flatMap((r) => r.summary)).not.toContain('Intro text that belongs to no release.')
  })
})

describe('the repository CHANGELOG.md', () => {
  const releases = parseChangelog(changelogMarkdown)

  it('starts with an Unreleased section, as the release workflow expects', () => {
    expect(releases[0]?.unreleased).toBe(true)
  })

  it('dates and links every shipped release', () => {
    for (const release of releases.filter((r) => !r.unreleased)) {
      expect(release.date, release.version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(release.url, release.version).toMatch(/^https:\/\//)
      expect(hasContent(release), release.version).toBe(true)
    }
  })

  it('keeps em and en dashes out of text the site renders', () => {
    const text = releases.flatMap((r) => [...r.summary, ...r.sections.flatMap((s) => [s.title, ...s.items])])
    for (const line of text) expect(line).not.toMatch(/[–—]/)
  })
})

describe('releaseAnchor', () => {
  it('prefixes versions and names the working section', () => {
    expect(releaseAnchor({ version: '0.1.0', unreleased: false })).toBe('v0.1.0')
    expect(releaseAnchor({ version: 'Unreleased', unreleased: true })).toBe('unreleased')
  })
})
