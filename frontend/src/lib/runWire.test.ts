// The Go side's half of the run wire contract, replayed through the real
// applier.
//
// testdata/run_wire.json is written by runwire_test.go from an actual engine
// run. Every other DTO on this boundary is checked by the Wails binding
// generator; runEvent is not, because it travels through EventsEmit. If a Go
// json tag is renamed, this is the test that notices — the events still
// arrive, they just stop meaning anything.
import { describe, expect, it } from 'vitest'
import wireSource from '../../../testdata/run_wire.json?raw'
import { applyRunEvent, applyRunResult } from './applyRunEvent'
import type { AppNode, NodeStatus } from './model'
import { RunEventKind, type RunEvent, type RunResult } from './runEvents'
import { app } from './state.svelte'

const wire = JSON.parse(wireSource) as { events: RunEvent[]; result: RunResult }

/** The board runwire_test.go's fixture describes, as the canvas holds it. */
const BOARD: { id: string; type: AppNode['type'] }[] = [
  { id: 'create-user', type: 'http' },
  { id: 'loop', type: 'for' },
  { id: 'pause', type: 'delay' },
  { id: 'invite', type: 'http' },
  { id: 'canned', type: 'mock' },
  { id: 'shape', type: 'transform' },
  { id: 'rejected', type: 'http' },
  { id: 'never', type: 'http' },
]

function mkNode({ id, type }: { id: string; type: AppNode['type'] }): AppNode {
  const base = { name: id, key: id, status: 'idle' as NodeStatus }
  switch (type) {
    case 'for':
      return { id, type, position: { x: 0, y: 0 }, data: { ...base, mode: 'count', count: 2 } }
    case 'delay':
      return { id, type, position: { x: 0, y: 0 }, data: { ...base, durationMs: 1 } }
    case 'mock':
      return { id, type, position: { x: 0, y: 0 }, data: { ...base, body: '{}', statusCode: 201 } }
    case 'transform':
      return { id, type, position: { x: 0, y: 0 }, data: { ...base, mode: 'pick', pick: [], script: '' } }
    default:
      return {
        id,
        type: 'http',
        position: { x: 0, y: 0 },
        data: { ...base, method: 'POST', path: '/x', environment: 'local', credential: '', fields: [] },
      }
  }
}

function replay(): void {
  app.project = {
    project: { id: wire.result.projectId, name: 'P', defaults: {} },
    sources: [],
    environments: [],
    credentials: [],
    boards: [],
    collections: [],
  }
  app.boardId = wire.result.boardId
  app.nodes = BOARD.map(mkNode)
  app.edges = []
  app.logs = []
  app.responses = {}
  app.activeRunIds = null
  for (const e of wire.events) applyRunEvent(app, e)
  applyRunResult(app, wire.result)
}

const statusOf = (id: string) => {
  const data = app.nodes.find((n) => n.id === id)?.data
  return data && 'status' in data ? data.status : undefined
}

describe('run wire (shared with runwire_test.go)', () => {
  it('covers every event kind and log variant', () => {
    const kinds = new Set(wire.events.map((e) => e.kind))
    for (const kind of Object.values(RunEventKind)) expect(kinds).toContain(kind)
    const logKinds = new Set(wire.events.flatMap((e) => (e.log ? [e.log.kind] : [])))
    expect(logKinds).toEqual(new Set(['http', 'transform', 'mock', 'delay', 'for']))
  })

  it('replays onto the canvas as the engine reported it', () => {
    replay()
    // Statuses come from node.finished events; the golden's own result map is
    // the independent check that they landed right.
    for (const [id, status] of Object.entries(wire.result.statuses)) {
      expect(statusOf(id), id).toBe(status)
    }
    expect(statusOf('rejected')).toBe('failed')
    expect(statusOf('never')).toBe('skipped')
  })

  it('carries the failure note onto the card', () => {
    replay()
    const data = app.nodes.find((n) => n.id === 'rejected')?.data
    expect(data && 'note' in data ? data.note : undefined).toBe('422 Unprocessable Entity')
  })

  it('appends one row per finished node, tagging loop iterations', () => {
    replay()
    // A skip produces no row: `never` is in the statuses and not in the log.
    expect(app.logs.map((l) => l.nodeId)).toEqual([
      'create-user',
      'pause',
      'invite',
      'pause',
      'invite',
      'loop',
      'canned',
      'shape',
      'rejected',
    ])
    expect(new Set(app.logs.map((l) => l.id)).size).toBe(app.logs.length)
    expect(app.logs.filter((l) => l.nodeId === 'invite').map((l) => l.iteration)).toEqual([0, 1])
  })

  it('reads each log variant through its own discriminated fields', () => {
    replay()
    const row = (nodeId: string) => app.logs.find((l) => l.nodeId === nodeId)!
    const http = row('create-user')
    expect(http.kind === 'http' && http.status).toBe(201)
    expect(http.kind === 'http' && http.url).toBe('http://api.test/v1/users')
    expect(row('loop').kind === 'for' && (row('loop') as { iterations: number }).iterations).toBe(2)
    expect(row('canned').kind === 'mock' && (row('canned') as { status: number }).status).toBe(201)
    expect(row('shape').kind === 'transform').toBe(true)
    expect(row('pause').kind).toBe('delay')
  })

  it('merges captured responses, skipping the nodes that produced none', () => {
    replay()
    expect(app.responses['create-user']?.body).toEqual({ id: 'usr_1', name: 'Ada' })
    expect(app.responses['canned']?.status).toBe(201)
    // A failure keeps no capture, so a failed re-run cannot blank the picker.
    expect(app.responses['rejected']).toBeUndefined()
    expect(app.responses['never']).toBeUndefined()
  })

  it('paints the engine run set, which excludes the note node', () => {
    replay()
    expect(app.activeRunIds).toEqual(new Set(BOARD.map((n) => n.id)))
  })
})
