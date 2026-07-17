// Fresh-node payloads for canvas insertion, kept out of the store so
// AppState only orchestrates (id allocation, selection, persistence).
import type { AppNode, Operation, ProjectDefaults, RequestDef } from './model'
import { splitUrl } from './request'
import { slugifyKey, takenKeys, uniqueKey } from './refs'
import { DEFAULT_TRANSFORM_SCRIPT } from './transform'

export function makeHttpNode(
  op: Operation,
  id: string,
  existing: readonly AppNode[],
  defaults: ProjectDefaults | undefined,
  position: { x: number; y: number },
): AppNode {
  return {
    id,
    type: 'http',
    position,
    data: {
      name: op.summary,
      key: uniqueKey(slugifyKey(op.summary), takenKeys(existing)),
      method: op.method,
      path: op.path,
      environment: defaults?.environment ?? '',
      credential: defaults?.credential ?? '',
      status: 'idle',
      fields: [],
    },
  }
}

/**
 * An ad-hoc request node (plan 08 A3): no spec, no collection — the user
 * configures method/path/origin/fields by hand. Credential deliberately
 * starts as none: a node pointed at an arbitrary origin must opt into
 * secrets, never inherit the project default.
 */
export function makeCustomHttpNode(
  id: string,
  existing: readonly AppNode[],
  defaults: ProjectDefaults | undefined,
  position: { x: number; y: number },
): AppNode {
  return {
    id,
    type: 'http',
    position,
    data: {
      name: 'Custom request',
      key: uniqueKey('request', takenKeys(existing)),
      method: 'GET',
      path: '',
      environment: defaults?.environment ?? '',
      credential: '',
      status: 'idle',
      fields: [],
    },
  }
}

/**
 * Instantiates a collection request onto the canvas (plan 08 B3): copies the
 * request's shape, materializes its literal defaults into fields, and links
 * back via requestRef (provenance only — the node stays independent). An
 * absolute URL becomes an origin override; such a node also starts with
 * credential none, same opt-into-secrets rule as makeCustomHttpNode.
 */
export function makeHttpNodeFromRequest(
  collectionId: string,
  request: RequestDef,
  id: string,
  existing: readonly AppNode[],
  defaults: ProjectDefaults | undefined,
  position: { x: number; y: number },
): AppNode {
  const split = splitUrl(request.url)
  return {
    id,
    type: 'http',
    position,
    data: {
      name: request.name,
      key: uniqueKey(slugifyKey(request.name), takenKeys(existing)),
      method: request.method ?? 'GET',
      path: split ? split.path : request.url,
      ...(split ? { origin: split.origin } : {}),
      environment: defaults?.environment ?? '',
      credential: split ? '' : (defaults?.credential ?? ''),
      status: 'idle',
      fields: structuredClone(request.defaults ?? []),
      ...(request.responseSchema ? { responseSchema: structuredClone(request.responseSchema) } : {}),
      requestRef: { collectionId, requestId: request.id },
    },
  }
}

/** A transform node (plan 06): Pick mode by default, no target/env — it only reshapes. */
export function makeTransformNode(
  id: string,
  existing: readonly AppNode[],
  position: { x: number; y: number },
): AppNode {
  return {
    id,
    type: 'transform',
    position,
    data: {
      name: 'Transform',
      key: uniqueKey('transform', takenKeys(existing)),
      status: 'idle',
      mode: 'pick',
      pick: [],
      script: DEFAULT_TRANSFORM_SCRIPT,
    },
  }
}

/** A note sticky (plan 06 T6) — an annotation, never part of runs. */
export function makeNoteNode(id: string, position: { x: number; y: number }): AppNode {
  return { id, type: 'note', position, data: { text: '' } }
}

/**
 * A copy of an existing node, offset and reset: run products cleared, and a
 * fresh board-unique key — refs elsewhere keep pointing at the original
 * (they store its node ID).
 */
export function duplicateAppNode(src: AppNode, id: string, existing: readonly AppNode[]): AppNode {
  const data = structuredClone(src.data)
  if ('status' in data) {
    data.status = 'idle'
    data.note = undefined
  }
  if ('key' in data) data.key = uniqueKey(data.key, takenKeys(existing))
  return {
    ...src,
    id,
    position: { x: src.position.x + 40, y: src.position.y + 40 },
    selected: false,
    data,
  } as AppNode
}
