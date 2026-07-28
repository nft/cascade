/**
 * Unit tests for the pure geometry/scheduling module behind the hero graph.
 *
 * The demo canvas is rendered to static SVG at build time and the behaviour
 * layer only toggles classes over it, so a bad coordinate or a bad level order
 * never surfaces at runtime — these tests are the only guard on either.
 */
import { describe, expect, it } from 'vitest'
import {
  CANVAS_SIZE,
  NODE_SIZE,
  bezierPath,
  edgeId,
  inputPort,
  layoutEdges,
  outputPort,
  topoLevels,
  type NodeSpec,
  type Point,
} from '../src/lib/graph'
import { DEMO_NODES } from '../src/data/demo'

/**
 * Mirrors of the module-private curve constants. Duplicating them here is the
 * point: changing the curve has to be a deliberate edit in two places, not a
 * silent reshape of every edge on the landing page.
 */
const CURVE_RATIO = 0.5
const MIN_CURVE = 24

/** Span at which the ratio finally beats the floor: MIN_CURVE / CURVE_RATIO. */
const BREAK_EVEN_SPAN = MIN_CURVE / CURVE_RATIO

/** Comfortably wider than BREAK_EVEN_SPAN, so the ratio governs. */
const WIDE = { from: { x: 100, y: 40 }, to: { x: 400, y: 260 } } as const
/** Narrower than BREAK_EVEN_SPAN, so the floor governs. */
const TINY = { from: { x: 200, y: 0 }, to: { x: 210, y: 120 } } as const

const CUBIC_PATH =
  /^M(?<sx>-?[\d.]+),(?<sy>-?[\d.]+) C(?<c1x>-?[\d.]+),(?<c1y>-?[\d.]+) (?<c2x>-?[\d.]+),(?<c2y>-?[\d.]+) (?<ex>-?[\d.]+),(?<ey>-?[\d.]+)$/

interface Cubic {
  start: Point
  c1: Point
  c2: Point
  end: Point
}

function parseCubic(d: string): Cubic {
  const g = CUBIC_PATH.exec(d)?.groups
  if (!g) throw new Error(`not an "M… C…" cubic path: ${d}`)
  return {
    start: { x: Number(g.sx), y: Number(g.sy) },
    c1: { x: Number(g.c1x), y: Number(g.c1y) },
    c2: { x: Number(g.c2x), y: Number(g.c2y) },
    end: { x: Number(g.ex), y: Number(g.ey) },
  }
}

/** Cubic bezier at t = 0.5, which reduces to (P0 + 3·C1 + 3·C2 + P3) / 8. */
const MID_INNER_WEIGHT = 3
const MID_DIVISOR = 8

function curveMidpoint(curve: Cubic): Point {
  const at = (p0: number, c1: number, c2: number, p3: number) =>
    (p0 + MID_INNER_WEIGHT * c1 + MID_INNER_WEIGHT * c2 + p3) / MID_DIVISOR
  return {
    x: at(curve.start.x, curve.c1.x, curve.c2.x, curve.end.x),
    y: at(curve.start.y, curve.c1.y, curve.c2.y, curve.end.y),
  }
}

/** Horizontal pull applied to the first control point of a rendered edge. */
function controlOffset(from: Point, to: Point): number {
  return parseCubic(bezierPath(from, to)).c1.x - from.x
}

function spec(id: string, dependsOn: string[] = [], x = 0, y = 0): NodeSpec {
  return { id, label: id.toUpperCase(), method: 'POST', path: `/v1/${id}`, x, y, dependsOn }
}

/** a → (b, c) → d: the smallest graph with both a fan-out and a join. */
function diamond(): NodeSpec[] {
  return [spec('a'), spec('b', ['a']), spec('c', ['a']), spec('d', ['b', 'c'])]
}

function levelIndexOf(levels: string[][], id: string): number {
  return levels.findIndex((level) => level.includes(id))
}

