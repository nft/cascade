// In-memory CascadeApi used when the Wails runtime is absent (vitest,
// plain-browser dev). It mirrors the Go store's behavior: a "Default"
// project seeded from mock.ts, new projects starting with one empty "Main"
// board, and lastOpenedAt stamped on open.
// The Go sandbox's `_` helper source, single-sourced from the engine so the
// browser stand-in and goja agree on helper behavior.
import helpersSource from '../../../core/transform/helpers.js?raw'
import type { CascadeApi } from './api'
import { serializeBoard } from './board'
import { credentials, demoCollection, environments, initialEdges, initialNodes, operations } from './mock'
import type {
  BoardJSON,
  EnvelopePayload,
  ProjectBundle,
  ProjectInfo,
  ScriptRunRequest,
  SourceDef,
  TestRequest,
  TestResponse,
} from './model'
import { joinUrl } from './request'

const DEFAULT_PROJECT_NAME = 'Default'
const MAIN_BOARD_NAME = 'Main'

interface StoredProject {
  info: ProjectInfo
  bundle: ProjectBundle
}

let idCounter = 0
// Random so ids are visibly not name-derived; the counter keeps them unique
// even if Math.random collides.
function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${idCounter}`
}

export function createInMemoryApi(): CascadeApi {
  const projects = new Map<string, StoredProject>()

  function makeProject(name: string, seeded: boolean): StoredProject {
    const id = newId('proj')
    const board = seeded
      ? serializeBoard(newId('board'), MAIN_BOARD_NAME, initialNodes, initialEdges)
      : serializeBoard(newId('board'), MAIN_BOARD_NAME, [], [])
    const demoSource: SourceDef = { id: newId('src'), title: 'demo-api', version: 'v1.4.0', operations }
    const bundle: ProjectBundle = {
      project: {
        id,
        name,
        defaults: seeded ? { environment: 'staging', credential: 'staging-admin' } : {},
      },
      sources: seeded ? [demoSource] : [],
      environments: seeded ? environments : [],
      credentials: seeded ? credentials : [],
      boards: [board],
      collections: seeded ? [demoCollection] : [],
    }
    const stored: StoredProject = { info: { id, name }, bundle: structuredClone(bundle) }
    projects.set(id, stored)
    return stored
  }

  function get(id: string): StoredProject {
    const stored = projects.get(id)
    if (!stored) throw new Error(`project ${id} not found`)
    return stored
  }

  makeProject(DEFAULT_PROJECT_NAME, true)

  return {
    async listProjects() {
      return [...projects.values()].map((p) => ({ ...p.info }))
    },
    async createProject(name) {
      return { ...makeProject(name, false).info }
    },
    async renameProject(id, name) {
      const stored = get(id)
      stored.info.name = name
      stored.bundle.project.name = name
      return { ...stored.info }
    },
    async deleteProject(id) {
      get(id)
      projects.delete(id)
    },
    async openProject(id) {
      const stored = get(id)
      stored.info.lastOpenedAt = new Date().toISOString()
      return structuredClone(stored.bundle)
    },
    async saveBoard(projectId, board) {
      const stored = get(projectId)
      const copy = structuredClone(board)
      const index = stored.bundle.boards.findIndex((b) => b.id === board.id)
      if (index >= 0) stored.bundle.boards[index] = copy
      else stored.bundle.boards.push(copy)
    },
    async saveCollection(projectId, collection) {
      const stored = get(projectId)
      const copy = structuredClone(collection)
      const index = stored.bundle.collections.findIndex((c) => c.id === collection.id)
      if (index >= 0) stored.bundle.collections[index] = copy
      else stored.bundle.collections.push(copy)
    },
    async deleteCollection(projectId, id) {
      const stored = get(projectId)
      stored.bundle.collections = stored.bundle.collections.filter((c) => c.id !== id)
    },
    async saveCredentials(projectId, credentials) {
      const stored = get(projectId)
      stored.bundle.credentials = structuredClone(credentials)
    },
    async deleteCredential(projectId, name) {
      const stored = get(projectId)
      stored.bundle.credentials = stored.bundle.credentials.filter((c) => c.name !== name)
    },
    // Values are write-only and never surface anywhere, so the browser
    // stand-in simply discards them.
    async setCredentialSecret() {},
    async exportBoardToFile(projectId, boardId) {
      const stored = get(projectId)
      const board = stored.bundle.boards.find((b) => b.id === boardId)
      if (!board) throw new Error(`board ${boardId} not found`)
      return downloadInBrowser(
        `${stored.info.name}-${board.name}.cascade.json`,
        devEnvelope('board', board),
      )
    },
    async copyBoardJSON(projectId, boardId) {
      const stored = get(projectId)
      const board = stored.bundle.boards.find((b) => b.id === boardId)
      if (!board) throw new Error(`board ${boardId} not found`)
      await navigator.clipboard?.writeText(devEnvelope('board', board))
    },
    async copySelection(_projectId, board, nodeIds) {
      await navigator.clipboard?.writeText(devEnvelope('selection', board, nodeIds))
    },
    async readClipboardEnvelope() {
      const text = (await navigator.clipboard?.readText?.()) ?? ''
      const payload = parseDevEnvelope(text)
      return payload ? { found: true, payload } : { found: false }
    },
    async importBoardFromFile(projectId) {
      const stored = get(projectId)
      const text = await pickFileText()
      if (text === null) return { cancelled: true, board: serializeBoard('', '', [], []) }
      const payload = parseDevEnvelope(text)
      if (!payload) throw new Error('not a cascade envelope')
      const board: BoardJSON = {
        ...payload.board,
        id: newId('board'),
        name: dedupBoardName(payload.board.name || 'Imported board', stored.bundle.boards),
      }
      stored.bundle.boards.push(structuredClone(board))
      return { cancelled: false, board }
    },
    async runTransformScript(req) {
      return runScriptInBrowser(req)
    },
    // Canned on purpose (plan 08 B5): no project state is involved, so tests
    // that assemble app state by hand can send without registering a project.
    async sendTestRequest(_projectId, request) {
      return cannedTestResponse(request)
    },
  }
}

/**
 * Dev/vitest stand-in for the SendTestRequest binding (plan 08 B5): echoes
 * the resolved request shape as a JSON success so the Test tab's send → view
 * → parse-to-schema flow is exercisable without the Go side. Mirrors the
 * redaction rule: a named credential never surfaces a value.
 */
function cannedTestResponse(request: TestRequest): TestResponse {
  let path = request.path
  for (const [name, value] of Object.entries(request.pathParams ?? {})) {
    path = path.replaceAll(`{${name}}`, value)
  }
  const url = joinUrl(request.origin ?? request.envBase ?? '', path)
  const body = {
    ok: true,
    method: request.method,
    url,
    ...(request.body !== undefined ? { echo: request.body } : {}),
  }
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body,
    bodyText: JSON.stringify(body),
    durationMs: 12,
    url,
    sentHeaders: {
      ...request.headers,
      ...(request.credential ? { Authorization: '•••' } : {}),
    },
  }
}

const DEV_ENVELOPE_FORMAT_VERSION = 1
const DEV_PRODUCER = 'cascade/dev'

/**
 * Dev/vitest stand-in for the share package's exporter: same envelope shape
 * so paste flows are exercisable in the browser, but without the authoritative
 * rules (dangling-binding rewrite, run-state sanitization, requires kinds,
 * collection embedding) — those live in share/ and apply inside Wails.
 */
function devEnvelope(kind: 'board' | 'selection', board: BoardJSON, nodeIds?: string[]): string {
  let { nodes, edges } = board
  let positions = board.layout?.positions ?? {}
  if (nodeIds) {
    const keep = new Set(nodeIds)
    nodes = nodes.filter((n) => keep.has(n.id))
    edges = edges.filter((e) => keep.has(e.from) && keep.has(e.to))
    positions = Object.fromEntries(Object.entries(positions).filter(([id]) => keep.has(id)))
  }
  const named = (key: 'environment' | 'credential') =>
    [...new Set(nodes.map((n) => n.data?.[key]).filter((v): v is string => typeof v === 'string' && v !== ''))].sort()
  const envelope = {
    cascade: {
      kind,
      formatVersion: DEV_ENVELOPE_FORMAT_VERSION,
      app: DEV_PRODUCER,
      board: {
        formatVersion: board.formatVersion,
        // A selection has no identity of its own (share/export.go).
        id: kind === 'board' ? board.id : '',
        name: kind === 'board' ? board.name : '',
        nodes,
        edges,
        layout: { positions },
      },
      requires: {
        environments: named('environment'),
        credentials: named('credential').map((name) => ({ name })),
        sources: [],
      },
    },
  }
  return `${JSON.stringify(envelope, null, 2)}\n`
}

/**
 * Dev stand-in for share.Parse: the same gates (no envelope at all → null;
 * malformed or newer-version envelope → throw) so paste flows behave like
 * the Go side in the browser.
 */
function parseDevEnvelope(text: string): EnvelopePayload | null {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    return null
  }
  if (!root || typeof root !== 'object' || !('cascade' in root)) return null
  const payload = (root as { cascade: unknown }).cascade as EnvelopePayload
  if (!payload || typeof payload !== 'object' || !payload.board) {
    throw new Error('malformed cascade envelope')
  }
  if (payload.formatVersion > DEV_ENVELOPE_FORMAT_VERSION) {
    throw new Error(
      `this was made with a newer Cascade (format version ${payload.formatVersion}, this app supports up to ${DEV_ENVELOPE_FORMAT_VERSION}) — update to import it`,
    )
  }
  return payload
}

function dedupBoardName(name: string, boards: BoardJSON[]): string {
  const taken = new Set(boards.map((b) => b.name))
  if (!taken.has(name)) return name
  for (let n = 2; ; n++) if (!taken.has(`${name} ${n}`)) return `${name} ${n}`
}

/** Browser stand-in for the open-file dialog; resolves null when dismissed. */
function pickFileText(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      void file.text().then(resolve)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Browser stand-in for the Wails save dialog: a plain download; returns the filename. */
function downloadInBrowser(filename: string, content: string): string {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
  return filename
}

/**
 * Dev-only stand-in for the Go goja sandbox: same inputs (res, nodes, i, _)
 * and the same helpers source, but no interrupt or output cap — the real
 * enforcement lives in core/transform and applies whenever the app runs
 * inside Wails.
 */
function runScriptInBrowser({ script, nodes, res, index }: ScriptRunRequest): unknown {
  const run = new Function(
    'nodes',
    'res',
    'i',
    `${helpersSource}\nreturn (function(){${script}\n})()`,
  )
  const result: unknown = run(nodes, res, index)
  if (result === undefined) throw new Error('transform: script returned no value — end it with `return …`')
  const raw = JSON.stringify(result)
  if (raw === undefined) throw new Error('transform: script must return a JSON-serializable value')
  // Round-trip like the engine so downstream sees plain JSON shapes.
  return JSON.parse(raw)
}
