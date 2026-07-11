import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { dialogs } from './dialogs.svelte'
import type { AppNode, BoardJSON, EnvelopePayload } from './model'
import {
  copyBoardJson,
  copyNodes,
  exportBoardToFile,
  importBoardFromFile,
  pasteFromClipboard,
  selectionForCopy,
} from './shareActions'
import { app } from './state.svelte'

const mkNode = (id: string, selected = false): AppNode => ({
  id,
  type: 'http',
  position: { x: 0, y: 0 },
  selected,
  data: {
    name: id,
    key: id,
    method: 'GET',
    path: `/v1/${id}`,
    environment: '',
    credential: '',
    status: 'idle',
    repeat: 1,
    fields: [],
  },
})

describe('selectionForCopy (plan 07 E2)', () => {
  it('returns the multi-selection when there is no anchor', () => {
    expect(selectionForCopy([mkNode('a', true), mkNode('b'), mkNode('c', true)])).toEqual(['a', 'c'])
  })

  it('returns the whole selection when the anchor is part of it', () => {
    expect(selectionForCopy([mkNode('a', true), mkNode('b', true)], 'a')).toEqual(['a', 'b'])
  })

  it('returns only the anchor when it sits outside the selection', () => {
    expect(selectionForCopy([mkNode('a', true), mkNode('b')], 'b')).toEqual(['b'])
  })

  it('is empty with no selection and no anchor', () => {
    expect(selectionForCopy([mkNode('a'), mkNode('b')])).toEqual([])
  })
})

