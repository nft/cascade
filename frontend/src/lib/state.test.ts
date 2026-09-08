import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { serializeBoard } from './board'
import { dialogs } from './dialogs.svelte'
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
    key: `key_${id.replace(/[^A-Za-z0-9]/g, '_')}`,
    method: 'GET',
    path: `/v1/${id}`,
    environment: 'staging',
    credential: 'staging-admin',
    status,
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
  app.runId = null
  app.boardId = null
  app.activeRunIds = null
})

afterEach(() => {
  vi.useRealTimers()
  // Restored here, not in the test body: a failing assertion would otherwise
  // leak a spy into every test after it.
  vi.restoreAllMocks()
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

describe('node id allocation', () => {
  it('skips ids a loaded board already contains (counter restarts on relaunch)', () => {
    // Simulate a persisted board holding the id the counter would mint next.
    const first = app.addTransformNode()
    const counter = Number(first.slice(first.lastIndexOf('-') + 1))
    const clash = `transform-${counter + 1}`
    app.nodes = [...app.nodes, mkNode(clash)]
    const second = app.addTransformNode()
    expect(second).not.toBe(clash)
    const ids = app.nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
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
    // While running, the ancestor is not part of the active run set (its edge must not animate).
    expect(app.activeRunIds).toEqual(new Set(['a2', 'a3']))
    await vi.runAllTimersAsync()
    await run

    expect(app.activeRunIds).toBeNull()
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

describe('run control (plan 11)', () => {
  it('stopRun ends the run between nodes, leaving what it already did', async () => {
    vi.useFakeTimers()
    app.nodes = [mkNode('a1'), mkNode('a2'), mkNode('a3')]
    app.edges = [mkEdge('a1', 'a2'), mkEdge('a2', 'a3')]

    const run = app.simulateRun()
    await vi.advanceTimersByTimeAsync(600) // a1 finished, a2 in flight
    await app.stopRun()
    await vi.runAllTimersAsync()
    await run

    expect(statusOf('a1')).toBe('success')
    expect(statusOf('a2')).toBe('success') // the in-flight node still lands
    expect(statusOf('a3')).toBe('idle') // never reached
    expect(app.isRunning).toBe(false)
    expect(app.runId).toBeNull()
  })

  it('openBoard cancels the run, and the old run never touches the new board', async () => {
    vi.useFakeTimers()
    app.boardId = 'b1'
    app.responses = {}
    app.nodes = [mkNode('a1'), mkNode('a2')]
    app.edges = [mkEdge('a1', 'a2')]

    const run = app.simulateRun()
    expect(app.isRunning).toBe(true)
    await app.openBoard(serializeBoard('b2', 'Other', [], []))
    expect(app.isRunning).toBe(false)
    expect(app.runId).toBeNull()
    expect(app.activeRunIds).toBeNull()

    await vi.runAllTimersAsync()
    await run

    // Scoped by (project, board), not by node id: the ids collide across
    // boards by design, so nothing from b1's run may land on b2 (plan 11 D17).
    expect(app.isRunning).toBe(false)
    expect(app.logs).toEqual([])
    expect(app.responses).toEqual({})
  })

  it('reconciles the canvas from the terminal result when every event is lost', async () => {
    vi.useFakeTimers()
    app.nodes = [mkNode('a1'), mkNode('a2')]
    app.edges = [mkEdge('a1', 'a2')]
    // The engine's channel is lossless, but the Wails bus across the webview
    // boundary has no delivery guarantee (plan 11 D12) — so this is a run
    // whose entire event stream failed to arrive.
    const subscribe = vi.spyOn(api, 'onRunEvent').mockReturnValue(() => {})

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    expect(subscribe).toHaveBeenCalled()
    // Rows and captures travel as events and are genuinely gone; the statuses
    // are what the backstop exists to rescue, and they are correct.
    expect(app.logs).toEqual([])
    expect(statusOf('a1')).toBe('success')
    expect(statusOf('a2')).toBe('success')
  })

  it('a finishing run never clears flags a later run already owns', async () => {
    vi.useFakeTimers()
    app.nodes = [mkNode('a1')]
    app.edges = []

    const run = app.simulateRun()
    // Stand in for a successor run: the flags now belong to it, not to `run`.
    app.runId = 'run-later'
    app.isRunning = true
    app.activeRunIds = new Set(['a1'])

    await vi.runAllTimersAsync()
    await run

    expect(app.runId).toBe('run-later')
    expect(app.isRunning).toBe(true)
    expect(app.activeRunIds).toEqual(new Set(['a1']))
  })
})

describe('node keys (plan 05 §9a)', () => {
  it('addNode derives a board-unique key from the operation summary', () => {
    const op = operations[0] // "Create a user"
    app.nodes = []
    app.addNode(op)
    app.addNode(op)
    const keys = app.nodes.map((n) => (n as HttpNode).data.key)
    expect(keys[0]).toBe('createAUser')
    expect(keys[1]).toBe('createAUser2')
  })

  it('duplicateNode re-keys the copy', () => {
    app.nodes = [mkNode('a1')]
    app.duplicateNode('a1')
    const keys = app.nodes.map((n) => (n as HttpNode).data.key)
    expect(new Set(keys).size).toBe(2)
  })

  it('setNodeKey rejects invalid, reserved and taken keys', () => {
    app.nodes = [mkNode('a1'), mkNode('a2')]
    expect(app.setNodeKey('a1', 'res')).toMatch(/reserved/)
    expect(app.setNodeKey('a1', '1abc')).toMatch(/letters/)
    expect(app.setNodeKey('a1', (app.nodes[1] as HttpNode).data.key)).toMatch(/already used/)
    expect(app.setNodeKey('a1', 'makeUser')).toBeNull()
    expect((app.nodes[0] as HttpNode).data.key).toBe('makeUser')
  })
})

describe('clearLogs (plan 10 §1)', () => {
  it('empties logs and touches nothing else', async () => {
    vi.useFakeTimers()
    app.nodes = [mkNode('a')]
    app.edges = []

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    expect(app.logs.length).toBeGreaterThan(0)
    const nodesBefore = app.nodes
    const responsesBefore = { ...app.responses }

    app.clearLogs()

    expect(app.logs).toEqual([])
    expect(app.nodes).toBe(nodesBefore)
    expect(statusOf('a')).toBe('success')
    expect(app.responses).toEqual(responsesBefore)
  })
})

describe('renameField (plan 10 §3b)', () => {
  const fields = (): HttpNode['data']['fields'] => [
    { key: 'query.a', source: 'literal', value: '1' },
    { key: 'query.b', source: 'binding', value: 'n1.body.id', ref: { nodeId: 'n1', path: 'body.id' } },
    { key: 'query.c', source: 'literal', value: '3' },
  ]

  it('rewrites the key in place, preserving value/source/ref and row order', () => {
    const node = mkNode('a') as HttpNode
    node.data.fields = fields()
    app.nodes = [node]
    app.renameField('a', 'query.b', 'query.renamed')
    const updated = (app.nodes[0] as HttpNode).data.fields
    expect(updated.map((f) => f.key)).toEqual(['query.a', 'query.renamed', 'query.c'])
    expect(updated[1]).toMatchObject({ source: 'binding', value: 'n1.body.id', ref: { nodeId: 'n1', path: 'body.id' } })
  })

  it('is a no-op when the new key already exists', () => {
    const node = mkNode('a') as HttpNode
    node.data.fields = fields()
    app.nodes = [node]
    app.renameField('a', 'query.b', 'query.a')
    expect((app.nodes[0] as HttpNode).data.fields.map((f) => f.key)).toEqual(['query.a', 'query.b', 'query.c'])
  })
})

describe('For containment on the canvas (plan 09 N5)', () => {
  const mkFor = (id: string, x = 0, y = 0): AppNode => ({
    id,
    type: 'for',
    position: { x, y },
    width: 400,
    height: 240,
    data: { name: id, key: `key_${id}`, status: 'idle', mode: 'count', count: 3 },
  })

  const mkMockAt = (id: string, x: number, y: number, parentId?: string): AppNode => ({
    id,
    type: 'mock',
    position: { x, y },
    ...(parentId ? { parentId } : {}),
    measured: { width: 200, height: 80 },
    data: { name: id, key: `key_${id}`, status: 'idle', body: '{}', statusCode: 200 },
  })

  beforeEach(() => {
    dialogs.toast = null
    dialogs.confirmDeleteFor = null
  })

  it('dropNode re-parents into the container under the node center, keeping it visually put', () => {
    app.nodes = [mkFor('loop', 100, 100), mkMockAt('m1', 150, 150)]
    app.dropNode('m1')
    const child = app.nodes.find((n) => n.id === 'm1')!
    expect(child.parentId).toBe('loop')
    // absolute (150,150) − container (100,100) = relative (50,50)
    expect(child.position).toEqual({ x: 50, y: 50 })
    // containers stay ahead of children in the array
    expect(app.nodes.map((n) => n.id)).toEqual(['loop', 'm1'])
  })

  it('dropNode re-parents out when the center leaves the container', () => {
    app.nodes = [mkFor('loop', 100, 100), mkMockAt('m1', 600, 50, 'loop')]
    app.dropNode('m1')
    const freed = app.nodes.find((n) => n.id === 'm1')!
    expect(freed.parentId).toBeUndefined()
    expect(freed.position).toEqual({ x: 700, y: 150 })
  })

  it('refuses a drop-in that would leave an edge crossing the boundary, with a toast', () => {
    app.nodes = [mkFor('loop', 100, 100), mkMockAt('m1', 150, 150), mkMockAt('out', 900, 900)]
    app.edges = [mkEdge('m1', 'out')]
    app.dropNode('m1')
    expect(app.nodes.find((n) => n.id === 'm1')!.parentId).toBeUndefined()
    expect(dialogs.toast).toContain('cross the loop boundary')
  })

  it('refuses nesting a For into a For, with a toast', () => {
    const inner = { ...mkFor('inner', 150, 150), measured: { width: 200, height: 100 } }
    app.nodes = [mkFor('outer', 100, 100), inner]
    app.dropNode('inner')
    expect(app.nodes.find((n) => n.id === 'inner')!.parentId).toBeUndefined()
    expect(dialogs.toast).toContain('Nested for loops')
  })

  it('removeNode on a For cascades to its children, edges and responses', () => {
    app.nodes = [mkFor('loop'), mkMockAt('m1', 0, 0, 'loop'), mkMockAt('m2', 500, 500)]
    app.edges = [mkEdge('m1', 'm1x'), mkEdge('m2', 'loop')]
    app.responses = { m1: { status: 200, body: {}, at: 't' }, m2: { status: 200, body: {}, at: 't' } }
    app.removeNode('loop')
    expect(app.nodes.map((n) => n.id)).toEqual(['m2'])
    expect(app.edges).toEqual([])
    expect(app.responses.m1).toBeUndefined()
    expect(app.responses.m2).toBeDefined()
  })

  it('removeNodeRequest asks first for a For with children, deletes an empty one directly', () => {
    app.nodes = [mkFor('loop'), mkMockAt('m1', 0, 0, 'loop'), mkFor('empty', 900, 900)]
    app.removeNodeRequest('loop')
    expect(dialogs.confirmDeleteFor).toEqual({ nodeId: 'loop', childCount: 1 })
    expect(app.nodes.some((n) => n.id === 'loop')).toBe(true)

    app.removeNodeRequest('empty')
    expect(app.nodes.some((n) => n.id === 'empty')).toBe(false)
  })
})
