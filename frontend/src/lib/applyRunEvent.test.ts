// Event application (plan 11 §6): scripted event arrays, no timers, no
// promises, no backend — every rule about how a run repaints the canvas is
// decided here, so this is where they are pinned.
import { beforeEach, describe, expect, it } from 'vitest'
import { applyRunEvent, applyRunResult, RUN_FAILED_MESSAGE } from './applyRunEvent'
import { dialogs } from './dialogs.svelte'
import type { AppNode, CapturedResponse, HttpLogEntry, LogEntry, NodeStatus } from './model'
import { RunEventKind, type RunEvent, type RunResult, type RunStatus } from './runEvents'
import { app } from './state.svelte'

const PROJECT_ID = 'proj-1'
const BOARD_ID = 'board-1'
const RUN_ID = 'run-abcd'

const mkNode = (id: string, status: NodeStatus = 'idle'): AppNode => ({
  id,
  type: 'mock',
  position: { x: 0, y: 0 },
  data: { name: id, key: `key_${id}`, status, body: '{}', statusCode: 200 },
})

const mkFor = (id: string): AppNode => ({
  id,
  type: 'for',
  position: { x: 0, y: 0 },
  data: { name: id, key: `key_${id}`, status: 'idle', mode: 'count', count: 2 },
})

const mkLog = (nodeId: string, extra: Partial<HttpLogEntry> = {}): LogEntry => ({
  kind: 'http',
  id: `${RUN_ID}-${nodeId}`,
  runId: RUN_ID,
  time: '12:00:00.000',
  node: nodeId,
  nodeId,
  method: 'POST',
  url: `https://api.example.com/${nodeId}`,
  status: 201,
  durationMs: 12,
  ...extra,
})

const mkCapture = (body: unknown): CapturedResponse => ({ status: 201, body, at: '2026-07-29T12:00:00.000Z' })

/** One event already scoped to the open board. */
const event = (kind: RunEventKind, extra: Partial<RunEvent> = {}): RunEvent => ({
  kind,
  runId: RUN_ID,
  projectId: PROJECT_ID,
  boardId: BOARD_ID,
  ...extra,
})

const started = (node: string, extra: Partial<RunEvent> = {}) =>
  event(RunEventKind.NodeStarted, { node, ...extra })

const finished = (node: string, status: RunStatus, extra: Partial<RunEvent> = {}) =>
  event(RunEventKind.NodeFinished, { node, status, ...extra })

const statusOf = (id: string) => {
  const data = app.nodes.find((n) => n.id === id)?.data
  return data && 'status' in data ? data.status : undefined
}

const noteOf = (id: string) => {
  const data = app.nodes.find((n) => n.id === id)?.data
  return data && 'note' in data ? data.note : undefined
}

const progressOf = (id: string) => {
  const node = app.nodes.find((n) => n.id === id)
  return node?.type === 'for' ? node.data.progress : undefined
}

const apply = (...events: RunEvent[]) => {
  for (const e of events) applyRunEvent(app, e)
}

beforeEach(() => {
  app.project = {
    project: { id: PROJECT_ID, name: 'P', defaults: {} },
    sources: [],
    environments: [],
    credentials: [],
    boards: [],
    collections: [],
  }
  app.boardId = BOARD_ID
  app.nodes = []
  app.edges = []
  app.logs = []
  app.responses = {}
  app.activeRunIds = null
  dialogs.toast = null
})

