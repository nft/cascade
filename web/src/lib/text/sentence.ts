// A period ends a sentence when a space and a capital follow it, outside
// code spans: `createUser.body.id` has periods but no sentence breaks.
const CODE_SPAN_RE = /`[^`]*`/g
const SENTENCE_END_RE = /\.\s+(?=[A-Z])/

/** The first sentence of a paragraph, period included. */
export function firstSentence(text: string): string {
  const masked = text.replace(CODE_SPAN_RE, (span) => 'x'.repeat(span.length))
  const end = masked.search(SENTENCE_END_RE)
  return end < 0 ? text : text.slice(0, end + 1)
}
