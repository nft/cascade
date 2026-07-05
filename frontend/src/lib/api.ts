// Backend access layer (plan 01): the Wails-bound Go store when running
// inside the app, an in-memory fallback seeded from mock.ts otherwise
// (vitest, plain-browser `bun run dev`).
import * as GoApp from '../../wailsjs/go/main/App'
import type { store as goStore } from '../../wailsjs/go/models'
import { createInMemoryApi } from './inMemoryApi'
import type { BoardJSON, ProjectBundle, ProjectInfo } from './model'

export interface CascadeApi {
  listProjects(): Promise<ProjectInfo[]>
  createProject(name: string): Promise<ProjectInfo>
  renameProject(id: string, name: string): Promise<ProjectInfo>
  deleteProject(id: string): Promise<void>
  openProject(id: string): Promise<ProjectBundle>
  saveBoard(projectId: string, board: BoardJSON): Promise<void>
}

// The generated bindings type results as wailsjs model classes; they are the
// same JSON shapes as our interfaces (modulo string unions), so casts are safe.
const wailsApi: CascadeApi = {
  listProjects: () => GoApp.ListProjects(),
  createProject: (name) => GoApp.CreateProject(name),
  renameProject: (id, name) => GoApp.RenameProject(id, name),
  deleteProject: (id) => GoApp.DeleteProject(id),
  openProject: (id) => GoApp.OpenProject(id) as unknown as Promise<ProjectBundle>,
  saveBoard: (projectId, board) => GoApp.SaveBoard(projectId, board as unknown as goStore.Board),
}

declare global {
  interface Window {
    /** Injected by the Wails runtime before the app bundle loads. */
    go?: unknown
  }
}

export const api: CascadeApi =
  typeof window !== 'undefined' && window.go !== undefined ? wailsApi : createInMemoryApi()
