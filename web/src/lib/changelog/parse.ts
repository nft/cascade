// Reads CHANGELOG.md (Keep a Changelog layout) into structured releases.
// Pure, so the build-time loader and the tests share it.

export interface ChangelogSection {
  title: string
  /** Inline-markdown bullet text; wrapped continuation lines are joined. */
  items: string[]
}

export interface ChangelogRelease {
  /** `0.1.0`, or `Unreleased` for the working section. */
  version: string
  /** ISO `yyyy-mm-dd`, absent for unreleased work. */
  date: string | null
  unreleased: boolean
  /** Paragraphs between the heading and the first `###` section. */
  summary: string[]
  sections: ChangelogSection[]
  /** From the link reference definitions at the bottom of the file. */
  url: string | null
}

const UNRELEASED = 'unreleased'
const RELEASE_HEADING_RE = /^##\s+\[?([^\]\s]+)\]?(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/
const SECTION_HEADING_RE = /^###\s+(.+?)\s*$/
const BULLET_RE = /^[-*]\s+(.*)$/
const CONTINUATION_RE = /^\s{2,}(\S.*)$/
const LINK_DEFINITION_RE = /^\[([^\]]+)\]:\s*(\S+)\s*$/

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = []
  const links = new Map<string, string>()
  let release: ChangelogRelease | null = null
  let section: ChangelogSection | null = null
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (release && !section && paragraph.length > 0) release.summary.push(paragraph.join(' '))
    paragraph = []
  }

  for (const line of markdown.split(/\r?\n/)) {
    const definition = LINK_DEFINITION_RE.exec(line)
    if (definition) {
      links.set(definition[1].toLowerCase(), definition[2])
      continue
    }

    const heading = RELEASE_HEADING_RE.exec(line)
    if (heading) {
      flushParagraph()
      const version = heading[1]
      release = {
        version,
        date: heading[2] ?? null,
        unreleased: version.toLowerCase() === UNRELEASED,
        summary: [],
        sections: [],
        url: null,
      }
      section = null
      releases.push(release)
      continue
    }
    if (!release) continue

    const sectionHeading = SECTION_HEADING_RE.exec(line)
    if (sectionHeading) {
      flushParagraph()
      section = { title: sectionHeading[1], items: [] }
      release.sections.push(section)
      continue
    }

    const bullet = BULLET_RE.exec(line)
    if (bullet && section) {
      section.items.push(bullet[1].trim())
      continue
    }

    const continuation = CONTINUATION_RE.exec(line)
    if (continuation && section && section.items.length > 0) {
      section.items[section.items.length - 1] += ` ${continuation[1].trim()}`
      continue
    }

    if (line.trim() === '') flushParagraph()
    else if (!section) paragraph.push(line.trim())
  }
  flushParagraph()

  for (const entry of releases) entry.url = links.get(entry.version.toLowerCase()) ?? null
  return releases
}

/** Whether a release has anything to show; an empty Unreleased heading does not. */
export function hasContent(release: ChangelogRelease): boolean {
  return release.summary.length > 0 || release.sections.some((section) => section.items.length > 0)
}

/** Fragment id of a release on the changelog page: `v0.1.0`, or `unreleased`. */
export function releaseAnchor(release: Pick<ChangelogRelease, 'version' | 'unreleased'>): string {
  return release.unreleased ? UNRELEASED : `v${release.version}`
}
