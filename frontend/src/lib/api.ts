// Backend access layer (plan 01): the Wails-bound Go store when running
// inside the app, an in-memory fallback seeded from mock.ts otherwise
// (vitest, plain-browser `bun run dev`).
import * as GoApp from '../../wailsjs/go/main/App'
import type { main as goMain, store as goStore } from '../../wailsjs/go/models'
import { createInMemoryApi } from './inMemoryApi'
import type {
  BoardJSON,
  CollectionDef,
  CredentialDef,
  ProjectBundle,
  ProjectInfo,
  ScriptRunRequest,
  TestRequest,
  TestResponse,
} from './model'

export interface CascadeApi {
  listProjects(): Promise<ProjectInfo[]>
  createProject(name: string): Promise<ProjectInfo>
  renameProject(id: string, name: string): Promise<ProjectInfo>
  deleteProject(id: string): Promise<void>
  openProject(id: string): Promise<ProjectBundle>
  saveBoard(projectId: string, board: BoardJSON): Promise<void>
  saveCollection(projectId: string, collection: CollectionDef): Promise<void>
  deleteCollection(projectId: string, id: string): Promise<void>
  /** Replaces the credential metadata list (plan 04 K2) — never carries values. */
  saveCredentials(projectId: string, credentials: CredentialDef[]): Promise<void>
  /** Removes one credential's metadata and its stored secret. */
  deleteCredential(projectId: string, name: string): Promise<void>
  /** Stores or rotates a secret value; write-only — nothing reads it back. */
  setCredentialSecret(projectId: string, name: string, value: string): Promise<void>
  /** Board export via save dialog (plan 07 E2); resolves with the chosen path, '' when cancelled. */
  exportBoardToFile(projectId: string, boardId: string): Promise<string>
  /** Puts the whole saved board's envelope on the system clipboard. */
  copyBoardJSON(projectId: string, boardId: string): Promise<void>
  /** Puts a selection envelope (nodes + edges between them) on the system clipboard. */
  copySelection(projectId: string, board: BoardJSON, nodeIds: string[]): Promise<void>
  /** Runs one transform script in the Go goja sandbox; resolves with the result body. */
  runTransformScript(req: ScriptRunRequest): Promise<unknown>
  /** One-off request execution for the Test tab (plan 08 B4) — no board, no run. */
  sendTestRequest(projectId: string, request: TestRequest): Promise<TestResponse>
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
  saveCollection: (projectId, collection) =>
    GoApp.SaveCollection(projectId, collection as unknown as goStore.Collection),
  deleteCollection: (projectId, id) => GoApp.DeleteCollection(projectId, id),
  saveCredentials: (projectId, credentials) =>
    GoApp.SaveCredentials(projectId, credentials as unknown as goStore.Credential[]),
  deleteCredential: (projectId, name) => GoApp.DeleteCredential(projectId, name),
  setCredentialSecret: (projectId, name, value) => GoApp.SetCredentialSecret(projectId, name, value),
  exportBoardToFile: (projectId, boardId) => GoApp.ExportBoardToFile(projectId, boardId),
  copyBoardJSON: (projectId, boardId) => GoApp.CopyBoardJSON(projectId, boardId),
  copySelection: (projectId, board, nodeIds) =>
    GoApp.CopySelection(projectId, board as unknown as goStore.Board, nodeIds),
  runTransformScript: (req) => GoApp.RunTransformScript(req as unknown as goMain.ScriptRunRequest),
  sendTestRequest: (projectId, request) =>
    GoApp.SendTestRequest(projectId, request as unknown as goMain.TestRequest) as unknown as Promise<TestResponse>,
}

declare global {
  interface Window {
    /** Injected by the Wails runtime before the app bundle loads. */
    go?: unknown
  }
}

export const api: CascadeApi =
  typeof window !== 'undefined' && window.go !== undefined ? wailsApi : createInMemoryApi()
