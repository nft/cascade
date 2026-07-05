// In-memory CascadeApi used when the Wails runtime is absent (vitest,
// plain-browser dev). It mirrors the Go store's behavior: a "Default"
// project seeded from mock.ts, new projects starting with one empty "Main"
// board, and lastOpenedAt stamped on open.
import type { CascadeApi } from './api'
import { serializeBoard } from './board'
import { credentials, environments, initialEdges, initialNodes, operations } from './mock'
import type { ProjectBundle, ProjectInfo, SourceDef } from './model'

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
  }
}
