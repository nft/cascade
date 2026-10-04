// Backend access layer: the Wails-bound Go store when running
// inside the app, an in-memory fallback seeded from mock.ts otherwise
// (vitest, plain-browser `bun run dev`).
import * as GoApp from '../../wailsjs/go/main/App'
import type { main as goMain, store as goStore } from '../../wailsjs/go/models'
import { createInMemoryApi, createInMemoryRunApi } from './inMemoryApi'
import { createInMemoryUpdateApi } from './inMemoryUpdates'
import type {
  BoardJSON,
  ClipboardEnvelope,
  CollectionDef,
  CredentialDef,
  EnvironmentDef,
  ImportBoardResult,
  ProjectBundle,
  ProjectDefaults,
  ProjectInfo,
  ScriptRunRequest,
  TestRequest,
  TestResponse,
} from './model'
import { subscribeRunEvents, type RunEvent, type RunRequest, type RunResult } from './runEvents'
import {
  subscribeUpdateProgress,
  type AppInfo,
  type UpdateCheck,
  type UpdatePlan,
  type UpdateProgress,
} from './updates'

export interface CascadeApi {
  listProjects(): Promise<ProjectInfo[]>
  createProject(name: string): Promise<ProjectInfo>
  renameProject(id: string, name: string): Promise<ProjectInfo>
  deleteProject(id: string): Promise<void>
  openProject(id: string): Promise<ProjectBundle>
  saveBoard(projectId: string, board: BoardJSON): Promise<void>
  saveCollection(projectId: string, collection: CollectionDef): Promise<void>
  deleteCollection(projectId: string, id: string): Promise<void>
  /** Replaces the environment list; first used by import placeholder creation. */
  saveEnvironments(projectId: string, environments: EnvironmentDef[]): Promise<void>
  /** Replaces the environment/credential a newly added node is born with. */
  setProjectDefaults(projectId: string, defaults: ProjectDefaults): Promise<void>

  /** Gates writing response bodies into this project's board files. */
  setCaptureResponses(projectId: string, capture: boolean): Promise<void>
  /** Replaces the credential metadata list — never carries values. */
  saveCredentials(projectId: string, credentials: CredentialDef[]): Promise<void>
  /** Removes one credential's metadata and its stored secret. */
  deleteCredential(projectId: string, name: string): Promise<void>
  /** Stores or rotates a secret value; write-only — nothing reads it back. */
  setCredentialSecret(projectId: string, name: string, value: string): Promise<void>
  /** Board export via save dialog; resolves with the chosen path, '' when cancelled. */
  exportBoardToFile(projectId: string, boardId: string): Promise<string>
  /** Puts the whole saved board's envelope on the system clipboard. */
  copyBoardJSON(projectId: string, boardId: string): Promise<void>
  /** Puts a selection envelope (nodes + edges between them) on the system clipboard. */
  copySelection(projectId: string, board: BoardJSON, nodeIds: string[]): Promise<void>
  /** Probes the clipboard for a Cascade envelope; non-envelopes report found=false. */
  readClipboardEnvelope(): Promise<ClipboardEnvelope>
  /** Imports an envelope file as a new board of the project (never a silent merge). */
  importBoardFromFile(projectId: string): Promise<ImportBoardResult>
  /** Runs one transform script in the Go goja sandbox; resolves with the result body. */
  runTransformScript(req: ScriptRunRequest): Promise<unknown>
  /** One-off request execution for the Test tab — no board, no run. */
  sendTestRequest(projectId: string, request: TestRequest): Promise<TestResponse>
  /** Executes the board, streaming events until it finishes; resolves with the terminal statuses. */
  runBoard(projectId: string, request: RunRequest): Promise<RunResult>
  /** Cancels the identified run; an unknown or already-finished id is a no-op. */
  stopRun(runId: string): Promise<void>
  /** Subscribes to the run event stream; returns the unsubscribe. */
  onRunEvent(handler: (event: RunEvent) => void): () => void

  /** The running build's version, platform and links. */
  appInfo(): Promise<AppInfo>
  /** Asks GitHub for the newest release; no release yet counts as up to date. */
  checkForUpdate(): Promise<UpdateCheck>
  /** Downloads and verifies the release the last check found; progress streams via onUpdateProgress. */
  downloadUpdate(tag: string): Promise<void>
  /** Stops a download in flight; nothing in flight is a no-op. */
  cancelUpdateDownload(): Promise<void>
  /** Applies the verified package and quits; the plan says whether Cascade relaunches by itself. */
  installUpdate(): Promise<UpdatePlan>
  /** Opens one of Cascade's own pages in the system browser. */
  openExternal(url: string): Promise<void>
  /** Subscribes to download progress; returns the unsubscribe. */
  onUpdateProgress(handler: (progress: UpdateProgress) => void): () => void
}

