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
    key: `key_${id.replace(/[^A-Za-z0-9]/g, '_')}`,
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
  app.activeRunIds = null
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

describe('response capture and schema pinning (plan 05)', () => {
  const withFields = (id: string, fields: HttpNode['data']['fields']): AppNode => {
    const node = mkNode(id) as HttpNode
    node.data.fields = fields
    return node
  }

  it('captures each successful response and resolves the FK chain through refs', async () => {
    vi.useFakeTimers()
    app.responses = {}
    app.nodes = [
      withFields('u1', [{ key: 'body.email', source: 'literal', value: 'ada@example.com' }]),
      withFields('o1', [
        { key: 'body.owner_id', source: 'binding', value: 'u1.body.id', ref: { nodeId: 'u1', path: 'body.id' } },
        { key: 'body.greeting', source: 'template', value: 'welcome-{{u1.body.email}}' },
      ]),
    ]
    app.edges = [mkEdge('u1', 'o1')]

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    const userBody = app.responses['u1'].body as Record<string, unknown>
    const orgBody = app.responses['o1'].body as Record<string, unknown>
    expect(userBody.email).toBe('ada@example.com')
    // the org's binding resolved against the user's captured response
    expect(orgBody.owner_id).toBe(userBody.id)
    expect(orgBody.greeting).toBe('welcome-ada@example.com')
    expect(app.responses['u1'].status).toBe(201)
  })

  it('res sugar resolves against the single direct upstream during the sim', async () => {
    vi.useFakeTimers()
    app.responses = {}
    app.nodes = [
      withFields('u1', [{ key: 'body.name', source: 'literal', value: 'Ada' }]),
      withFields('o1', [
        { key: 'body.owner', source: 'binding', value: 'res.name', ref: { nodeId: '', path: 'name' } },
      ]),
    ]
    app.edges = [mkEdge('u1', 'o1')]

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run
    expect((app.responses['o1'].body as Record<string, unknown>).owner).toBe('Ada')
  })

  it('useLastResponseAsSchema pins an inferred schema onto the node', async () => {
    vi.useFakeTimers()
    app.responses = {}
    app.nodes = [withFields('u1', [{ key: 'body.email', source: 'literal', value: 'ada@example.com' }])]
    app.edges = []

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    app.useLastResponseAsSchema('u1')
    const node = app.nodes[0] as HttpNode
    expect(node.data.responseSchema?.type).toBe('object')
    expect(node.data.responseSchema?.properties?.email).toEqual({ type: 'string', format: 'email' })
    expect(node.data.responseSchema?.properties?.id.format).toBe('uuid')
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

describe('transform nodes in the sim (plan 06 T2)', () => {
  const mkTransform = (id: string, script: string): AppNode => ({
    id,
    type: 'transform',
    position: { x: 0, y: 0 },
    data: {
      name: id,
      key: `key_${id.replace(/[^A-Za-z0-9]/g, '_')}`,
      status: 'idle',
      mode: 'script',
      pick: [],
      script,
    },
  })

  it('executes a transform between two http nodes; bindings resolve through it', async () => {
    vi.useFakeTimers()
    const upstream = mkNode('create-org')
    const invite = mkNode('invite')
    invite.data = {
      ...invite.data,
      fields: [{ key: 'body.from', source: 'binding', value: 'shape.label', ref: { nodeId: 'shape', path: 'label' } }],
    } as HttpNode['data']
    app.nodes = [upstream, mkTransform('shape', 'return { label: "org " + res.body.name }'), invite]
    app.edges = [mkEdge('create-org', 'shape'), mkEdge('shape', 'invite')]

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    expect(statusOf('shape')).toBe('success')
    // Synthetic output captured like a response (status 0) and bound downstream.
    expect(app.responses['shape']?.status).toBe(0)
    expect(app.responses['shape']?.body).toEqual({ label: 'org Apollo' })
    expect((app.responses['invite']?.body as { from: string }).from).toBe('org Apollo')
    // Transform log record variant: input keys and output, no url/status.
    const entry = app.logs.find((l) => l.kind === 'transform')
    expect(entry).toBeDefined()
    if (entry?.kind === 'transform') {
      expect(entry.inputNodes).toEqual(['key_create_org'])
      expect(entry.output).toBe(JSON.stringify({ label: 'org Apollo' }))
    }
  })

  it('a failing script fails the node with the message and skips downstream', async () => {
    vi.useFakeTimers()
    app.nodes = [mkNode('a'), mkTransform('t', 'throw new Error("boom")'), mkNode('b')]
    app.edges = [mkEdge('a', 't'), mkEdge('t', 'b')]

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    expect(statusOf('t')).toBe('failed')
    expect(statusOf('b')).toBe('skipped')
    const entry = app.logs.find((l) => l.kind === 'transform')
    expect(entry?.error).toMatch(/boom/)
  })

  it('note nodes are never scheduled: no status, no log entry', async () => {
    vi.useFakeTimers()
    app.nodes = [mkNode('a'), { id: 'sticky', type: 'note', position: { x: 0, y: 0 }, data: { text: 'hi' } }]
    app.edges = []

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    expect(statusOf('sticky')).toBeUndefined()
    expect(app.logs.some((l) => l.node === 'sticky')).toBe(false)
    expect(app.responses['sticky']).toBeUndefined()
  })
})
