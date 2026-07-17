// Library flows (plan 08 B3): converting board nodes into reusable
// RequestDefs, the binding-blind divergence check, and the save/update
// orchestration behind "Save to collection…" / "Update collection request".
// AppState delegates here (type-only import, same pattern as sim.ts).
import { addRequest, findRequest, libraryId, updateRequest } from './collections'
import { isHttpNode } from './model'
import type { CollectionDef, OperationNodeData, RequestDef } from './model'
import { joinUrl, splitUrl } from './request'
import type { AppState } from './state.svelte'

/** The URL a RequestDef would need to reproduce this node's target. */
export function nodeRequestUrl(data: OperationNodeData): string {
  return data.origin ? joinUrl(data.origin, data.path) : data.path
}

/**
 * Normalizes a request URL the way instantiation round-trips it (splitUrl →
 * origin + path → joinUrl), so 'https://x.io/' and its origin-split node
 * compare equal.
 */
export function canonicalRequestUrl(url: string): string {
  const split = splitUrl(url)
  return split ? joinUrl(split.origin, split.path) : url
}

/**
 * Strips a node's data down to a library RequestDef (plan 08 B3): literal
 * fields become defaults, binding/template rows become empty defaults (board
 * wiring never enters the library), and board-only bits — key, exports,
 * status, environment, credential — are dropped. Identity fields
 * (id, name, description, requestSchema) come from `base` so updates keep them.
 */
export function requestDefFromNode(
  data: OperationNodeData,
  base: Pick<RequestDef, 'id' | 'name' | 'description' | 'requestSchema'>,
): RequestDef {
  const defaults = data.fields.map((f) => ({
    key: f.key,
    source: 'literal' as const,
    value: f.source === 'literal' ? f.value : '',
  }))
  return {
    ...base,
    protocol: 'http',
    method: data.method,
    url: nodeRequestUrl(data),
    ...(defaults.length > 0 ? { defaults } : {}),
    ...(data.responseSchema ? { responseSchema: structuredClone(data.responseSchema) } : {}),
  }
}

/**
 * Binding-blind divergence (plan 08 B3): a node differs from its library
 * request only when its method, effective URL, field key set, or the literal
 * values of fields whose stored row is literal changed. Binding/template
 * rows still count toward the key set (the field exists) but their values
 * are board wiring and never compare.
 */
export function requestDiffers(data: OperationNodeData, request: RequestDef): boolean {
  if (data.method !== (request.method ?? 'GET')) return true
  if (nodeRequestUrl(data) !== canonicalRequestUrl(request.url)) return true
  const defaults = request.defaults ?? []
  const nodeKeys = data.fields.map((f) => f.key).sort()
  const libraryKeys = defaults.map((d) => d.key).sort()
  if (nodeKeys.join('\n') !== libraryKeys.join('\n')) return true
  const libraryByKey = new Map(defaults.map((d) => [d.key, d]))
  return data.fields.some((f) => {
    if (f.source !== 'literal') return false
    const stored = libraryByKey.get(f.key)
    return stored !== undefined && stored.source === 'literal' && stored.value !== f.value
  })
}

/**
 * 'none' — no requestRef, or it dangles (collection/request deleted; the
 * node keeps working, plan 08 B3). Drives the "update collection request"
 * affordances: hidden on none, disabled on clean, live on diverged.
 */
export type LibraryLinkState = 'none' | 'clean' | 'diverged'

export function libraryLinkState(
  collections: readonly CollectionDef[],
  data: OperationNodeData,
): LibraryLinkState {
  const ref = data.requestRef
  if (!ref) return 'none'
  const collection = collections.find((c) => c.id === ref.collectionId)
  const request = collection ? findRequest(collection.root, ref.requestId) : null
  if (!request) return 'none'
  return requestDiffers(data, request) ? 'diverged' : 'clean'
}

/**
 * "Save to collection…": writes the node's shape into the folder as a new
 * RequestDef and links the node back via requestRef. Returns the new request
 * id, or null when the node/collection/folder is missing.
 */
export function saveNodeToCollection(
  app: AppState,
  nodeId: string,
  collectionId: string,
  folderId: string,
  name: string,
): string | null {
  const node = app.nodes.find((n) => n.id === nodeId)
  if (!node || !isHttpNode(node)) return null
  const request = requestDefFromNode(node.data, { id: libraryId('req'), name })
  const ok = app.mutateCollection(collectionId, (c) => {
    const root = addRequest(c.root, folderId, request)
    return root ? { ...c, root } : null
  })
  if (!ok) return null
  app.updateNodeData(nodeId, { requestRef: { collectionId, requestId: request.id } })
  return request.id
}

/**
 * "Update collection request": explicitly pushes the node's current shape
 * back onto its library request (one-way-by-default, plan 08 B3), keeping
 * the request's identity — id, name, description, requestSchema.
 */
export function updateCollectionRequestFromNode(app: AppState, nodeId: string): boolean {
  const node = app.nodes.find((n) => n.id === nodeId)
  if (!node || !isHttpNode(node) || !node.data.requestRef) return false
  const ref = node.data.requestRef
  return app.mutateCollection(ref.collectionId, (c) => {
    const existing = findRequest(c.root, ref.requestId)
    if (!existing) return null
    const root = updateRequest(c.root, ref.requestId, (r) =>
      requestDefFromNode(node.data, {
        id: r.id,
        name: r.name,
        description: r.description,
        requestSchema: r.requestSchema,
      }),
    )
    return root ? { ...c, root } : null
  })
}

/**
 * Dialog save: replaces the request in place when it already exists anywhere
 * in the collection, otherwise adds it to the given folder.
 */
export function upsertCollectionRequest(
  app: AppState,
  collectionId: string,
  folderId: string,
  request: RequestDef,
): boolean {
  return app.mutateCollection(collectionId, (c) => {
    const root = findRequest(c.root, request.id)
      ? updateRequest(c.root, request.id, () => request)
      : addRequest(c.root, folderId, request)
    return root ? { ...c, root } : null
  })
}
