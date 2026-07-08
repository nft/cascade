// Collection tree helpers (plan 08 B1/B2): pure, immutable operations on the
// folder tree inside a CollectionDef, kept out of components like graph.ts.
// All mutations return a new root (or null when the target does not exist or
// an invariant would break) — callers persist the result.
import type { BoardNodeJSON, CollectionDef, CollectionFolder, RequestDef } from './model'
import { isRequestRef } from './board'

/** Folder nesting cap (plan 08 B1): root is depth 0, at most 3 named levels below. */
export const MAX_FOLDER_DEPTH = 3

/** The unnamed root folder's fixed id. */
export const ROOT_FOLDER_ID = 'root'

let idCounter = 0

/**
 * Random short id for library objects created in the frontend. Random so ids
 * are visibly not name-derived (renames must not break references); the
 * counter keeps them unique even if Math.random collides. Matches the store's
 * file-id alphabet.
 */
export function libraryId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${idCounter}`
}

export function makeCollection(name: string): CollectionDef {
  return { id: libraryId('col'), name, root: { id: ROOT_FOLDER_ID, name: '', requests: [] } }
}

export function makeFolder(name: string): CollectionFolder {
  return { id: libraryId('fold'), name, requests: [] }
}

/** The folder with the given id (the root included), or null. */
export function folderById(root: CollectionFolder, folderId: string): CollectionFolder | null {
  if (root.id === folderId) return root
  for (const sub of root.folders ?? []) {
    const found = folderById(sub, folderId)
    if (found) return found
  }
  return null
}

/** Depth of a folder below the root (root itself is 0), or null when absent. */
export function folderDepth(root: CollectionFolder, folderId: string, depth = 0): number | null {
  if (root.id === folderId) return depth
  for (const sub of root.folders ?? []) {
    const found = folderDepth(sub, folderId, depth + 1)
    if (found !== null) return found
  }
  return null
}

/**
 * Applies fn to the folder with the given id, rebuilding the path to the
 * root. Returns the new root, or null when the folder does not exist.
 */
export function updateFolder(
  root: CollectionFolder,
  folderId: string,
  fn: (folder: CollectionFolder) => CollectionFolder,
): CollectionFolder | null {
  if (root.id === folderId) return fn(root)
  const folders = root.folders ?? []
  for (let i = 0; i < folders.length; i++) {
    const updated = updateFolder(folders[i], folderId, fn)
    if (updated) return { ...root, folders: folders.map((f, j) => (j === i ? updated : f)) }
  }
  return null
}

/** Adds a folder under the parent; null when the parent is missing or the depth cap would break. */
export function addFolder(
  root: CollectionFolder,
  parentFolderId: string,
  folder: CollectionFolder,
): CollectionFolder | null {
  const parentDepth = folderDepth(root, parentFolderId)
  if (parentDepth === null || parentDepth + 1 > MAX_FOLDER_DEPTH) return null
  return updateFolder(root, parentFolderId, (parent) => ({
    ...parent,
    folders: [...(parent.folders ?? []), folder],
  }))
}

/** Removes a folder (and everything inside it); null when it does not exist. */
export function removeFolder(root: CollectionFolder, folderId: string): CollectionFolder | null {
  const folders = root.folders ?? []
  if (folders.some((f) => f.id === folderId)) {
    return { ...root, folders: folders.filter((f) => f.id !== folderId) }
  }
  for (let i = 0; i < folders.length; i++) {
    const updated = removeFolder(folders[i], folderId)
    if (updated) return { ...root, folders: folders.map((f, j) => (j === i ? updated : f)) }
  }
  return null
}

export function addRequest(
  root: CollectionFolder,
  folderId: string,
  request: RequestDef,
): CollectionFolder | null {
  return updateFolder(root, folderId, (folder) => ({
    ...folder,
    requests: [...folder.requests, request],
  }))
}

/** Applies fn to the request with the given id wherever it lives; null when absent. */
export function updateRequest(
  root: CollectionFolder,
  requestId: string,
  fn: (request: RequestDef) => RequestDef,
): CollectionFolder | null {
  if (root.requests.some((r) => r.id === requestId)) {
    return { ...root, requests: root.requests.map((r) => (r.id === requestId ? fn(r) : r)) }
  }
  const folders = root.folders ?? []
  for (let i = 0; i < folders.length; i++) {
    const updated = updateRequest(folders[i], requestId, fn)
    if (updated) return { ...root, folders: folders.map((f, j) => (j === i ? updated : f)) }
  }
  return null
}

export function removeRequest(root: CollectionFolder, requestId: string): CollectionFolder | null {
  if (root.requests.some((r) => r.id === requestId)) {
    return { ...root, requests: root.requests.filter((r) => r.id !== requestId) }
  }
  const folders = root.folders ?? []
  for (let i = 0; i < folders.length; i++) {
    const updated = removeRequest(folders[i], requestId)
    if (updated) return { ...root, folders: folders.map((f, j) => (j === i ? updated : f)) }
  }
  return null
}

export function findRequest(root: CollectionFolder, requestId: string): RequestDef | null {
  const direct = root.requests.find((r) => r.id === requestId)
  if (direct) return direct
  for (const sub of root.folders ?? []) {
    const found = findRequest(sub, requestId)
    if (found) return found
  }
  return null
}

/** All requests in the tree, depth-first, each with its folder-name trail. */
export function flattenRequests(
  root: CollectionFolder,
  trail: string[] = [],
): { request: RequestDef; trail: string[] }[] {
  const out = root.requests.map((request) => ({ request, trail }))
  for (const sub of root.folders ?? []) {
    out.push(...flattenRequests(sub, [...trail, sub.name]))
  }
  return out
}

/** Case-insensitive match over method (protocol for ws), url and name — same fields the operations search uses. */
export function requestMatches(request: RequestDef, query: string): boolean {
  return `${request.method ?? request.protocol} ${request.url} ${request.name}`
    .toLowerCase()
    .includes(query.toLowerCase())
}

/**
 * Nodes in the given boards whose requestRef points into the collection
 * (optionally one specific request) — drives the "boards reference it"
 * delete warning (plan 08 B2).
 */
export function requestRefCount(
  nodes: readonly Pick<BoardNodeJSON, 'data'>[],
  collectionId: string,
  requestId?: string,
): number {
  let count = 0
  for (const node of nodes) {
    const ref = node.data?.requestRef
    if (!isRequestRef(ref) || ref.collectionId !== collectionId) continue
    if (requestId === undefined || ref.requestId === requestId) count += 1
  }
  return count
}
