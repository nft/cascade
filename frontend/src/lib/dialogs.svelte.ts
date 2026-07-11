// Global modal open-state — the app-wide UI-chrome store (CLAUDE.md), scoped
// to dialogs so far. Components set these; the dialog components themselves
// mount once at the app root and render while their state is non-null.
import type { RequirementRow } from './importMapping'

/** What the request editor dialog is editing (plan 08 B3). */
export interface RequestEditorContext {
  collectionId: string
  /** Where a new request lands; an existing request keeps its folder. */
  folderId: string
  /** Editing an existing request when set; otherwise a fresh draft. */
  requestId?: string
}

/** "Save to collection…" for a canvas node (plan 08 B3). */
export interface SaveToCollectionContext {
  nodeId: string
}

/**
 * Credential dialog (plan 04 K2). `create` is a fresh draft; `edit` changes
 * metadata only (no secret field — values are write-only); `rotate` re-enters
 * just the value.
 */
export type CredentialDialogContext =
  | { mode: 'create' }
  | { mode: 'edit' | 'rotate'; name: string }

/**
 * Requires-mapping wizard (plan 07 E4): the unmatched requires of a just
 * pasted/imported envelope, and the IDs of the nodes a map-to-existing
 * choice rewrites. Closing without applying leaves everything unmapped.
 */
export interface ImportMappingContext {
  rows: RequirementRow[]
  nodeIds: string[]
}

class DialogsState {
  requestEditor = $state<RequestEditorContext | null>(null)
  saveToCollection = $state<SaveToCollectionContext | null>(null)
  credential = $state<CredentialDialogContext | null>(null)
  /** App-level notice modal — paste/import errors (plan 07 E3) get a clean dialog. */
  notice = $state<{ title: string; message: string } | null>(null)
  importMapping = $state<ImportMappingContext | null>(null)
}

export const dialogs = new DialogsState()
