// Project-settings write flows (plan 11 W8), kept out of state.svelte.ts the
// same way the environment and credential flows are — and, like those, called
// directly by components rather than re-exported as AppState methods.
import { api } from './api'
import type { AppState } from './state.svelte'

const NO_PROJECT = 'no project open'

/**
 * Turn writing response bodies into board files on or off. Optimistic, so the
 * menu row reflects the choice immediately, and rolled back on a failed write
 * — a setting that silently did not persist is worse than one that refused.
 */
export async function setCaptureResponses(
  app: AppState,
  capture: boolean,
): Promise<string | null> {
  const bundle = app.project
  if (!bundle) return NO_PROJECT
  const previous = bundle.project.captureResponses
  bundle.project.captureResponses = capture
  try {
    await api.setCaptureResponses(bundle.project.id, capture)
    return null
  } catch (err) {
    bundle.project.captureResponses = previous
    return String(err)
  }
}