function expectDependenciesInEarlierLevels(nodes: NodeSpec[]): void {
  const levels = topoLevels(nodes)
  for (const node of nodes) {
    const own = levelIndexOf(levels, node.id)
    expect(own).toBeGreaterThanOrEqual(0)
    for (const dep of node.dependsOn) {
      expect(levelIndexOf(levels, dep)).toBeLessThan(own)
    }
  }
}

function boxesOverlap(a: NodeSpec, b: NodeSpec): boolean {
  return (
    a.x < b.x + NODE_SIZE.width &&
    b.x < a.x + NODE_SIZE.width &&
    a.y < b.y + NODE_SIZE.height &&
    b.y < a.y + NODE_SIZE.height
  )
}

describe('bezierPath', () => {
  it('emits a valid "M… C…" cubic with no NaN', () => {
    const d = bezierPath(WIDE.from, WIDE.to)
    expect(d).toMatch(CUBIC_PATH)
    expect(d).toBe('M100,40 C250,40 250,260 400,260')
    for (const point of Object.values(parseCubic(d))) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
    }
  })

  it('keeps its endpoints exactly as given', () => {
    const curve = parseCubic(bezierPath(WIDE.from, WIDE.to))
    expect(curve.start).toEqual(WIDE.from)
    expect(curve.end).toEqual(WIDE.to)
  })

  it('sits both control points on the midline for a normal horizontal span', () => {
    const curve = parseCubic(bezierPath(WIDE.from, WIDE.to))
    const midX = (WIDE.from.x + WIDE.to.x) / 2
    expect(curve.c1.x).toBe(midX)
    expect(curve.c2.x).toBe(midX)
  })

  it('holds each control point on its own endpoint row, so the edge leaves horizontally', () => {
    const curve = parseCubic(bezierPath(WIDE.from, WIDE.to))
    expect(curve.c1.y).toBe(WIDE.from.y)
    expect(curve.c2.y).toBe(WIDE.to.y)
  })

  it('is a symmetric S — the curve midpoint is the midpoint of the endpoints', () => {
    const curve = parseCubic(bezierPath(WIDE.from, WIDE.to))
    expect(curveMidpoint(curve)).toEqual({
      x: (WIDE.from.x + WIDE.to.x) / 2,
      y: (WIDE.from.y + WIDE.to.y) / 2,
    })
  })

  it('applies the MIN_CURVE floor when the span is tiny', () => {
    const curve = parseCubic(bezierPath(TINY.from, TINY.to))
    expect(curve.c1.x - TINY.from.x).toBe(MIN_CURVE)
    expect(TINY.to.x - curve.c2.x).toBe(MIN_CURVE)
    // The floor deliberately overshoots the midline; that overshoot is the bow.
    expect(curve.c1.x).toBeGreaterThan((TINY.from.x + TINY.to.x) / 2)
  })

  it('still bows on a purely vertical span', () => {
    const from = { x: TINY.from.x, y: TINY.from.y }
    const to = { x: TINY.from.x, y: TINY.to.y }
    expect(controlOffset(from, to)).toBe(MIN_CURVE)
  })

  it('hands over from the floor to the ratio at the break-even span', () => {
    const offsetForSpan = (span: number) => controlOffset({ x: 0, y: 0 }, { x: span, y: 0 })
    expect(offsetForSpan(BREAK_EVEN_SPAN - 1)).toBe(MIN_CURVE)
    expect(offsetForSpan(BREAK_EVEN_SPAN)).toBe(MIN_CURVE)
    expect(offsetForSpan(BREAK_EVEN_SPAN * 2)).toBe(BREAK_EVEN_SPAN)
    expect(offsetForSpan(BREAK_EVEN_SPAN * 2)).toBe(BREAK_EVEN_SPAN * 2 * CURVE_RATIO)
  })

  it('measures the span as a magnitude, bowing outward when it runs right to left', () => {
    const forward = parseCubic(bezierPath(WIDE.from, WIDE.to))
    const backward = parseCubic(bezierPath(WIDE.to, WIDE.from))
    expect(backward.c1.x - WIDE.to.x).toBe(forward.c1.x - WIDE.from.x)
    expect(backward.c1.x).toBeGreaterThan(WIDE.to.x)
    expect(backward.c2.x).toBeLessThan(WIDE.from.x)
  })
})

