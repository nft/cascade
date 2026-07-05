// Pure graph helpers over the canvas node/edge arrays (plan 03 §3–4).
import type { AppEdge, AppNode } from './model'

/**
 * Map edges to display edges: an edge animates iff its target node is running
 * (data is "flowing into" the node being executed); failed targets get a
 * distinct class. Styling for both classes lives in src/style.css.
 */
export function decorateEdges(nodes: AppNode[], edges: AppEdge[]): AppEdge[] {
  const statusById = new Map(nodes.map((n) => [n.id, n.data.status]))
  return edges.map((edge) => {
    const targetStatus = statusById.get(edge.target)
    const animated = targetStatus === 'running'
    return {
      ...edge,
      animated,
      class: animated ? 'edge-active' : targetStatus === 'failed' ? 'edge-failed' : undefined,
    }
  })
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
