// Copy/export flows (plan 07 E2). The envelope itself is built on the Go
// side (share/); this module only decides what to send and reports success,
// so callers can render feedback. Failures follow the board-save policy:
// logged, never taking down the canvas.
import { api } from './api'
import { serializeBoard } from './board'
import { dialogs } from './dialogs.svelte'
import type { AppNode, ClipboardEnvelope } from './model'
import { buildPaste } from './paste'
import type { AppState } from './state.svelte'

/**
 * The node set a copy gesture targets: the canvas multi-selection when the
 * anchor node is part of it (or there is no anchor), otherwise just the
 * anchor — right-clicking outside the selection acts on the clicked node only.
 */
export function selectionForCopy(nodes: readonly AppNode[], anchorId?: string): string[] {
  const selected = nodes.filter((n) => n.selected).map((n) => n.id)
  if (anchorId !== undefined && !selected.includes(anchorId)) return [anchorId]
  return selected
}

/** Copy the given nodes (and the edges between them) as a selection envelope. */
export async function copyNodes(app: AppState, nodeIds: string[]): Promise<boolean> {
  const projectId = app.projectId
  if (projectId === null || app.boardId === null || nodeIds.length === 0) return false
  // The live canvas is the source of truth here — no save flush needed; the
  // exporter drops viewport and responses, so neither is sent.
  const board = serializeBoard(app.boardId, app.boardName, app.nodes, app.edges)
  try {
    await api.copySelection(projectId, board, nodeIds)
    return true
  } catch (err) {
    console.error('copy selection failed:', err)
    return false
  }
}

/** Copy the whole current board as a board envelope. */
export async function copyBoardJson(app: AppState): Promise<boolean> {
  const projectId = app.projectId
  if (projectId === null || app.boardId === null) return false
  await app.flushBoardSave() // the envelope is built from the stored board
  try {
    await api.copyBoardJSON(projectId, app.boardId)
    return true
  } catch (err) {
    console.error('copy board failed:', err)
    return false
  }
}

/** Export the current board to a file. Returns the path, or null when cancelled/failed. */
export async function exportBoardToFile(app: AppState): Promise<string | null> {
  const projectId = app.projectId
  if (projectId === null || app.boardId === null) return null
  await app.flushBoardSave()
  try {
    const path = await api.exportBoardToFile(projectId, app.boardId)
    return path === '' ? null : path
  } catch (err) {
    console.error('board export failed:', err)
    return null
  }
}

// --- import side (plan 07 E3) ------------------------------------------------

/** Paste target when the canvas cannot provide one. */
const FALLBACK_PASTE_POSITION = { x: 240, y: 240 }

const PASTE_FAILED_TITLE = 'Paste failed'
const IMPORT_FAILED_TITLE = 'Import failed'

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * Pastes the clipboard envelope onto the canvas as a fresh, group-selected
 * subgraph (paste.ts does the id/key/binding work). A clipboard that holds
 * no envelope at all is silently ignored; one that IS an envelope but
 * malformed or from a newer Cascade gets a notice dialog.
 */
export async function pasteFromClipboard(
  app: AppState,
  target?: { x: number; y: number },
): Promise<boolean> {
  if (app.boardId === null) return false
  let probe: ClipboardEnvelope
  try {
    probe = await api.readClipboardEnvelope()
  } catch (err) {
    dialogs.notice = { title: PASTE_FAILED_TITLE, message: errorMessage(err) }
    return false
  }
  if (!probe.found || !probe.payload) return false
  const at = target ?? app.pasteTarget?.() ?? FALLBACK_PASTE_POSITION
  const pasted = buildPaste(probe.payload.board, app.nodes, at)
  if (pasted.nodes.length === 0) return false
  app.nodes = [...app.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...pasted.nodes]
  app.edges = [...app.edges, ...pasted.edges]
  // The inspector is single-node; a group paste keeps it closed.
  app.selectedNodeId = pasted.nodes.length === 1 ? pasted.nodes[0].id : null
  app.scheduleBoardSave()
  return true
}

/** Imports an envelope file as a new board of the project and switches to it. */
export async function importBoardFromFile(app: AppState): Promise<boolean> {
  const projectId = app.projectId
  if (projectId === null || app.project === null) return false
  try {
    const result = await api.importBoardFromFile(projectId)
    if (result.cancelled) return false
    await app.flushBoardSave() // the current board's pending edits, before switching away
    app.project.boards = [...app.project.boards, result.board]
    app.openBoard(result.board)
    return true
  } catch (err) {
    dialogs.notice = { title: IMPORT_FAILED_TITLE, message: errorMessage(err) }
    return false
  }
}
