/**
 * Geometry and scheduling for the landing page's demo graph.
 *
 * Pure and framework-free: the page renders the result as static SVG/HTML at
 * build time, and the behaviour layer only toggles classes over it.
 */

/** Node box size, in the demo canvas' own coordinate space. */
export const NODE_SIZE = { width: 190, height: 76 } as const

/** Demo canvas viewport the coordinates above are laid out in. */
export const CANVAS_SIZE = { width: 760, height: 380 } as const

/**
 * Horizontal pull on a bezier control point, as a fraction of the span.
 *
 * Exactly half puts both control points on the midline, which is what makes
 * the curve a symmetric S. Anything above half crosses them and the edge
 * visibly kinks.
 */
const CURVE_RATIO = 0.5
/** Floor for the control offset so near-vertical edges still bow. */
const MIN_CURVE = 24

export interface Point {
  x: number
  y: number
}

export interface NodeSpec {
  id: string
  label: string
  method: string
  path: string
  /** Top-left of the node box in canvas coordinates. */
  x: number
  y: number
  dependsOn: string[]
}

export interface EdgeLayout {
  id: string
  from: string
  to: string
  d: string
}

/**
 * Cubic bezier between two points, control points pulled horizontally — the
 * same edge shape the app's canvas draws.
 */
export function bezierPath(from: Point, to: Point): string {
  const offset = Math.max(MIN_CURVE, Math.abs(to.x - from.x) * CURVE_RATIO)
  const c1 = { x: from.x + offset, y: from.y }
  const c2 = { x: to.x - offset, y: to.y }
  return `M${from.x},${from.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`
}

/** Right-hand output port of a node box. */
export function outputPort(node: NodeSpec): Point {
  return { x: node.x + NODE_SIZE.width, y: node.y + NODE_SIZE.height / 2 }
}

/** Left-hand input port of a node box. */
export function inputPort(node: NodeSpec): Point {
  return { x: node.x, y: node.y + NODE_SIZE.height / 2 }
}

export function edgeId(from: string, to: string): string {
  return `${from}__${to}`
}

/** Resolves every `dependsOn` into a drawable edge. Unknown ids are an error. */
export function layoutEdges(nodes: NodeSpec[]): EdgeLayout[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edges: EdgeLayout[] = []

  for (const node of nodes) {
    for (const from of node.dependsOn) {
      const source = byId.get(from)
      if (!source) throw new Error(`unknown dependency "${from}" on node "${node.id}"`)
      edges.push({
        id: edgeId(from, node.id),
        from,
        to: node.id,
        d: bezierPath(outputPort(source), inputPort(node)),
      })
    }
  }

  return edges
}

/**
 * Groups nodes into execution levels: everything in one level has all of its
 * dependencies satisfied by earlier levels, so the demo can light up parallel
 * branches together the way the engine runs them.
 *
 * Kahn's algorithm with ids sorted inside each level, so the order is
 * deterministic. Throws on a cycle, matching the editor's edit-time rejection.
 */
export function topoLevels(nodes: NodeSpec[]): string[][] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!byId.has(dep)) throw new Error(`unknown dependency "${dep}" on node "${node.id}"`)
    }
  }

  const remaining = new Map(nodes.map((n) => [n.id, new Set(n.dependsOn)]))
  const levels: string[][] = []

  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, deps]) => deps.size === 0)
      .map(([id]) => id)
      .sort()

    if (ready.length === 0) throw new Error('cycle detected in demo graph')

    for (const id of ready) remaining.delete(id)
    for (const deps of remaining.values()) {
      for (const id of ready) deps.delete(id)
    }
    levels.push(ready)
  }

  return levels
}
