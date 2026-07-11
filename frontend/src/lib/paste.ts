// Paste pipeline (plan 07 E3): turns an envelope's board into fresh canvas
// nodes — new IDs, keys re-slugged on collision against the target board,
// bindings and template tokens rewritten to the new IDs (they store node
// IDs), positions recentered on the paste target with the original relative
// layout, and everything marked selected so the paste lands as a group.
import { deserializeBoard } from './board'
import type { AppEdge, AppNode, BoardJSON, NodeField } from './model'
import { takenKeys, uniqueKey } from './refs'

export interface PastedGraph {
  nodes: AppNode[]
  edges: AppEdge[]
}

/** Matches {{…}} interpolation tokens in template fields (mirrors share/nodedata.go). */
const TEMPLATE_TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

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
    const position = { x: n.position.x + offset.x, y: n.position.y + offset.y }
    if (n.type === 'note') return { ...n, id, position, selected: true }
    const key = uniqueKey(n.data.key, taken)
    taken.add(key)
    if (n.type === 'transform') {
      return {
        ...n,
        id,
        position,
        selected: true,
        data: { ...n.data, key, pick: n.data.pick.map((f) => remapField(f, idMap)) },
      }
    }
    return {
      ...n,
      id,
      position,
      selected: true,
      data: { ...n.data, key, fields: n.data.fields.map((f) => remapField(f, idMap)) },
    }
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
 * template tokens whose head is not a pasted node id ({{i}}, keys left by
 * the exporter's dangling rewrite).
 */
function remapField(field: NodeField, idMap: Map<string, string>): NodeField {
  if (field.source === 'binding' && field.ref && field.ref.nodeId !== '') {
    const nodeId = idMap.get(field.ref.nodeId)
    if (nodeId === undefined) return field
    return {
      ...field,
      ref: { nodeId, path: field.ref.path },
      value: field.ref.path ? `${nodeId}.${field.ref.path}` : nodeId,
    }
  }
  if (field.source === 'template') {
    const value = field.value.replace(TEMPLATE_TOKEN_RE, (token, inner: string) => {
      const [head, ...rest] = inner.split('.')
      const mapped = idMap.get(head)
      if (mapped === undefined) return token
      return `{{${[mapped, ...rest].join('.')}}}`
    })
    return value === field.value ? field : { ...field, value }
  }
  return field
}