describe('applyRunEvent', () => {
  it('paints a chain running, then its terminal status, appending one row each', () => {
    app.nodes = [mkNode('a'), mkNode('b')]
    apply(
      event(RunEventKind.RunStarted, { nodes: ['a', 'b'] }),
      started('a'),
      finished('a', 'success', { log: mkLog('a') }),
      started('b'),
    )
    expect(statusOf('a')).toBe('success')
    expect(statusOf('b')).toBe('running')

    apply(finished('b', 'failed', { note: '422 Unprocessable Entity', log: mkLog('b', { status: 422 }) }))
    expect(statusOf('b')).toBe('failed')
    expect(noteOf('b')).toBe('422 Unprocessable Entity')
    expect(app.logs.map((l) => l.nodeId)).toEqual(['a', 'b'])
  })

  it('run.started replaces the pre-flight set with the engine authoritative one', () => {
    app.nodes = [mkNode('a'), mkNode('b')]
    app.activeRunIds = new Set(['a', 'b', 'stale'])
    apply(event(RunEventKind.RunStarted, { nodes: ['a'] }))
    expect(app.activeRunIds).toEqual(new Set(['a']))
  })

  it('a skip carries a status and no log row', () => {
    app.nodes = [mkNode('a')]
    apply(finished('a', 'skipped'))
    expect(statusOf('a')).toBe('skipped')
    expect(app.logs).toEqual([])
  })

  it('loop progress lands on the For header and its own finish clears it', () => {
    app.nodes = [mkFor('loop')]
    apply(event(RunEventKind.LoopProgress, { node: 'loop', progress: { done: 1, total: 2 } }))
    expect(progressOf('loop')).toEqual({ done: 1, total: 2 })

    apply(finished('loop', 'success', { log: mkLog('loop') }))
    expect(progressOf('loop')).toBeUndefined()
  })

  it('keeps iteration-tagged rows apart and preserves iteration 0', () => {
    app.nodes = [mkNode('child')]
    apply(
      finished('child', 'success', {
        iteration: 0,
        log: mkLog('child', { id: `${RUN_ID}-child-0`, iteration: 0 }),
      }),
      finished('child', 'success', {
        iteration: 1,
        log: mkLog('child', { id: `${RUN_ID}-child-1`, iteration: 1 }),
      }),
    )
    expect(app.logs.map((l) => l.id)).toEqual([`${RUN_ID}-child-0`, `${RUN_ID}-child-1`])
    // 0 is a real iteration, not an absent one — the #1 chip depends on it.
    expect(app.logs.map((l) => l.iteration)).toEqual([0, 1])
  })

  it('merges a capture, and a failure leaves the previous capture in place', () => {
    app.nodes = [mkNode('a')]
    apply(finished('a', 'success', { log: mkLog('a'), capture: mkCapture({ id: 'u1' }) }))
    expect(app.responses.a?.body).toEqual({ id: 'u1' })

    apply(finished('a', 'failed', { note: 'boom', log: mkLog('a', { status: 500 }) }))
    expect(app.responses.a?.body).toEqual({ id: 'u1' })
  })

  it('toasts a run-level failure', () => {
    apply(event(RunEventKind.RunFinished, { error: 'the engine failed unexpectedly' }))
    expect(dialogs.toast).toBe(`${RUN_FAILED_MESSAGE}: the engine failed unexpectedly`)
  })

  it('a cancelled run.finished is not an error', () => {
    apply(event(RunEventKind.RunFinished, { cancelled: true }))
    expect(dialogs.toast).toBeNull()
  })
})

describe('run scoping (plan 11 D17)', () => {
  // Node ids are board-scoped by design, so a shared board imported twice —
  // or any two projects seeded from seed/default.json — carries the same ids.
  // An id match therefore proves nothing, and only the (project, board) pair
  // can keep one board's run off another board's canvas.
  const collidingId = 'create-user'

  beforeEach(() => {
    app.nodes = [mkNode(collidingId, 'stale')]
  })

  it('drops every event from another board, even for an id that exists here', () => {
    apply(
      { ...event(RunEventKind.RunStarted, { nodes: [collidingId] }), boardId: 'board-2' },
      { ...started(collidingId), boardId: 'board-2' },
      {
        ...finished(collidingId, 'success', { log: mkLog(collidingId), capture: mkCapture({ token: 'secret' }) }),
        boardId: 'board-2',
      },
    )
    expect(statusOf(collidingId)).toBe('stale')
    expect(app.logs).toEqual([])
    expect(app.responses).toEqual({})
    expect(app.activeRunIds).toBeNull()
  })

  it('drops every event from another project on the same board id', () => {
    apply({
      ...finished(collidingId, 'success', { log: mkLog(collidingId), capture: mkCapture({ token: 'secret' }) }),
      projectId: 'proj-2',
    })
    expect(statusOf(collidingId)).toBe('stale')
    expect(app.responses).toEqual({})
  })
})

describe('applyRunResult (plan 11 D12)', () => {
  const result = (statuses: Record<string, RunStatus>, extra: Partial<RunResult> = {}): RunResult => ({
    runId: RUN_ID,
    projectId: PROJECT_ID,
    boardId: BOARD_ID,
    statuses,
    ...extra,
  })

  it('corrects a node whose node.finished never arrived', () => {
    app.nodes = [mkNode('a'), mkNode('b')]
    apply(started('a'), started('b'), finished('a', 'success', { log: mkLog('a') }))
    // b's finish was lost by the bus: it is still spinning with the run over.
    expect(statusOf('b')).toBe('running')

    applyRunResult(app, result({ a: 'success', b: 'failed' }, { notes: { b: 'connection refused' } }))
    expect(statusOf('b')).toBe('failed')
    expect(noteOf('b')).toBe('connection refused')
    // The node the events did get right is left alone.
    expect(statusOf('a')).toBe('success')
  })

  it('names only the nodes the run touched, leaving the rest of the board alone', () => {
    app.nodes = [mkNode('a', 'stale'), mkNode('outside', 'stale')]
    applyRunResult(app, result({ a: 'success' }))
    expect(statusOf('a')).toBe('success')
    expect(statusOf('outside')).toBe('stale')
  })

  it('is dropped whole when it belongs to another board', () => {
    app.nodes = [mkNode('a', 'stale')]
    applyRunResult(app, { ...result({ a: 'success' }), boardId: 'board-2' })
    expect(statusOf('a')).toBe('stale')
  })
})
