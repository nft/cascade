// A deliberately small inline-markdown renderer for trusted site content and
// CHANGELOG.md entries: `code`, **bold** and [label](https://…) links. Input
// is escaped first, so anything else stays literal text.

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const CODE_RE = /`([^`]+)`/g
const BOLD_RE = /\*\*([^*]+)\*\*/g
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
// Code spans are parked behind NUL-delimited indexes while bold and links are
// rendered, so markdown-looking text inside backticks stays verbatim.
const PARKED_RE = /\u0000(\d+)\u0000/g

export const INLINE_CLASS = {
  code: 'rounded-md border border-white/8 bg-white/4 box-decoration-clone px-1.5 py-px font-mono text-[0.86em] text-coral-200',
  strong: 'font-semibold text-fg',
  link: 'text-coral-300 underline decoration-coral-300/35 underline-offset-3 transition-colors hover:decoration-coral-300',
} as const

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])
}

export function inlineHtml(text: string): string {
  const parked: string[] = []
  const html = escapeHtml(text)
    .replace(CODE_RE, (_, code: string) => `\u0000${parked.push(code) - 1}\u0000`)
    .replace(BOLD_RE, `<strong class="${INLINE_CLASS.strong}">$1</strong>`)
    .replace(
      LINK_RE,
      (_, label: string, url: string) =>
        `<a class="${INLINE_CLASS.link}" href="${url}" rel="noopener" target="_blank">${label}</a>`,
    )
  return html.replace(PARKED_RE, (_, index: string) => `<code class="${INLINE_CLASS.code}">${parked[Number(index)]}</code>`)
}
