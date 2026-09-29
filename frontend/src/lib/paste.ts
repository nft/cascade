// Paste pipeline (plan 07 E3): turns an envelope's board into fresh canvas
// nodes — new IDs, keys re-slugged on collision against the target board,
// bindings, template tokens and raw-body tokens rewritten to the new IDs
// (they store node IDs), positions recentered on the paste target with the
// original relative layout, and everything marked selected so the paste
// lands as a group.
import { deserializeBoard } from './board'
import type { AppEdge, AppNode, BoardJSON, NodeField } from './model'
import { mapTemplateOwners, refToStored, takenKeys, uniqueKey } from './refs'

export interface PastedGraph {
  nodes: AppNode[]
  edges: AppEdge[]
}

/** Node id prefix marking pasted nodes; the suffix makes ids board-unique. */
const PASTE_ID_PREFIX = 'paste'

export function pasteId(index: number): string {
  return `${PASTE_ID_PREFIX}-${Math.random().toString(36).slice(2, 8)}-${index}`
}

/**
 * Builds the nodes/edges a paste inserts. `makeId` is injected so tests are
 * deterministic; generated ids are still guarded against collisions with the
 * target board.
 */
export function buildPaste(
  board: BoardJSON,
  existing: readonly AppNode[],
  target: { x: number; y: number },
  makeId: (index: number) => string = pasteId,
): PastedGraph {
  const loaded = deserializeBoard(board)
  if (loaded.nodes.length === 0) return { nodes: [], edges: [] }

  const usedIds = new Set(existing.map((n) => n.id))
  const idMap = new Map<string, string>()
  loaded.nodes.forEach((n, index) => {
    let id = makeId(index)
    while (usedIds.has(id)) id = `${id}-2`
    usedIds.add(id)
    idMap.set(n.id, id)
  })

  const offset = centerOffset(loaded.nodes, target)
  const taken = takenKeys(existing)
  const nodes = loaded.nodes.map((n): AppNode => {
    const id = idMap.get(n.id)!
    // A child whose For container is part of the paste keeps its
    // container-relative position (the container absorbs the offset) and its
    // parent link, remapped; one pasted without its container unparents and
    // takes the offset like any top-level node.
    const parentId = n.parentId ? idMap.get(n.parentId) : undefined
    const position = parentId
      ? { ...n.position }
      : { x: n.position.x + offset.x, y: n.position.y + offset.y }
    if (n.type === 'note') return { ...n, id, position, selected: true }
    const key = uniqueKey(n.data.key, taken)
    taken.add(key)
    if (n.type === 'transform') {
      return {
        ...n,
        id,
        position,
        parentId,
        selected: true,
        data: { ...n.data, key, pick: n.data.pick.map((f) => remapField(f, idMap)) },
      }
    }
    if (n.type === 'http') {
      const { rawBody } = n.data
      return {
        ...n,
        id,
        position,
        parentId,
        selected: true,
        data: {
          ...n.data,
          key,
          fields: n.data.fields.map((f) => remapField(f, idMap)),
          ...(rawBody ? { rawBody: { ...rawBody, text: mapTemplateOwners(rawBody.text, idMap) } } : {}),
        },
      }
    }
    if (n.type === 'for') {
      // The each-mode source is a binding ref: remap it when its node is in
      // the paste, keep it as-is otherwise (same policy as remapField).
      const mapped = n.data.source && idMap.get(n.data.source.nodeId)
      return {
        ...n,
        id,
        position,
        selected: true,
        data: {
          ...n.data,
          key,
          ...(n.data.source && mapped ? { source: { ...n.data.source, nodeId: mapped } } : {}),
        },
      }
    }
    // mock and delay: nothing inside their data references other nodes.
    if (n.type === 'mock') {
      return { ...n, id, position, parentId, selected: true, data: { ...n.data, key } }
    }
    return { ...n, id, position, parentId, selected: true, data: { ...n.data, key } }
  })

  const edges = loaded.edges.map(
    (e, index): AppEdge => ({
      id: `e-${idMap.get(e.source)}-${idMap.get(e.target)}-${index}`,
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
    }),
  )
  return { nodes, edges }
}

/** Offset that moves the pasted set's bounding-box center onto the target. */
function centerOffset(nodes: readonly AppNode[], target: { x: number; y: number }) {
  const xs = nodes.map((n) => n.position.x)
  const ys = nodes.map((n) => n.position.y)
  return {
    x: target.x - (Math.min(...xs) + Math.max(...xs)) / 2,
    y: target.y - (Math.min(...ys) + Math.max(...ys)) / 2,
  }
}

/**
 * Rewrites a field's node references onto the pasted ids. Untouched: res
 * sugar (empty nodeId — the edge carries the target), dangling markers, and
 * template tokens whose owner is not a pasted node id ({{i}}, keys left by
 * the exporter's dangling rewrite).
 */
function remapField(field: NodeField, idMap: Map<string, string>): NodeField {
  if (field.source === 'binding' && field.ref && field.ref.nodeId !== '') {
    const nodeId = idMap.get(field.ref.nodeId)
    if (nodeId === undefined) return field
    const ref = { nodeId, path: field.ref.path }
    return { ...field, ref, value: refToStored(ref) }
  }
  if (field.source === 'template') {
    const value = mapTemplateOwners(field.value, idMap)
    return value === field.value ? field : { ...field, value }
  }
  return field
}
