// For-container geometry (plan 09 N5): loop membership is decided on drop —
// a node whose center lands inside a For's bounds re-parents in, one dropped
// outside re-parents out. These helpers do the absolute ↔ container-relative
// coordinate math so a re-parented node stays visually put.
import type { AppNode } from './model'

export type XY = { x: number; y: number }

/** Rendered node size; 0 until xyflow has measured (or the node sets explicit dims). */
export function nodeSize(node: AppNode): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? 0,
    height: node.measured?.height ?? node.height ?? 0,
  }
}

/** A node's absolute canvas position (children store container-relative coordinates). */
export function absolutePosition(node: AppNode, nodes: readonly AppNode[]): XY {
  let { x, y } = node.position
  let parentId = node.parentId
  // Containment is single-level in v1, but walking the chain keeps this
  // correct if nesting ever lands.
  while (parentId) {
    const parent = nodes.find((n) => n.id === parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  return { x, y }
}

/** A node's absolute center, for the drop hit-test. */
export function absoluteCenter(node: AppNode, nodes: readonly AppNode[]): XY {
  const abs = absolutePosition(node, nodes)
  const size = nodeSize(node)
  return { x: abs.x + size.width / 2, y: abs.y + size.height / 2 }
}

/**
 * The For container whose bounds contain the given absolute point, or null.
 * Later array entries win — with overlapping containers that is the one
 * rendered on top.
 */
export function containerAt(
  nodes: readonly AppNode[],
  point: XY,
  excludeId?: string,
): AppNode | null {
  let hit: AppNode | null = null
  for (const node of nodes) {
    if (node.type !== 'for' || node.id === excludeId) continue
    const abs = absolutePosition(node, nodes)
    const size = nodeSize(node)
    if (size.width <= 0 || size.height <= 0) continue
    if (
      point.x >= abs.x &&
      point.x <= abs.x + size.width &&
      point.y >= abs.y &&
      point.y <= abs.y + size.height
    ) {
      hit = node
    }
  }
  return hit
}

/**
 * The position a node must take so it stays visually put when its parent
 * changes: absolute coordinates for a top-level node, container-relative for
 * a child of newParent. Round-trips exactly (in → out → in).
 */
export function positionForParent(
  node: AppNode,
  nodes: readonly AppNode[],
  newParent: AppNode | null,
): XY {
  const abs = absolutePosition(node, nodes)
  if (!newParent) return abs
  const parentAbs = absolutePosition(newParent, nodes)
  return { x: abs.x - parentAbs.x, y: abs.y - parentAbs.y }
}

/**
 * xyflow requires a container to appear before its children in the nodes
 * array; the stable partition (top level first, then children) restores that
 * after any parenting change.
 */
export function parentsFirst(nodes: readonly AppNode[]): AppNode[] {
  return [...nodes.filter((n) => !n.parentId), ...nodes.filter((n) => n.parentId)]
}

/**
 * Whether two nodes live in the same scope (both top-level, or children of
 * the same For). Edges may never cross a loop boundary — the For node is the
 * loop's single interface (plan 09).
 */
export function sameScope(nodes: readonly AppNode[], aId: string, bId: string): boolean {
  const parentOf = (id: string) => nodes.find((n) => n.id === id)?.parentId ?? null
  return parentOf(aId) === parentOf(bId)
}
