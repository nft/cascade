import type { Box, DemoLayout, EdgeSpec, Flow } from './board'

export interface Point {
  x: number
  y: number
}

// Control points pulled half the span along the flow give the symmetric S
// the app's canvas draws; the floor keeps short edges from going straight.
const CURVE_RATIO = 0.5
const MIN_CURVE = 36

/** Where an edge leaves a node: right side for horizontal flow, bottom for vertical. */
export function outPort(box: Box, flow: Flow): Point {
  return flow === 'horizontal' ? { x: box.x + box.w, y: box.y + box.h / 2 } : { x: box.x + box.w / 2, y: box.y + box.h }
}

/** Where an edge enters a node: left side or top. */
export function inPort(box: Box, flow: Flow): Point {
  return flow === 'horizontal' ? { x: box.x, y: box.y + box.h / 2 } : { x: box.x + box.w / 2, y: box.y }
}

export function bezier(from: Point, to: Point, flow: Flow): string {
  if (flow === 'horizontal') {
    const pull = Math.max(MIN_CURVE, Math.abs(to.x - from.x) * CURVE_RATIO)
    return `M${from.x},${from.y} C${from.x + pull},${from.y} ${to.x - pull},${to.y} ${to.x},${to.y}`
  }
  const pull = Math.max(MIN_CURVE, Math.abs(to.y - from.y) * CURVE_RATIO)
  return `M${from.x},${from.y} C${from.x},${from.y + pull} ${to.x},${to.y - pull} ${to.x},${to.y}`
}

export interface EdgePath {
  id: string
  from: string
  to: string
  d: string
  /** Port positions, for the handle dots drawn at each end. */
  start: Point
  end: Point
}

/** Paths for every edge whose two ends the layout places. */
export function layoutEdges(layout: DemoLayout, edges: readonly EdgeSpec[]): EdgePath[] {
  return edges.flatMap((edge) => {
    const source = layout.boxes[edge.from]
    const target = layout.boxes[edge.to]
    if (!source || !target) return []
    const start = outPort(source, layout.flow)
    const end = inPort(target, layout.flow)
    return [{ ...edge, d: bezier(start, end, layout.flow), start, end }]
  })
}

/**
 * Run order: Kahn's algorithm over the edges, ties broken by board order, so
 * nodes run one at a time the way the engine schedules them. Nodes inside a
 * loop are left out; the loop runs them.
 */
export function runOrder(nodeIds: readonly string[], edges: readonly EdgeSpec[]): string[] {
  const indegree = new Map(nodeIds.map((id) => [id, 0]))
  for (const edge of edges) {
    if (indegree.has(edge.to) && indegree.has(edge.from)) indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)
  }
  const order: string[] = []
  const ready = nodeIds.filter((id) => indegree.get(id) === 0)
  while (ready.length > 0) {
    const id = ready.shift() as string
    order.push(id)
    for (const edge of edges.filter((e) => e.from === id && indegree.has(e.to))) {
      const left = (indegree.get(edge.to) ?? 0) - 1
      indegree.set(edge.to, left)
      if (left === 0) ready.push(edge.to)
    }
    ready.sort((a, b) => nodeIds.indexOf(a) - nodeIds.indexOf(b))
  }
  if (order.length !== nodeIds.length) throw new Error('demo board has a cycle')
  return order
}
