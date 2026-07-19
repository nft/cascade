import { describe, expect, it } from 'vitest'
import {
  absoluteCenter,
  absolutePosition,
  containerAt,
  parentsFirst,
  positionForParent,
  sameScope,
} from './containment'
import type { AppNode, ForNodeData } from './model'

const forData: ForNodeData = { name: 'Loop', key: 'loop', status: 'idle', mode: 'count', count: 3 }

const mkFor = (id: string, x: number, y: number, width = 400, height = 240): AppNode => ({
  id,
  type: 'for',
  position: { x, y },
  width,
  height,
  data: { ...forData, key: `key_${id}` },
})

const mkMock = (id: string, x: number, y: number, parentId?: string): AppNode => ({
  id,
  type: 'mock',
  position: { x, y },
  ...(parentId ? { parentId } : {}),
  measured: { width: 224, height: 80 },
  data: { name: id, key: `key_${id}`, status: 'idle', body: '{}', statusCode: 200 },
})

describe('containment geometry (plan 09 N5)', () => {
  it('absolutePosition adds the container offset for children', () => {
    const loop = mkFor('loop', 100, 50)
    const child = mkMock('m1', 30, 40, 'loop')
    expect(absolutePosition(child, [loop, child])).toEqual({ x: 130, y: 90 })
    expect(absolutePosition(loop, [loop, child])).toEqual({ x: 100, y: 50 })
  })

  it('re-parent position translation round-trips exactly', () => {
    const loop = mkFor('loop', 100, 50)
    const free = mkMock('m1', 180, 120)
    const nodes = [loop, free]

    const relative = positionForParent(free, nodes, loop)
    expect(relative).toEqual({ x: 80, y: 70 })

    const asChild: AppNode = { ...free, parentId: 'loop', position: relative }
    const backOut = positionForParent(asChild, [loop, asChild], null)
    expect(backOut).toEqual({ x: 180, y: 120 })
  })

  it('containerAt hit-tests the node center against For bounds', () => {
    const loop = mkFor('loop', 100, 50)
    const nodes = [loop, mkMock('m1', 0, 0)]
    expect(containerAt(nodes, { x: 300, y: 150 })?.id).toBe('loop')
    expect(containerAt(nodes, { x: 99, y: 150 })).toBeNull()
    // The container never captures itself (dragging the For around).
    expect(containerAt(nodes, { x: 300, y: 150 }, 'loop')).toBeNull()
  })

  it('containerAt prefers the later (topmost) of overlapping containers', () => {
    const bottom = mkFor('bottom', 0, 0)
    const top = mkFor('top', 50, 50)
    expect(containerAt([bottom, top], { x: 100, y: 100 })?.id).toBe('top')
  })

  it('absoluteCenter uses measured node size', () => {
    const child = mkMock('m1', 10, 20)
    expect(absoluteCenter(child, [child])).toEqual({ x: 10 + 112, y: 20 + 40 })
  })

  it('parentsFirst keeps containers ahead of children, stably', () => {
    const loop = mkFor('loop', 0, 0)
    const child = mkMock('m1', 0, 0, 'loop')
    const free = mkMock('m2', 0, 0)
    expect(parentsFirst([child, loop, free]).map((n) => n.id)).toEqual(['loop', 'm2', 'm1'])
  })

  it('sameScope separates loop bodies from the top level', () => {
    const loop = mkFor('loop', 0, 0)
    const a = mkMock('a', 0, 0, 'loop')
    const b = mkMock('b', 0, 0, 'loop')
    const outside = mkMock('c', 0, 0)
    const nodes = [loop, a, b, outside]
    expect(sameScope(nodes, 'a', 'b')).toBe(true)
    expect(sameScope(nodes, 'a', 'c')).toBe(false)
    expect(sameScope(nodes, 'c', 'loop')).toBe(true)
    expect(sameScope(nodes, 'a', 'loop')).toBe(false)
  })
})
