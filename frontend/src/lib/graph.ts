// Pure graph helpers over the canvas node/edge arrays (plan 03 §3–4).
import type { AppEdge, AppNode } from './model'
import { formatEdgeLabel, nodeSendKeys } from './nodeIO'

/**
 * Map edges to display edges: an edge animates iff its target node is running
 * (data is "flowing into" the node being executed) and its source is part of
 * the active run — a subgraph run (e.g. the Play button's downstream scope)
 * must not animate edges from ancestors that are not running, even though
 * they may still carry a status from an earlier run. Failed targets get a
 * distinct class. Styling for both classes lives in src/style.css.
 *
 * `highlightNodeId` (hovered log row, plan 10 §2) marks every incident edge —
 * incoming fed the call, outgoing consumed it; together they pin the node.
 * Precedence: a live run wins over the hover highlight, the hover highlight
 * wins over failed (the panel already shows the red; the canvas shows where).
 *
 * Edges also get a label naming what the source hands over — the names
 * downstream nodes can reference off it — so the payload is readable on the
 * wire rather than only inside the two cards it runs between.
 */
export function decorateEdges(
  nodes: AppNode[],
  edges: AppEdge[],
  activeRunIds: ReadonlySet<string> | null = null,
  highlightNodeId: string | null = null,
): AppEdge[] {
  // Note nodes carry no status; their edges (which validation rejects anyway)
  // simply get no decoration.
  const statusById = new Map(nodes.map((n) => [n.id, 'status' in n.data ? n.data.status : undefined]))
  const sendsById = new Map(nodes.map((n) => [n.id, nodeSendKeys(n)]))
  return edges.map((edge) => {
    const targetStatus = statusById.get(edge.target)
    const sends = sendsById.get(edge.source) ?? []
    const animated =
      targetStatus === 'running' && (activeRunIds === null || activeRunIds.has(edge.source))
    const highlighted =
      highlightNodeId !== null && (edge.source === highlightNodeId || edge.target === highlightNodeId)
    return {
      ...edge,
      animated,
      label: sends.length > 0 ? formatEdgeLabel(sends) : undefined,
      class: animated
        ? 'edge-active'
        : highlighted
          ? 'edge-log-highlight'
          : targetStatus === 'failed'
            ? 'edge-failed'
            : undefined,
    }
  })
}

/**
 * Every node must carry a type registered in the xyflow nodeTypes map: xyflow
 * silently renders unknown types with its default node, which would let an
 * unregistered type (a newer board's node, a typo) masquerade as a working
 * node. Fail loudly instead (plan 06 T1).
 */
export function assertKnownNodeTypes(
  nodes: ReadonlyArray<{ id: string; type?: string }>,
  registered: ReadonlySet<string>,
): void {
  for (const n of nodes) {
    if (!n.type || !registered.has(n.type)) {
      throw new Error(`node "${n.id}" has unregistered node type "${n.type}"`)
    }
  }
}

/** The node plus its transitive ancestors — the engine's planned `Options.Target` subgraph. */
export function upstreamIds(edges: AppEdge[], targetId: string): Set<string> {
  const result = new Set([targetId])
  const queue = [targetId]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const e of edges) {
      if (e.target === id && !result.has(e.source)) {
        result.add(e.source)
        queue.push(e.source)
      }
    }
  }
  return result
}

/** The node plus its transitive descendants — what the node card's Play button runs. */
export function downstreamIds(edges: AppEdge[], targetId: string): Set<string> {
  const result = new Set([targetId])
  const queue = [targetId]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const e of edges) {
      if (e.source === id && !result.has(e.target)) {
        result.add(e.target)
        queue.push(e.target)
      }
    }
  }
  return result
}

export type Point = { x: number; y: number }

function orient(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  )
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  if (o1 > 0 !== o2 > 0 && o1 < 0 !== o2 < 0 && o3 > 0 !== o4 > 0 && o3 < 0 !== o4 < 0) return true
  // Collinear endpoints touching the other segment.
  if (o1 === 0 && onSegment(a, b, c)) return true
  if (o2 === 0 && onSegment(a, b, d)) return true
  if (o3 === 0 && onSegment(c, d, a)) return true
  if (o4 === 0 && onSegment(c, d, b)) return true
  return false
}

/** True when any segment of polyline `a` crosses any segment of polyline `b` (scissors slice test). */
export function polylinesIntersect(a: Point[], b: Point[]): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) return true
    }
  }
  return false
}

/** The node's weakly-connected component: ancestors and descendants (BFS over undirected edges). */
export function componentIds(edges: AppEdge[], targetId: string): Set<string> {
  const result = new Set([targetId])
  const queue = [targetId]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const e of edges) {
      if (e.source === id && !result.has(e.target)) {
        result.add(e.target)
        queue.push(e.target)
      }
      if (e.target === id && !result.has(e.source)) {
        result.add(e.source)
        queue.push(e.source)
      }
    }
  }
  return result
}