describe('outputPort / inputPort', () => {
  const PLACED_AT = { x: 40, y: 100 } as const
  const placed = spec('a', [], PLACED_AT.x, PLACED_AT.y)

  it('reads the right-centre of the node box', () => {
    expect(outputPort(placed)).toEqual({
      x: PLACED_AT.x + NODE_SIZE.width,
      y: PLACED_AT.y + NODE_SIZE.height / 2,
    })
  })

  it('reads the left-centre of the node box', () => {
    expect(inputPort(placed)).toEqual({
      x: PLACED_AT.x,
      y: PLACED_AT.y + NODE_SIZE.height / 2,
    })
  })

  it('derives both ports from NODE_SIZE rather than from fixed numbers', () => {
    const out = outputPort(placed)
    const inp = inputPort(placed)
    expect(out.x - inp.x).toBe(NODE_SIZE.width)
    expect(out.y).toBe(inp.y)
    expect(out.y - placed.y).toBe(NODE_SIZE.height / 2)
  })

  it('translates with the node', () => {
    const shift = { x: -12, y: 250 }
    const moved = spec('a', [], PLACED_AT.x + shift.x, PLACED_AT.y + shift.y)
    expect(outputPort(moved).x - outputPort(placed).x).toBe(shift.x)
    expect(inputPort(moved).y - inputPort(placed).y).toBe(shift.y)
  })
})

describe('edgeId', () => {
  it('joins source and target with a stable separator', () => {
    expect(edgeId('create_user', 'create_org')).toBe('create_user__create_org')
  })

  it('is direction-sensitive', () => {
    expect(edgeId('a', 'b')).not.toBe(edgeId('b', 'a'))
  })
})

describe('layoutEdges', () => {
  it('emits exactly one edge per declared dependency', () => {
    const nodes = diamond()
    const declared = nodes.reduce((sum, node) => sum + node.dependsOn.length, 0)
    expect(layoutEdges(nodes)).toHaveLength(declared)
  })

  it('keys every edge with edgeId(from, to)', () => {
    const edges = layoutEdges(diamond())
    expect(edges.map((edge) => edge.id)).toEqual(['a__b', 'a__c', 'b__d', 'c__d'])
    for (const edge of edges) {
      expect(edge.id).toBe(edgeId(edge.from, edge.to))
    }
  })

  it('draws from the source output port to the target input port', () => {
    const source = spec('a', [], 0, 0)
    const target = spec('b', ['a'], 300, 120)
    const edges = layoutEdges([source, target])
    expect(edges[0]?.d).toBe(bezierPath(outputPort(source), inputPort(target)))
  })

  it('returns nothing when no node declares a dependency', () => {
    expect(layoutEdges([spec('a'), spec('b')])).toEqual([])
  })

  it('resolves a dependency declared later in the array', () => {
    expect(layoutEdges([spec('b', ['a']), spec('a')]).map((edge) => edge.id)).toEqual(['a__b'])
  })

  it('throws on a dependency that names no node', () => {
    expect(() => layoutEdges([spec('a'), spec('b', ['ghost'])])).toThrow(
      /unknown dependency "ghost" on node "b"/,
    )
  })
})

