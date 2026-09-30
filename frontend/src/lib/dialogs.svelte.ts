// Global modal open-state — the app-wide UI-chrome store, scoped
// to dialogs so far. Components set these; the dialog components themselves
// mount once at the app root and render while their state is non-null.
import type { RequirementRow } from './importMapping'

/** What the request editor dialog is editing. */
export interface RequestEditorContext {
  collectionId: string
  /** Where a new request lands; an existing request keeps its folder. */
  folderId: string
  /** Editing an existing request when set; otherwise a fresh draft. */
  requestId?: string
}

/** "Save to collection…" for a canvas node. */
export interface SaveToCollectionContext {
  nodeId: string
}

/**
 * Credential dialog. `create` is a fresh draft; `edit` changes
 * metadata only (no secret field — values are write-only); `rotate` re-enters
 * just the value.
 */
export type CredentialDialogContext =
  | { mode: 'create' }
  | { mode: 'edit' | 'rotate'; name: string }

/**
 * Environment dialog. `create` is a fresh draft; `edit` reopens
 * an existing one, whose name is fixed — nodes reference environments by name
 * and nothing rewrites them.
 */
export type EnvironmentDialogContext = { mode: 'create' } | { mode: 'edit'; name: string }

/**
 * Requires-mapping wizard: the unmatched requires of a just
 * pasted/imported envelope, and the IDs of the nodes a map-to-existing
 * choice rewrites. Closing without applying leaves everything unmapped.
 */
export interface ImportMappingContext {
  rows: RequirementRow[]
  nodeIds: string[]
}

/** How long a toast stays up before auto-dismissing. */
const TOAST_MS = 4000

class DialogsState {
  requestEditor = $state<RequestEditorContext | null>(null)
  saveToCollection = $state<SaveToCollectionContext | null>(null)
  credential = $state<CredentialDialogContext | null>(null)
  environment = $state<EnvironmentDialogContext | null>(null)
  /** App-level notice modal — paste/import errors get a clean dialog. */
  notice = $state<{ title: string; message: string } | null>(null)
  importMapping = $state<ImportMappingContext | null>(null)
  /** Deleting a For container takes its children with it — confirmed first. */
  confirmDeleteFor = $state<{ nodeId: string; childCount: number } | null>(null)
  /** Transient bottom-center toast — refused edits, not errors that need reading. */
  toast = $state<string | null>(null)

  #toastTimer: ReturnType<typeof setTimeout> | undefined

  showToast(message: string) {
    this.toast = message
    clearTimeout(this.#toastTimer)
    this.#toastTimer = setTimeout(() => (this.toast = null), TOAST_MS)
  }
}

export const dialogs = new DialogsState()
