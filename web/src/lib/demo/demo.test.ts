import { describe, expect, it } from 'vitest'
import { DEMO_EDGES, DEMO_NODES, TALL_LAYOUT, WIDE_LAYOUT, type DemoLayout } from './board'
import { bezier, inPort, layoutEdges, outPort, runOrder } from './geometry'

const box = { x: 10, y: 20, w: 100, h: 40 }

describe('ports', () => {
  it('leaves right and enters left in horizontal flow', () => {
    expect(outPort(box, 'horizontal')).toEqual({ x: 110, y: 40 })
    expect(inPort(box, 'horizontal')).toEqual({ x: 10, y: 40 })
  })

  it('leaves bottom and enters top in vertical flow', () => {
    expect(outPort(box, 'vertical')).toEqual({ x: 60, y: 60 })
    expect(inPort(box, 'vertical')).toEqual({ x: 60, y: 20 })
  })
})

describe('bezier', () => {
  it('pulls control points half the span along the flow', () => {
    expect(bezier({ x: 0, y: 0 }, { x: 200, y: 50 }, 'horizontal')).toBe('M0,0 C100,0 100,50 200,50')
    expect(bezier({ x: 0, y: 0 }, { x: 50, y: 200 }, 'vertical')).toBe('M0,0 C0,100 50,100 50,200')
  })
})

describe('runOrder', () => {
  it('orders by dependency and breaks ties by board order', () => {
    const edges = [
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'ac', from: 'a', to: 'c' },
      { id: 'cd', from: 'c', to: 'd' },
    ]
    expect(runOrder(['a', 'c', 'b', 'd'], edges)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('rejects a cycle', () => {
    expect(() =>
      runOrder(
        ['a', 'b'],
        [
          { id: 'ab', from: 'a', to: 'b' },
          { id: 'ba', from: 'b', to: 'a' },
        ],
      ),
    ).toThrow(/cycle/)
  })
})

describe('demo layouts', () => {
  const inside = (layout: DemoLayout, id: string) => {
    const b = layout.boxes[id]
    return b !== undefined && b.x >= 0 && b.y >= 0 && b.x + b.w <= layout.width && b.y + b.h <= layout.height
  }

  it.each([
    ['wide', WIDE_LAYOUT],
    ['tall', TALL_LAYOUT],
  ])('%s keeps every placed node on the canvas', (_, layout) => {
    for (const id of Object.keys(layout.boxes)) expect(inside(layout, id), id).toBe(true)
  })

  it('places every runnable node in both layouts', () => {
    for (const node of DEMO_NODES.filter((n) => n.kind !== 'note')) {
      expect(WIDE_LAYOUT.boxes[node.id], node.id).toBeDefined()
      expect(TALL_LAYOUT.boxes[node.id], node.id).toBeDefined()
    }
  })

  it('draws every edge in both layouts', () => {
    expect(layoutEdges(WIDE_LAYOUT, DEMO_EDGES)).toHaveLength(DEMO_EDGES.length)
    expect(layoutEdges(TALL_LAYOUT, DEMO_EDGES)).toHaveLength(DEMO_EDGES.length)
  })
})
