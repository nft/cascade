// The loop executor's contracts (plan 09 N7), driven end to end through the
// run event stream. Per-node behaviour lives in runNodes.test.ts and the
// event-application rules in applyRunEvent.test.ts; this file covers For
// iteration: scope, aggregation, progress, fail-fast and config tiering.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isForNode, type AppEdge, type AppNode } from './model'
import { app } from './state.svelte'

const mkEdge = (source: string, target: string): AppEdge => ({ id: `${source}->${target}`, source, target })

const statusOf = (id: string) => {
  const data = app.nodes.find((n) => n.id === id)?.data
  return data && 'status' in data ? data.status : undefined
}

const forData = (id: string) => {
  const node = app.nodes.find((n) => n.id === id)
  return node && isForNode(node) ? node.data : undefined
}
describe('For loops in the sim (plan 09 N7)', () => {
  const mkMockNode = (id: string, key: string, body: string, parentId?: string): AppNode => ({
    id,
    type: 'mock',
    position: { x: 0, y: 0 },
    ...(parentId ? { parentId } : {}),
    data: { name: id, key, status: 'idle', body, statusCode: 201 },
  })

  const mkForNode = (
    id: string,
    key: string,
    config: { mode: 'count' | 'each'; count?: number; source?: { nodeId: string; path: string } },
  ): AppNode => ({
    id,
    type: 'for',
    position: { x: 0, y: 0 },
    width: 400,
    height: 240,
    data: { name: id, key, status: 'idle', mode: config.mode, count: config.count ?? 3, ...(config.source ? { source: config.source } : {}) },
  })

  const mkPick = (
    id: string,
    key: string,
    rows: { key: string; source: 'template' | 'binding'; value: string; ref?: { nodeId: string; path: string } }[],
    parentId?: string,
  ): AppNode => ({
    id,
    type: 'transform',
    position: { x: 0, y: 0 },
    ...(parentId ? { parentId } : {}),
    data: { name: id, key, status: 'idle', mode: 'pick', pick: rows, script: '' },
  })

  const mkDelayChild = (id: string, key: string, parentId: string): AppNode => ({
    id,
    type: 'delay',
    position: { x: 0, y: 0 },
    parentId,
    data: { name: id, key, status: 'idle', durationMs: 1 },
  })

  beforeEach(() => {
    app.nodes = []
    app.edges = []
    app.logs = []
    app.responses = {}
    app.isRunning = false
    app.activeRunIds = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const runSim = async () => {
    vi.useFakeTimers()
    const run = app.run()
    await vi.runAllTimersAsync()
    await run
  }

  it('runs the done-when chain: each-mode scope, aggregation, [*] downstream', async () => {
    app.nodes = [
      mkMockNode('seed', 'seedUsers', '{"org":"acme","users":[{"name":"ada"},{"name":"lin"}]}'),
      mkForNode('loop', 'loop', { mode: 'each', source: { nodeId: 'seed', path: 'body.users' } }),
      mkPick(
        'shape',
        'createUser',
        [
          { key: 'tag', source: 'template', value: 'u{{i}}-{{item.name}}' },
          { key: 'org', source: 'template', value: '{{seed.body.org}}' },
        ],
        'loop',
      ),
      mkDelayChild('wait', 'gate', 'loop'),
      mkPick('after', 'collect', [
        { key: 'tags', source: 'binding', value: '', ref: { nodeId: 'loop', path: 'createUser[*].tag' } },
      ]),
    ]
    app.edges = [mkEdge('seed', 'loop'), mkEdge('shape', 'wait'), mkEdge('loop', 'after')]

    await runSim()

    // Aggregate output keyed by child key; the delay child is excluded.
    expect(app.responses.loop?.body).toEqual({
      createUser: [
        { tag: 'u0-ada', org: 'acme' },
        { tag: 'u1-lin', org: 'acme' },
      ],
    })
    // Downstream [*] binding maps over the aggregate.
    expect(app.responses.after?.body).toEqual({ tags: ['u0-ada', 'u1-lin'] })
    expect(statusOf('loop')).toBe('success')
    expect(statusOf('after')).toBe('success')
    expect(forData('loop')?.progress).toBeUndefined()

    // Iteration rows carry the 0-based iteration; the summary closes the loop.
    const shapeRows = app.logs.filter((l) => l.nodeId === 'shape')
    expect(shapeRows.map((l) => l.iteration)).toEqual([0, 1])
    const delayRows = app.logs.filter((l) => l.nodeId === 'wait')
    expect(delayRows.map((l) => l.kind)).toEqual(['delay', 'delay'])
    const summary = app.logs.find((l) => l.kind === 'for')
    expect(summary).toMatchObject({ nodeId: 'loop', iterations: 2 })
    expect(summary?.error).toBeUndefined()
    // Mock rows exist too, without an iteration tag at top level.
    const seedRow = app.logs.find((l) => l.nodeId === 'seed')
    expect(seedRow).toMatchObject({ kind: 'mock', status: 201 })
    expect(seedRow?.iteration).toBeUndefined()
  })

  it('fails only the loop on a non-array each source; sibling chains still run', async () => {
    app.nodes = [
      mkMockNode('seed', 'seedUsers', '{"users":"nope"}'),
      mkForNode('loop', 'loop', { mode: 'each', source: { nodeId: 'seed', path: 'body.users' } }),
      mkMockNode('child', 'childMock', '{}', 'loop'),
      mkPick('after', 'collect', [
        { key: 'all', source: 'binding', value: '', ref: { nodeId: 'loop', path: 'body' } },
      ]),
      mkMockNode('solo', 'solo', '{"ok":true}'),
    ]
    app.edges = [mkEdge('seed', 'loop'), mkEdge('loop', 'after')]

    await runSim()

    expect(statusOf('loop')).toBe('failed')
    expect(forData('loop')?.note).toContain('each source must be an array')
    expect(statusOf('after')).toBe('skipped')
    expect(statusOf('solo')).toBe('success')
    expect(app.responses.loop).toBeUndefined()
    expect(app.logs.find((l) => l.kind === 'for')).toMatchObject({ iterations: 0 })
  })

  it('fail-fast: a failing iteration aborts the remaining ones', async () => {
    app.nodes = [
      mkMockNode('seed', 'seedUsers', '{"users":[{"name":"ada"},2]}'),
      mkForNode('loop', 'loop', { mode: 'each', source: { nodeId: 'seed', path: 'body.users' } }),
      mkPick('shape', 'createUser', [{ key: 'tag', source: 'template', value: '{{item.name}}' }], 'loop'),
    ]
    app.edges = [mkEdge('seed', 'loop')]

    await runSim()

    expect(statusOf('loop')).toBe('failed')
    expect(forData('loop')?.note).toBe('iteration 2 of 2 failed')
    expect(app.responses.loop).toBeUndefined()
    const shapeRows = app.logs.filter((l) => l.nodeId === 'shape')
    expect(shapeRows).toHaveLength(2)
    expect(shapeRows[1].error).toBeDefined()
    expect(app.logs.find((l) => l.kind === 'for')).toMatchObject({ iterations: 1 })
  })

  it('runs count mode with a fresh {{i}} per iteration', async () => {
    app.nodes = [
      mkForNode('loop', 'loop', { mode: 'count', count: 3 }),
      mkPick('shape', 'idx', [{ key: 'n', source: 'template', value: '{{i}}' }], 'loop'),
    ]
    app.edges = []

    await runSim()

    expect(app.responses.loop?.body).toEqual({ idx: [{ n: 0 }, { n: 1 }, { n: 2 }] })
    expect(statusOf('loop')).toBe('success')
  })
})
