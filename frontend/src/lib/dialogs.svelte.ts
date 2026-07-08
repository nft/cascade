// Global modal open-state — the app-wide UI-chrome store (CLAUDE.md), scoped
// to dialogs so far. Components set these; the dialog components themselves
// mount once at the app root and render while their state is non-null.

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

class DialogsState {
  requestEditor = $state<RequestEditorContext | null>(null)
  saveToCollection = $state<SaveToCollectionContext | null>(null)
}

export const dialogs = new DialogsState()
