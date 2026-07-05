// App-wide keyboard handling (plan 03): Escape priority chain and canvas tool keys.
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
  if (event.key === 'x' || event.key === 'X') {
    app.canvasTool = app.canvasTool === 'scissors' ? 'select' : 'scissors'
  } else if (event.key === 'v' || event.key === 'V') {
    app.canvasTool = 'select'
  }
}
