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
import type { ProjectBundle, ProjectInfo, ScriptRunRequest, SourceDef, TestRequest, TestResponse } from './model'
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
