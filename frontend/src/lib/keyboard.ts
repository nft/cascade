// App-wide keyboard handling: Escape priority chain, canvas tool
// keys, and clipboard copy/paste.
import { copyNodes, pasteFromClipboard, selectionForCopy } from './shareActions'
import { app } from './state.svelte'

const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (FIELD_TAGS.has(target.tagName) || target.isContentEditable)
}

export function handleGlobalKeydown(event: KeyboardEvent) {
  const typing = isTypingTarget(event.target)
  if (event.key === 'Escape') {
    app.escapePressed(typing)
    return
  }
  if (typing) return
  if (event.metaKey || event.ctrlKey) {
    // Native copy wins when the user has text selected somewhere on the page.
    if ((event.key === 'c' || event.key === 'C') && !window.getSelection()?.toString()) {
      const ids = selectionForCopy(app.nodes)
      if (ids.length > 0) void copyNodes(app, ids)
    }
    if (event.key === 'v' || event.key === 'V') {
      void pasteFromClipboard(app) // lands at the canvas center (app.pasteTarget)
    }
    return // never treat shortcut chords as canvas tool keys
  }
  if (event.key === 'x' || event.key === 'X') {
    app.canvasTool = app.canvasTool === 'scissors' ? 'select' : 'scissors'
  } else if (event.key === 'v' || event.key === 'V') {
    app.canvasTool = 'select'
  }
}
