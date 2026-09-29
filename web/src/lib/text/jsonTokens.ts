// Splits a line of JSON(-ish) display text into tokens for colouring. Not a
// parser: it only needs to tell keys from values in hand-written excerpts.

export type JsonTokenKind = 'key' | 'string' | 'number' | 'elided' | 'plain'

export interface JsonToken {
  text: string
  kind: JsonTokenKind
}

// A quoted string followed by a colon is a key; `…` marks elided content.
const TOKEN_RE = /("[^"]*"(?=\s*:))|("[^"]*")|(-?\d+(?:\.\d+)?)|(…)/g

export function jsonTokens(line: string): JsonToken[] {
  const tokens: JsonToken[] = []
  let last = 0
  for (const match of line.matchAll(TOKEN_RE)) {
    if (match.index > last) tokens.push({ text: line.slice(last, match.index), kind: 'plain' })
    const kind: JsonTokenKind = match[1] ? 'key' : match[2] ? 'string' : match[3] ? 'number' : 'elided'
    tokens.push({ text: match[0], kind })
    last = match.index + match[0].length
  }
  if (last < line.length) tokens.push({ text: line.slice(last), kind: 'plain' })
  return tokens
}
