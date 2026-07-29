// Inserting a node into an existing connection (edge context menu): A→B
// becomes A→N→B. Pure helpers over the node/edge arrays.
import { parentsFirst, positionForParent, type XY } from './containment'
import type { AppEdge, AppNode } from './model'

/**
 * Nominal card footprint (a w-56 card with a header and two rows). A node
 * created from the menu has not been measured by xyflow yet, so centering it
 * on the clicked point of the wire goes through this estimate.
 */
const NOMINAL_NODE_WIDTH = 224
const NOMINAL_NODE_HEIGHT = 88

/** Top-left position that puts a fresh card over the point clicked on the wire. */
export function centeredNodePosition(point: XY): XY {
  return { x: point.x - NOMINAL_NODE_WIDTH / 2, y: point.y - NOMINAL_NODE_HEIGHT / 2 }
}

/**
 * The loop scope a connection lives in, or null for a top-level one. Both
 * endpoints share it — edges may never cross a For boundary (plan 09).
 */
export function edgeScope(nodes: readonly AppNode[], edge: AppEdge): string | null {
  return nodes.find((n) => n.id === edge.source)?.parentId ?? null
}

function freshEdgeId(source: string, target: string, taken: ReadonlySet<string>): string {
  const base = `e-${source}-${target}`
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

/**
 * Replace A→B with A→N and N→B, in the original's array slot. An unknown edge
 * id leaves the array untouched.
 */
export function spliceEdge(edges: readonly AppEdge[], edgeId: string, nodeId: string): AppEdge[] {
  const edge = edges.find((e) => e.id === edgeId)
  if (!edge) return [...edges]
  const taken = new Set(edges.map((e) => e.id))
  const incoming: AppEdge = {
    id: freshEdgeId(edge.source, nodeId, taken),
    source: edge.source,
    target: nodeId,
  }
  taken.add(incoming.id)
  const outgoing: AppEdge = {
    id: freshEdgeId(nodeId, edge.target, taken),
    source: nodeId,
    target: edge.target,
  }
  return edges.flatMap((e) => (e.id === edgeId ? [incoming, outgoing] : [e]))
}

/**
 * Move a node into the connection's loop scope. A node created from the menu
 * lands top-level with an absolute position; splicing it into an edge inside a
 * For would otherwise leave both new edges crossing the loop boundary, and a
 * child's position is stored relative to its container.
 */
export function adoptEdgeScope(
  nodes: readonly AppNode[],
  nodeId: string,
  edge: AppEdge,
): AppNode[] {
  const node = nodes.find((n) => n.id === nodeId)
  const parentId = edgeScope(nodes, edge)
  if (!node || (node.parentId ?? null) === parentId) return [...nodes]
  const parent = parentId ? (nodes.find((n) => n.id === parentId) ?? null) : null
  const position = positionForParent(node, nodes, parent)
  const { parentId: _dropped, ...rest } = node
  const moved = (parent ? { ...rest, parentId: parent.id, position } : { ...rest, position }) as AppNode
  return parentsFirst(nodes.map((n) => (n.id === nodeId ? moved : n)))
}
