// Per-node run behaviour: what each node type produces, captures and logs
// when the board runs. The loop executor's own contracts live in
// inMemoryRun.test.ts; AppState's run control lives in state.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  app.responses = {}
  app.isRunning = false
  app.runId = null
  app.boardId = null
  app.activeRunIds = null
})

afterEach(() => {
  vi.useRealTimers()
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

  it('a targeted run resolves bindings against the previous run captures (plan 11 D10)', async () => {
    vi.useFakeTimers()
    app.responses = {}
    app.nodes = [
      withFields('u1', [{ key: 'body.email', source: 'literal', value: 'ada@example.com' }]),
      withFields('o1', [
        { key: 'body.owner_id', source: 'binding', value: 'u1.body.id', ref: { nodeId: 'u1', path: 'body.id' } },
      ]),
    ]
    app.edges = [mkEdge('u1', 'o1')]

    let run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run
    const seededUserId = (app.responses['u1'].body as Record<string, unknown>).id

    // Re-run only o1: u1 is outside the run set, so its binding resolves from
    // the seed — and the target itself must not be marked skipped.
    run = app.simulateRun('o1', 'downstream')
    await vi.runAllTimersAsync()
    await run

    expect(statusOf('o1')).toBe('success')
    expect((app.responses['o1'].body as Record<string, unknown>).owner_id).toBe(seededUserId)
  })

  it('ignores a seeded capture for a node inside the run set (plan 11 D10)', async () => {
    vi.useFakeTimers()
    // A binding to a node that is in the run set but has not run yet must
    // fail, not silently read the previous run's value. No edge, so nothing
    // orders u1 before o1 — the exact case a script by key would hit.
    app.responses = { u1: { status: 201, body: { id: 'stale-id' }, at: '2026-07-01T00:00:00.000Z' } }
    app.nodes = [
      withFields('o1', [
        { key: 'body.owner_id', source: 'binding', value: 'u1.body.id', ref: { nodeId: 'u1', path: 'body.id' } },
      ]),
      withFields('u1', [{ key: 'body.email', source: 'literal', value: 'ada@example.com' }]),
    ]
    app.edges = []

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    const orgBody = app.responses['o1'].body as Record<string, unknown>
    expect(orgBody.owner_id).toContain('has not produced an output')
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

describe('raw-body sim capture (plan 10 §3c)', () => {
  const rawNode = (id: string, text: string, contentType = 'application/json'): HttpNode => {
    const node = mkNode(id) as HttpNode
    node.data.fields = []
    node.data.rawBody = { contentType, text }
    return node
  }

  it('merges a templated JSON object over the id/created_at stub, user keys winning', async () => {
    vi.useFakeTimers()
    const upstream = mkNode('u') as HttpNode
    upstream.data.key = 'u'
    upstream.data.fields = [{ key: 'body.name', source: 'literal', value: 'Apollo' }]
    const raw = rawNode('r', '{"org": "{{u.body.name}}", "id": "my-own-id"}')
    app.nodes = [upstream, raw]
    app.edges = [mkEdge('u', 'r')]

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    const body = app.responses['r']?.body as Record<string, unknown>
    expect(body.org).toBe('Apollo') // template resolved against the upstream capture
    expect(body.id).toBe('my-own-id') // user key wins over the stub
    expect(body.created_at).toBeDefined() // stub fills what the payload lacks
  })

  it('echoes non-JSON raw text as the body string instead of a misleading stub', async () => {
    vi.useFakeTimers()
    app.nodes = [rawNode('r', 'a,b\n1,2', 'text/csv')]
    app.edges = []

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    expect(app.responses['r']?.body).toBe('a,b\n1,2')
  })

  it('uses non-object JSON (array) as the body as-is', async () => {
    vi.useFakeTimers()
    app.nodes = [rawNode('r', '[1, 2, 3]')]
    app.edges = []

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    expect(app.responses['r']?.body).toEqual([1, 2, 3])
  })
})

describe('mock nodes in the sim (plan 09 N2)', () => {
  beforeEach(() => {
    app.responses = {}
  })

  const mkMock = (id: string, body: string): AppNode => ({
    id,
    type: 'mock',
    position: { x: 0, y: 0 },
    data: { name: id, key: `key_${id}`, status: 'idle', body, statusCode: 201 },
  })

  it('emits the parsed body as a captured response under the configured status', async () => {
    vi.useFakeTimers()
    app.nodes = [mkMock('m1', '{"users":[{"name":"ada"}]}'), mkNode('a1')]
    app.edges = [mkEdge('m1', 'a1')]

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    expect(statusOf('m1')).toBe('success')
    expect(statusOf('a1')).toBe('success')
    expect(app.responses.m1).toMatchObject({
      status: 201,
      body: { users: [{ name: 'ada' }] },
    })
  })

  it('fails the node on unparseable JSON and skips its descendants only', async () => {
    vi.useFakeTimers()
    app.nodes = [mkMock('m1', '{"broken'), mkNode('a1'), mkNode('b1')]
    app.edges = [mkEdge('m1', 'a1')]

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    expect(statusOf('m1')).toBe('failed')
    expect(statusOf('a1')).toBe('skipped')
    expect(statusOf('b1')).toBe('success')
    expect(app.responses.m1).toBeUndefined()
  })
})

describe('delay nodes in the sim (plan 09 N3)', () => {
  beforeEach(() => {
    app.responses = {}
  })

  const mkMock = (id: string, body: string): AppNode => ({
    id,
    type: 'mock',
    position: { x: 0, y: 0 },
    data: { name: id, key: `key_${id}`, status: 'idle', body, statusCode: 201 },
  })

  const mkDelay = (id: string, durationMs: number): AppNode => ({
    id,
    type: 'delay',
    position: { x: 0, y: 0 },
    data: { name: id, key: `key_${id}`, status: 'idle', durationMs },
  })

  it('passes its single upstream response through unchanged', async () => {
    vi.useFakeTimers()
    app.nodes = [mkMock('m1', '{"id":"u1"}'), mkDelay('d1', 500), mkNode('a1')]
    app.edges = [mkEdge('m1', 'd1'), mkEdge('d1', 'a1')]

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    expect(statusOf('d1')).toBe('success')
    expect(statusOf('a1')).toBe('success')
    // Pass-through: the delay's output is the upstream capture. Equality, not
    // identity — the capture crosses the run event stream, and on the Wails
    // path each event carries its own decoded copy.
    expect(app.responses.d1).toEqual(app.responses.m1)
  })

  it('outputs a status-0 null body without an upstream (a gate, not a joiner)', async () => {
    vi.useFakeTimers()
    app.nodes = [mkDelay('d1', 500)]
    app.edges = []

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    expect(statusOf('d1')).toBe('success')
    expect(app.responses.d1).toMatchObject({ status: 0, body: null })
  })

  it('fails on an out-of-range duration and skips its descendants only', async () => {
    vi.useFakeTimers()
    app.nodes = [mkDelay('d1', 0), mkNode('a1'), mkNode('b1')]
    app.edges = [mkEdge('d1', 'a1')]

    const run = app.simulateRun()
    await vi.runAllTimersAsync()
    await run

    expect(statusOf('d1')).toBe('failed')
    expect(statusOf('a1')).toBe('skipped')
    expect(statusOf('b1')).toBe('success')
    expect(app.responses.d1).toBeUndefined()
  })
})