/** The run stream, split out so it can be selected independently of the store. */
export type RunApi = Pick<CascadeApi, 'runBoard' | 'stopRun' | 'onRunEvent'>

/** The update flow, which has its own browser stand-in. */
export type UpdateApi = Pick<
  CascadeApi,
  | 'appInfo'
  | 'checkForUpdate'
  | 'downloadUpdate'
  | 'cancelUpdateDownload'
  | 'installUpdate'
  | 'openExternal'
  | 'onUpdateProgress'
>

/** Everything but the run stream and the update flow. */
export type StoreApi = Omit<CascadeApi, keyof RunApi | keyof UpdateApi>

// The generated bindings type results as wailsjs model classes; they are the
// same JSON shapes as our interfaces (modulo string unions), so casts are safe.
const wailsApi: StoreApi = {
  listProjects: () => GoApp.ListProjects(),
  createProject: (name) => GoApp.CreateProject(name),
  renameProject: (id, name) => GoApp.RenameProject(id, name),
  deleteProject: (id) => GoApp.DeleteProject(id),
  openProject: (id) => GoApp.OpenProject(id) as unknown as Promise<ProjectBundle>,
  saveBoard: (projectId, board) => GoApp.SaveBoard(projectId, board as unknown as goStore.Board),
  saveCollection: (projectId, collection) =>
    GoApp.SaveCollection(projectId, collection as unknown as goStore.Collection),
  deleteCollection: (projectId, id) => GoApp.DeleteCollection(projectId, id),
  saveEnvironments: (projectId, environments) =>
    GoApp.SaveEnvironments(projectId, environments as unknown as goStore.Environment[]),
  setProjectDefaults: (projectId, defaults) =>
    GoApp.SetProjectDefaults(projectId, defaults as unknown as goStore.Defaults),
  setCaptureResponses: (projectId, capture) => GoApp.SetCaptureResponses(projectId, capture),
  saveCredentials: (projectId, credentials) =>
    GoApp.SaveCredentials(projectId, credentials as unknown as goStore.Credential[]),
  deleteCredential: (projectId, name) => GoApp.DeleteCredential(projectId, name),
  setCredentialSecret: (projectId, name, value) => GoApp.SetCredentialSecret(projectId, name, value),
  exportBoardToFile: (projectId, boardId) => GoApp.ExportBoardToFile(projectId, boardId),
  copyBoardJSON: (projectId, boardId) => GoApp.CopyBoardJSON(projectId, boardId),
  copySelection: (projectId, board, nodeIds) =>
    GoApp.CopySelection(projectId, board as unknown as goStore.Board, nodeIds),
  readClipboardEnvelope: () => GoApp.ReadClipboardEnvelope() as Promise<ClipboardEnvelope>,
  importBoardFromFile: (projectId) => GoApp.ImportBoardFromFile(projectId) as Promise<ImportBoardResult>,
  runTransformScript: (req) => GoApp.RunTransformScript(req as unknown as goMain.ScriptRunRequest),
  sendTestRequest: (projectId, request) =>
    GoApp.SendTestRequest(projectId, request as unknown as goMain.TestRequest) as unknown as Promise<TestResponse>,
}

const wailsRunApi: RunApi = {
  runBoard: (projectId, request) =>
    GoApp.RunBoard(projectId, request as unknown as goMain.RunRequest) as unknown as Promise<RunResult>,
  stopRun: (runId) => GoApp.StopRun(runId),
  onRunEvent: subscribeRunEvents,
}

const wailsUpdateApi: UpdateApi = {
  appInfo: () => GoApp.AppInfo(),
  checkForUpdate: () => GoApp.CheckForUpdate() as unknown as Promise<UpdateCheck>,
  downloadUpdate: (tag) => GoApp.DownloadUpdate(tag),
  cancelUpdateDownload: () => GoApp.CancelUpdateDownload(),
  installUpdate: () => GoApp.InstallUpdate() as unknown as Promise<UpdatePlan>,
  openExternal: (url) => GoApp.OpenExternal(url),
  onUpdateProgress: subscribeUpdateProgress,
}

declare global {
  interface Window {
    /** Injected by the Wails runtime before the app bundle loads. */
    go?: unknown
  }
}

const insideWails = typeof window !== 'undefined' && window.go !== undefined

// Runs go through the Go engine — real HTTP — inside the app. Outside it
// (vitest, `bun run dev`) the simulator stands in, which is why the run stream
// is selected separately from the store: a browser session has no backend to
// call but must still be able to drive a board.
export const api: CascadeApi = {
  ...(insideWails ? wailsApi : createInMemoryApi()),
  ...(insideWails ? wailsRunApi : createInMemoryRunApi()),
  ...(insideWails ? wailsUpdateApi : createInMemoryUpdateApi()),
}
