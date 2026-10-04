// Release notes arrive as the CHANGELOG section the release workflow copied
// into the GitHub release: Keep-a-Changelog markdown. This renders the subset
// that format uses into blocks the dialog can lay out, with nothing turned
// into HTML, so a note can never inject markup.

export type NoteSegment = { kind: 'text'; text: string } | { kind: 'code'; text: string }

export type NoteBlock =
  | { kind: 'heading'; level: number; segments: NoteSegment[] }
  | { kind: 'bullet'; segments: NoteSegment[] }
  | { kind: 'paragraph'; segments: NoteSegment[] }

const HEADING = /^(#{1,6})\s+(.*)$/
const BULLET = /^[-*+]\s+(.*)$/
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/
const INLINE_CODE = /`([^`]+)`/g
/** [label](url) → label; the dialog shows no links, the releases page does. */
const LINK = /\[([^\]]+)\]\([^)]*\)/g
/** Keep-a-Changelog version headings are "[0.2.0] - 2026-10-10"; the brackets mean nothing here. */
const BRACKETED = /\[([^\]]+)\]/g
const EMPHASIS = /(\*\*|__|\*|_)(?=\S)(.+?)(?<=\S)\1/g

/** The release workflow appends this trailer; the dialog has its own links. */
const TRAILER_PREFIX = 'Install notes and checksums:'

export function parseReleaseNotes(markdown: string): NoteBlock[] {
  const blocks: NoteBlock[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', segments: inline(paragraph.join(' ')) })
    paragraph = []
  }
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || RULE.test(line)) {
      flush()
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', level: heading[1].length, segments: inline(heading[2]) })
      continue
    }
    const bullet = BULLET.exec(line)
    if (bullet) {
      flush()
      blocks.push({ kind: 'bullet', segments: inline(bullet[1]) })
      continue
    }
    const last = blocks.at(-1)
    // An indented continuation belongs to the bullet above it.
    if (raw.startsWith(' ') && last?.kind === 'bullet' && paragraph.length === 0) {
      last.segments = inline(plain(last.segments) + ' ' + line)
      continue
    }
    paragraph.push(line)
  }
  flush()
  return blocks.filter((b) => !(b.kind === 'paragraph' && plain(b.segments).startsWith(TRAILER_PREFIX)))
}

/** Splits inline code out of a line and strips link, bracket and emphasis syntax from the rest. */
export function inline(text: string): NoteSegment[] {
  const segments: NoteSegment[] = []
  let last = 0
  for (const match of text.matchAll(INLINE_CODE)) {
    if (match.index > last) segments.push({ kind: 'text', text: stripSyntax(text.slice(last, match.index)) })
    segments.push({ kind: 'code', text: match[1] })
    last = match.index + match[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', text: stripSyntax(text.slice(last)) })
  return segments
}

function stripSyntax(text: string): string {
  return text.replace(LINK, '$1').replace(BRACKETED, '$1').replace(EMPHASIS, '$2')
}

function plain(segments: NoteSegment[]): string {
  return segments.map((s) => s.text).join('')
}