describe('copy/export flows (plan 07 E2)', () => {
  beforeEach(() => {
    app.project = {
      project: { id: 'p1', name: 'Proj', defaults: {} },
      sources: [],
      environments: [],
      credentials: [],
      boards: [],
      collections: [],
    }
    app.boardId = 'b1'
    app.boardName = 'Main'
    app.nodes = [mkNode('n1', true), mkNode('n2')]
    app.edges = [{ id: 'e1', source: 'n1', target: 'n2' }]
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('copyNodes sends the live board and the requested node ids', async () => {
    const spy = vi.spyOn(api, 'copySelection').mockResolvedValue()
    expect(await copyNodes(app, ['n1'])).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
    const [projectId, board, nodeIds] = spy.mock.calls[0] as [string, BoardJSON, string[]]
    expect(projectId).toBe('p1')
    expect(nodeIds).toEqual(['n1'])
    // The full live board travels — the exporter does the selection filtering.
    expect(board.nodes.map((n) => n.id)).toEqual(['n1', 'n2'])
    expect(board.edges).toEqual([{ id: 'e1', from: 'n1', to: 'n2' }])
  })

  it('copyNodes is a no-op without nodes or an open board', async () => {
    const spy = vi.spyOn(api, 'copySelection').mockResolvedValue()
    expect(await copyNodes(app, [])).toBe(false)
    app.boardId = null
    expect(await copyNodes(app, ['n1'])).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('copyNodes reports failure instead of throwing', async () => {
    vi.spyOn(api, 'copySelection').mockRejectedValue(new Error('no clipboard'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await copyNodes(app, ['n1'])).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('copyBoardJson copies the stored board by id', async () => {
    const spy = vi.spyOn(api, 'copyBoardJSON').mockResolvedValue()
    expect(await copyBoardJson(app)).toBe(true)
    expect(spy).toHaveBeenCalledWith('p1', 'b1')
  })

  it('exportBoardToFile resolves the chosen path and maps cancel to null', async () => {
    const spy = vi.spyOn(api, 'exportBoardToFile').mockResolvedValue('/tmp/proj-main.cascade.json')
    expect(await exportBoardToFile(app)).toBe('/tmp/proj-main.cascade.json')
    expect(spy).toHaveBeenCalledWith('p1', 'b1')
    spy.mockResolvedValue('') // dialog cancelled
    expect(await exportBoardToFile(app)).toBeNull()
  })
})

const envelopeBoard = (): BoardJSON => ({
  formatVersion: 1,
  id: '',
  name: '',
  nodes: [
    { id: 'x1', type: 'http', name: 'X1', data: { key: 'x1', method: 'GET', path: '/a', fields: [] } },
    { id: 'x2', type: 'http', name: 'X2', data: { key: 'x2', method: 'GET', path: '/b', fields: [] } },
  ],
  edges: [{ id: 'e1', from: 'x1', to: 'x2' }],
  layout: { positions: { x1: { x: 0, y: 0 }, x2: { x: 100, y: 0 } } },
})

const payload = (): EnvelopePayload => ({
  kind: 'selection',
  formatVersion: 1,
  app: 'cascade/test',
  board: envelopeBoard(),
  requires: { environments: [], credentials: [], sources: [] },
})

describe('paste/import flows (plan 07 E3)', () => {
  beforeEach(() => {
    app.project = {
      project: { id: 'p1', name: 'Proj', defaults: {} },
      sources: [],
      environments: [],
      credentials: [],
      boards: [],
      collections: [],
    }
    app.boardId = 'b1'
    app.boardName = 'Main'
    app.nodes = [mkNode('n1', true)]
    app.edges = []
  })

  afterEach(() => {
    dialogs.notice = null
    vi.restoreAllMocks()
  })

  it('pastes an envelope as a fresh, group-selected subgraph', async () => {
    vi.spyOn(api, 'readClipboardEnvelope').mockResolvedValue({ found: true, payload: payload() })
    expect(await pasteFromClipboard(app, { x: 50, y: 50 })).toBe(true)
    expect(app.nodes).toHaveLength(3)
    // The previous selection moves to the pasted group.
    expect(app.nodes[0].selected).toBe(false)
    expect(app.nodes.slice(1).every((n) => n.selected)).toBe(true)
    expect(app.edges).toHaveLength(1)
    expect(app.selectedNodeId).toBeNull() // group paste keeps the inspector closed
  })

  it('silently ignores a clipboard without an envelope', async () => {
    vi.spyOn(api, 'readClipboardEnvelope').mockResolvedValue({ found: false })
    expect(await pasteFromClipboard(app, { x: 0, y: 0 })).toBe(false)
    expect(app.nodes).toHaveLength(1)
    expect(dialogs.notice).toBeNull()
  })

  it('surfaces malformed/newer envelopes as a notice dialog', async () => {
    vi.spyOn(api, 'readClipboardEnvelope').mockRejectedValue(new Error('made with a newer Cascade'))
    expect(await pasteFromClipboard(app, { x: 0, y: 0 })).toBe(false)
    expect(dialogs.notice?.title).toBe('Paste failed')
    expect(dialogs.notice?.message).toContain('newer Cascade')
  })

  it('imports a file as a new board and switches to it', async () => {
    const board: BoardJSON = { ...envelopeBoard(), id: 'nb1', name: 'Signup chain' }
    vi.spyOn(api, 'importBoardFromFile').mockResolvedValue({ cancelled: false, board })
    expect(await importBoardFromFile(app)).toBe(true)
    expect(app.project?.boards.map((b) => b.id)).toContain('nb1')
    expect(app.boardId).toBe('nb1')
    expect(app.boardName).toBe('Signup chain')
    expect(app.nodes).toHaveLength(2)
  })

  it('does nothing when the import dialog is cancelled', async () => {
    vi.spyOn(api, 'importBoardFromFile').mockResolvedValue({
      cancelled: true,
      board: envelopeBoard(),
    })
    expect(await importBoardFromFile(app)).toBe(false)
    expect(app.boardId).toBe('b1')
    expect(app.project?.boards).toHaveLength(0)
  })

  it('surfaces import failures as a notice dialog', async () => {
    vi.spyOn(api, 'importBoardFromFile').mockRejectedValue(new Error('not a cascade envelope'))
    expect(await importBoardFromFile(app)).toBe(false)
    expect(dialogs.notice?.title).toBe('Import failed')
  })
})
