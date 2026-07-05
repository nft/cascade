import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleGlobalKeydown } from './keyboard'
import { operations } from './mock'
import type { AppEdge, AppNode, HttpNode, NodeStatus } from './model'
import { app } from './state.svelte'

const mkNode = (id: string, status: NodeStatus = 'stale'): AppNode => ({
  id,
  type: 'http',
  position: { x: 0, y: 0 },
  data: {
    name: id,
    method: 'GET',
    path: `/v1/${id}`,
    environment: 'staging',
    credential: 'staging-admin',
    status,
    repeat: 1,
    fields: [{ key: 'body.name', source: 'literal', value: 'Apollo' }],
  },
})

const mkEdge = (source: string, target: string): AppEdge => ({ id: `${source}->${target}`, source, target })

const statusOf = (id: string) => {
  const data = app.nodes.find((n) => n.id === id)?.data
  return data && 'status' in data ? data.status : undefined
}

beforeEach(() => {
  app.nodes = []
  app.edges = []
  app.logs = []
  app.selectedNodeId = null
  app.contextMenu = null
  app.canvasTool = 'select'
  app.isRunning = false
})

afterEach(() => {
  vi.useRealTimers()
})

describe('addNode placement (plan 03 §2)', () => {
  it('places the node at the given flow position (add-at-cursor)', () => {
    app.addNode(operations[0], { x: 123, y: 456 })
    const added = app.nodes.at(-1)!
    expect(added.position).toEqual({ x: 123, y: 456 })
    expect(app.selectedNodeId).toBe(added.id)
  })

  it('keeps auto-positioning when no position is passed (sidebar)', () => {
    app.addNode(operations[0])
    const added = app.nodes.at(-1)!
    expect(added.position.x).toBeGreaterThan(0)
  })
})

describe('duplicateNode', () => {
  it('copies data and field values to a new id offset by +40/+40', () => {
    app.nodes = [mkNode('a1')]
    app.duplicateNode('a1')
    expect(app.nodes).toHaveLength(2)
    // mkNode only builds http nodes, so both ends of the copy are HttpNode.
    const [original, copy] = app.nodes as HttpNode[]
    expect(copy.id).not.toBe('a1')
    expect(copy.position).toEqual({ x: 40, y: 40 })
    expect(copy.data.fields).toEqual(original.data.fields)
    expect(copy.data.fields).not.toBe(original.data.fields)
    expect(copy.data.status).toBe('idle')
    expect(app.selectedNodeId).toBe(copy.id)
  })
})

describe('scissors cut (plan 03 §5)', () => {
  it('removeEdge removes only the clicked edge and never nodes', () => {
    app.nodes = [mkNode('a'), mkNode('b'), mkNode('c')]
    app.edges = [mkEdge('a', 'b'), mkEdge('b', 'c')]
    app.removeEdge('a->b')
    expect(app.edges.map((e) => e.id)).toEqual(['b->c'])
    expect(app.nodes).toHaveLength(3)
  })

  it('x toggles the scissors tool, v and Escape return to select', () => {
    handleGlobalKeydown(new KeyboardEvent('keydown', { key: 'x' }))
    expect(app.canvasTool).toBe('scissors')
    handleGlobalKeydown(new KeyboardEvent('keydown', { key: 'x' }))
    expect(app.canvasTool).toBe('select')
    handleGlobalKeydown(new KeyboardEvent('keydown', { key: 'x' }))
    handleGlobalKeydown(new KeyboardEvent('keydown', { key: 'v' }))
    expect(app.canvasTool).toBe('select')
    app.canvasTool = 'scissors'
    handleGlobalKeydown(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(app.canvasTool).toBe('select')
  })
})

describe('escape priority (plan 03 §1)', () => {
  it('closes the context menu first, then the scissors tool, then the inspector', () => {
    app.selectedNodeId = 'a'
    app.canvasTool = 'scissors'
    app.contextMenu = { kind: 'pane', screen: { x: 0, y: 0 } }
    app.escapePressed()
    expect(app.contextMenu).toBeNull()
    expect(app.canvasTool).toBe('scissors')
    app.escapePressed()
    expect(app.canvasTool).toBe('select')
    expect(app.selectedNodeId).toBe('a')
    app.escapePressed()
    expect(app.selectedNodeId).toBeNull()
  })

  it('does not close the inspector while typing in a field', () => {
    app.selectedNodeId = 'a'
    app.escapePressed(true)
    expect(app.selectedNodeId).toBe('a')
  })
})

describe('targeted simulateRun (plan 03 §4)', () => {
  it('runs exactly the ancestor set; a disconnected chain never leaves its previous status', async () => {
    vi.useFakeTimers()
    app.nodes = [mkNode('a1'), mkNode('a2'), mkNode('b1'), mkNode('b2')]
    app.edges = [mkEdge('a1', 'a2'), mkEdge('b1', 'b2')]

    const run = app.simulateRun('a2', 'upstream')
    await vi.runAllTimersAsync()
    await run

    expect(statusOf('a1')).toBe('success')
    expect(statusOf('a2')).toBe('success')
    expect(statusOf('b1')).toBe('stale')
    expect(statusOf('b2')).toBe('stale')
    expect(app.isRunning).toBe(false)
    expect(app.logs.map((l) => l.node).sort()).toEqual(['a1', 'a2'])
  })

  it('downstream scope (node Play button) runs the node and the chain after it, not ancestors', async () => {
    vi.useFakeTimers()
    app.nodes = [mkNode('a1'), mkNode('a2'), mkNode('a3')]
    app.edges = [mkEdge('a1', 'a2'), mkEdge('a2', 'a3')]

    const run = app.simulateRun('a2', 'downstream')
    await vi.runAllTimersAsync()
    await run

    expect(statusOf('a1')).toBe('stale')
    expect(statusOf('a2')).toBe('success')
    expect(statusOf('a3')).toBe('success')
    expect(app.logs.map((l) => l.node).sort()).toEqual(['a2', 'a3'])
  })

  it('upstream scope excludes descendants; component scope includes them', async () => {
    vi.useFakeTimers()
    app.nodes = [mkNode('a1'), mkNode('a2'), mkNode('a3')]
    app.edges = [mkEdge('a1', 'a2'), mkEdge('a2', 'a3')]

    let run = app.simulateRun('a2', 'upstream')
    await vi.runAllTimersAsync()
    await run
    expect(statusOf('a1')).toBe('success')
    expect(statusOf('a2')).toBe('success')
    expect(statusOf('a3')).toBe('stale')

    run = app.simulateRun('a2', 'component')
    await vi.runAllTimersAsync()
    await run
    expect(statusOf('a3')).toBe('success')
  })

  it('a run without a target still touches the whole board', async () => {
    vi.useFakeTimers()
    app.nodes = [mkNode('a1'), mkNode('b1')]
    app.edges = []

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run
    expect(statusOf('a1')).toBe('success')
    expect(statusOf('b1')).toBe('success')
  })
})