describe('topoLevels', () => {
  it('places every dependency in a strictly earlier level', () => {
    expectDependenciesInEarlierLevels(diamond())
  })

  it('lists every node exactly once', () => {
    const nodes = diamond()
    expect(topoLevels(nodes).flat().sort()).toEqual(nodes.map((node) => node.id).sort())
  })

  it('sorts ids inside a level, so the order is deterministic', () => {
    expect(topoLevels([spec('c'), spec('a'), spec('b')])).toEqual([['a', 'b', 'c']])
  })

  it('is stable under input reordering', () => {
    const nodes = diamond()
    expect(topoLevels([...nodes].reverse())).toEqual(topoLevels(nodes))
  })

  it('groups a diamond into fan-out and join levels', () => {
    expect(topoLevels(diamond())).toEqual([['a'], ['b', 'c'], ['d']])
  })

  it('holds a node back for its slowest dependency', () => {
    // c depends on both a and b, so it cannot ride along in b's level.
    const levels = topoLevels([spec('a'), spec('b', ['a']), spec('c', ['a', 'b'])])
    expect(levels).toEqual([['a'], ['b'], ['c']])
  })

  it('runs independent chains side by side', () => {
    const levels = topoLevels([spec('a'), spec('b', ['a']), spec('x'), spec('y', ['x'])])
    expect(levels).toEqual([
      ['a', 'x'],
      ['b', 'y'],
    ])
  })

  it('throws on a cycle', () => {
    expect(() => topoLevels([spec('a', ['b']), spec('b', ['a'])])).toThrow(/cycle detected/)
  })

  it('throws on a cycle even when acyclic nodes could still be scheduled', () => {
    const nodes = [spec('root'), spec('a', ['root', 'b']), spec('b', ['a'])]
    expect(() => topoLevels(nodes)).toThrow(/cycle detected/)
  })

  it('throws on a self-dependency', () => {
    expect(() => topoLevels([spec('a', ['a'])])).toThrow(/cycle detected/)
  })

  it('throws on a dependency that names no node', () => {
    expect(() => topoLevels([spec('a'), spec('b', ['ghost'])])).toThrow(
      /unknown dependency "ghost" on node "b"/,
    )
  })

  it('returns nothing for an empty graph', () => {
    expect(topoLevels([])).toEqual([])
  })
})

describe('DEMO_NODES layout', () => {
  it.each(DEMO_NODES)('$id sits fully inside the canvas', (node) => {
    expect(node.x).toBeGreaterThanOrEqual(0)
    expect(node.y).toBeGreaterThanOrEqual(0)
    expect(node.x + NODE_SIZE.width).toBeLessThanOrEqual(CANVAS_SIZE.width)
    expect(node.y + NODE_SIZE.height).toBeLessThanOrEqual(CANVAS_SIZE.height)
  })

  it('never overlaps two node boxes', () => {
    for (const [i, a] of DEMO_NODES.entries()) {
      for (const b of DEMO_NODES.slice(i + 1)) {
        expect(boxesOverlap(a, b), `${a.id} overlaps ${b.id}`).toBe(false)
      }
    }
  })

  it('uses unique node ids', () => {
    const ids = DEMO_NODES.map((node) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('produces unique edge ids', () => {
    const ids = layoutEdges(DEMO_NODES).map((edge) => edge.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('resolves every dependency and stays acyclic', () => {
    expect(() => layoutEdges(DEMO_NODES)).not.toThrow()
    expectDependenciesInEarlierLevels(DEMO_NODES)
  })

  it('flows strictly left to right, so no edge has to double back', () => {
    const byId = new Map(DEMO_NODES.map((node) => [node.id, node]))
    for (const node of DEMO_NODES) {
      for (const dep of node.dependsOn) {
        const source = byId.get(dep)
        expect(source, `missing ${dep}`).toBeDefined()
        expect(outputPort(source ?? node).x).toBeLessThanOrEqual(inputPort(node).x)
      }
    }
  })

  it('keeps every rendered edge inside the canvas', () => {
    for (const edge of layoutEdges(DEMO_NODES)) {
      const { start, end } = parseCubic(edge.d)
      for (const point of [start, end]) {
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThanOrEqual(CANVAS_SIZE.width)
        expect(point.y).toBeGreaterThanOrEqual(0)
        expect(point.y).toBeLessThanOrEqual(CANVAS_SIZE.height)
      }
    }
  })
})
