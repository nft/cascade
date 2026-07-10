import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import type { AppNode, BoardJSON } from './model'
import { copyBoardJson, copyNodes, exportBoardToFile, selectionForCopy } from './shareActions'
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
