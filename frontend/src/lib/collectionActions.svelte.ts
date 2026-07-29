// Collection tree CRUD (plan 08 B1/B2), kept out of state.svelte.ts the same
// way credentialActions.svelte.ts holds the credential flows. Every tree edit
// goes through AppState.mutateCollection, which owns the "a null result means
// leave the state untouched" contract and the save that follows a good one.
import { api } from './api'
import {
  addFolder,
  addRequest,
  findRequest,
  libraryId,
  makeCollection,
  makeFolder,
  removeFolder,
  removeRequest,
  updateFolder,
  updateRequest,
} from './collections'
import type { CollectionDef, RequestDef } from './model'
import type { AppState } from './state.svelte'

/** Fire-and-forget persistence for one collection. */
export async function persistCollection(app: AppState, collection: CollectionDef) {
  const projectId = app.projectId
  if (!projectId) return
  try {
    await api.saveCollection(projectId, $state.snapshot(collection) as CollectionDef)
  } catch (err) {
    // Same policy as board saves: a failed write must not take down the UI.
    console.error('collection save failed:', err)
  }
}

export function createCollection(app: AppState, name: string): CollectionDef | null {
  if (!app.project) return null
  const collection = makeCollection(name)
  app.project.collections = [...app.project.collections, collection]
  void persistCollection(app, collection)
  return collection
}

export async function deleteCollection(app: AppState, collectionId: string) {
  const projectId = app.projectId
  if (!app.project || !projectId) return
  app.project.collections = app.project.collections.filter((c) => c.id !== collectionId)
  try {
    await api.deleteCollection(projectId, collectionId)
  } catch (err) {
    console.error('collection delete failed:', err)
  }
}

/** Returns the new folder's id, or null when the parent is missing or the depth cap would break. */
export function addCollectionFolder(
  app: AppState,
  collectionId: string,
  parentFolderId: string,
  name: string,
): string | null {
  const folder = makeFolder(name)
  const ok = app.mutateCollection(collectionId, (c) => {
    const root = addFolder(c.root, parentFolderId, folder)
    return root ? { ...c, root } : null
  })
  return ok ? folder.id : null
}

export function renameCollectionFolder(app: AppState, collectionId: string, folderId: string, name: string) {
  app.mutateCollection(collectionId, (c) => {
    const root = updateFolder(c.root, folderId, (f) => ({ ...f, name }))
    return root ? { ...c, root } : null
  })
}

export function deleteCollectionFolder(app: AppState, collectionId: string, folderId: string) {
  app.mutateCollection(collectionId, (c) => {
    const root = removeFolder(c.root, folderId)
    return root ? { ...c, root } : null
  })
}

export function renameCollectionRequest(
  app: AppState,
  collectionId: string,
  requestId: string,
  name: string,
) {
  app.mutateCollection(collectionId, (c) => {
    const root = updateRequest(c.root, requestId, (r) => ({ ...r, name }))
    return root ? { ...c, root } : null
  })
}

export function duplicateCollectionRequest(
  app: AppState,
  collectionId: string,
  folderId: string,
  requestId: string,
) {
  app.mutateCollection(collectionId, (c) => {
    const source = findRequest(c.root, requestId)
    if (!source) return null
    const copy: RequestDef = {
      ...structuredClone($state.snapshot(source) as RequestDef),
      id: libraryId('req'),
      name: `${source.name} copy`,
    }
    const root = addRequest(c.root, folderId, copy)
    return root ? { ...c, root } : null
  })
}

export function deleteCollectionRequest(app: AppState, collectionId: string, requestId: string) {
  app.mutateCollection(collectionId, (c) => {
    const root = removeRequest(c.root, requestId)
    return root ? { ...c, root } : null
  })
}
