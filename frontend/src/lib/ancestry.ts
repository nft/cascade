// What a node may read. The binding picker, the reference validator and the
// in-memory script scope all ask this one question, so they cannot disagree
// with each other or with the engine's readableAncestors (core/exec).
import type { AppNode } from './model'

type EdgeLike = { source: string; target: string }

/**
 * A node's transitive ancestors and, for a loop child, its For's — they ran
 * before the loop and hold still across iterations (plan 09). The For itself
 * is not one: its output is the aggregate the body is still producing.
 */
export function readableAncestors(
  nodes: readonly Pick<AppNode, 'id' | 'parentId'>[],
  edges: readonly EdgeLike[],
  nodeId: string,
): Set<string> {
  const result = ancestorsOf(edges, nodeId)
  const parentId = nodes.find((n) => n.id === nodeId)?.parentId
  if (parentId) for (const id of ancestorsOf(edges, parentId)) result.add(id)
  return result
}

function ancestorsOf(edges: readonly EdgeLike[], nodeId: string): Set<string> {
  const result = new Set<string>()
  const queue = [nodeId]
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
