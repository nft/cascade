import { api } from './api'
import { deserializeBoard, serializeBoard } from './board'
import {
  addFolder,
  addRequest,
  findRequest,
  libraryId,
  makeCollection,
  makeFolder,
  removeFolder,
  removeRequest,
  requestRefCount,
  updateFolder,
  updateRequest,
} from './collections'
import type { ContextMenuKind } from './contextMenu'
import {
  isHttpNode,
  type AppEdge,
  type AppNode,
  type BoardViewport,
  type CapturedResponse,
  type CollectionDef,
  type CredentialDef,
  type EnvironmentDef,
  type LogEntry,
  type NodeExport,
  type NodeField,
  type Operation,
  type ProjectBundle,
  type ProjectInfo,
  type RequestDef,
} from './model'
import {
  makeCustomHttpNode,
  makeHttpNode,
  makeHttpNodeFromRequest,
  makeNoteNode,
  makeTransformNode,
} from './nodeFactory'
import { normalizeOrigin } from './request'
import { isValidKey, takenKeys, uniqueKey } from './refs'
import { inferSchema } from './schema'
import { simulateRun } from './sim'

type SidebarTab = 'operations' | 'environments' | 'keys'

export type CanvasTool = 'select' | 'scissors'

export type RunScope = 'upstream' | 'downstream' | 'component'

export interface ContextMenuState {
  kind: ContextMenuKind
  /** Node or edge id for kind 'node' / 'edge'. */
  id?: string
  screen: { x: number; y: number }
  /** Canvas position under the cursor; filled via screenToFlowPosition when the menu opens. */
  flow?: { x: number; y: number }
}

const BOARD_SAVE_DEBOUNCE_MS = 400

/** Mirrors the Go-side first-launch bootstrap name (bootstrap.go). */
const DEFAULT_PROJECT_NAME = 'Default'

/** Node data keys that are run products, not user edits — changing only these never triggers a board save. */
const TRANSIENT_NODE_KEYS: ReadonlySet<string> = new Set(['status', 'note'])

/** Most recently opened first; never-opened projects sort last in index order. */
const byLastOpened = (a: ProjectInfo, b: ProjectInfo) =>
  (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? '')

export class AppState {
  nodes = $state.raw<AppNode[]>([])
  edges = $state.raw<AppEdge[]>([])
  logs = $state<LogEntry[]>([])
  /** Last successful response per node id; persisted in the board layout (plan 05 §8). */
  responses = $state<Record<string, CapturedResponse>>({})
  projects = $state<ProjectInfo[]>([])
  /** The open project's working set; null until init() resolves. */
  project = $state<ProjectBundle | null>(null)
  boardId = $state<string | null>(null)
  boardName = $state('')
  selectedNodeId = $state<string | null>(null)
  sidebarTab = $state<SidebarTab>('operations')
  logsOpen = $state(true)
  isRunning = $state(false)
  /** Node ids in the currently running subgraph; null when idle. Drives edge animation. */
  activeRunIds = $state<ReadonlySet<string> | null>(null)
  contextMenu = $state<ContextMenuState | null>(null)
  canvasTool = $state<CanvasTool>('select')
  /** Bumped by requestRename; the inspector focuses its name field when it changes. */
  renameSignal = $state(0)
  private viewport: BoardViewport | undefined
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private addCounter = 0

  get selectedNode(): AppNode | null {
    return this.nodes.find((n) => n.id === this.selectedNodeId) ?? null
  }

  get projectId(): string | null {
    return this.project?.project.id ?? null
  }

  get projectName(): string {
    return this.project?.project.name ?? ''
  }

  get operations(): Operation[] {
    return this.project?.sources.flatMap((s) => s.operations) ?? []
  }

  get environments(): EnvironmentDef[] {
    return this.project?.environments ?? []
  }

  get credentials(): CredentialDef[] {
    return this.project?.credentials ?? []
  }

  /** App startup: load the project index and reopen the last-opened project. */
  async init() {
    this.projects = await api.listProjects()
    const last = [...this.projects].sort(byLastOpened)[0]
    if (last) await this.openProject(last.id)
  }

  /** Swap the whole working set: palette, envs/creds, board, logs, selection. */
  async openProject(id: string) {
    await this.flushBoardSave()
    const bundle = await api.openProject(id)
    this.project = bundle
    const board = bundle.boards[0]
    this.boardId = board?.id ?? null
    this.boardName = board?.name ?? ''
    const loaded = board
      ? deserializeBoard(board)
      : { nodes: [], edges: [], viewport: undefined, responses: {} }
    this.nodes = loaded.nodes
    this.edges = loaded.edges
    this.viewport = loaded.viewport
    this.responses = loaded.responses
    this.logs = []
    this.selectedNodeId = null
    this.contextMenu = null
    this.activeRunIds = null
    // Refresh the index so lastOpenedAt ordering stays current.
    this.projects = await api.listProjects()
  }

  async createProject(name: string): Promise<ProjectInfo> {
    const info = await api.createProject(name)
    await this.openProject(info.id)
    return info
  }

  async renameCurrentProject(name: string) {
    const id = this.projectId
    if (!id) return
    await api.renameProject(id, name)
    if (this.project) this.project.project.name = name
    this.projects = await api.listProjects()
  }

  /**
   * Delete the open project and fall back to the most recently opened
   * remaining one; when none remain, recreate "Default" (same invariant as
   * the Go-side first-launch bootstrap: a project is always open).
   */
  async deleteCurrentProject() {
    const id = this.projectId
    if (!id) return
    this.cancelBoardSave() // never save into a project being deleted
    await api.deleteProject(id)
    this.project = null
    this.boardId = null
    this.projects = await api.listProjects()
    const next = [...this.projects].sort(byLastOpened)[0]
    if (next) {
      await this.openProject(next.id)
      return
    }
    const info = await api.createProject(DEFAULT_PROJECT_NAME)
    await this.openProject(info.id)
  }

  /** Debounced per-mutation persistence — there is no global "Save" button. */
  scheduleBoardSave() {
    if (!this.projectId || !this.boardId) return
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      void this.saveBoardNow()
    }, BOARD_SAVE_DEBOUNCE_MS)
  }

  private cancelBoardSave() {
    clearTimeout(this.saveTimer)
    this.saveTimer = undefined
  }

  /** Run a pending debounced save immediately (before the board swaps out from under it). */
  private async flushBoardSave() {
    if (this.saveTimer === undefined) return
    this.cancelBoardSave()
    await this.saveBoardNow()
  }

  private async saveBoardNow() {
    const projectId = this.projectId
    if (!projectId || !this.boardId) return
    const board = serializeBoard(
      this.boardId,
      this.boardName,
      this.nodes,
      this.edges,
      this.viewport,
      this.responses,
    )
    try {
      await api.saveBoard(projectId, board)
    } catch (err) {
      // Surfacing via the global ui store lands with that store; a failed
      // save must not take down the canvas.
      console.error('board save failed:', err)
    }
  }

  /** Canvas-originated node changes (drag, measure, keyboard delete). */
  setNodesFromCanvas(nodes: AppNode[]) {
    this.nodes = nodes
    this.scheduleBoardSave()
  }

  /** Canvas-originated edge changes (connect, keyboard delete). */
  setEdgesFromCanvas(edges: AppEdge[]) {
    this.edges = edges
    this.scheduleBoardSave()
  }

  updateNodeData(id: string, patch: Partial<AppNode['data']>) {
    this.nodes = this.nodes.map((n) =>
      n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as AppNode) : n,
    )
    if (Object.keys(patch).some((key) => !TRANSIENT_NODE_KEYS.has(key))) this.scheduleBoardSave()
  }

  addNode(op: Operation, position?: { x: number; y: number }) {
    this.addCounter += 1
    const defaults = this.project?.project.defaults
    this.insertNode(
      makeHttpNode(op, `${op.ref}-${this.addCounter}`, this.nodes, defaults, position ?? this.autoPosition()),
    )
  }

  /** Ad-hoc request node (plan 08 A3) — hand-configured, credential none. */
  addCustomHttpNode(position?: { x: number; y: number }) {
    this.addCounter += 1
    const defaults = this.project?.project.defaults
    this.insertNode(
      makeCustomHttpNode(`custom-${this.addCounter}`, this.nodes, defaults, position ?? this.autoPosition()),
    )
  }

  addTransformNode(position?: { x: number; y: number }) {
    this.addCounter += 1
    this.insertNode(
      makeTransformNode(`transform-${this.addCounter}`, this.nodes, position ?? this.autoPosition()),
    )
  }

  addNoteNode(position?: { x: number; y: number }) {
    this.addCounter += 1
    this.insertNode(makeNoteNode(`note-${this.addCounter}`, position ?? this.autoPosition()))
  }

  private insertNode(node: AppNode) {
    this.nodes = [...this.nodes, node]
    this.selectedNodeId = node.id
    this.scheduleBoardSave()
  }

  /** Stagger sidebar-added nodes so they do not stack (add-at-cursor passes a position). */
  private autoPosition(): { x: number; y: number } {
    return { x: 120 + this.addCounter * 40, y: 380 + this.addCounter * 24 }
  }

  removeNode(id: string) {
    this.nodes = this.nodes.filter((n) => n.id !== id)
    this.edges = this.edges.filter((e) => e.source !== id && e.target !== id)
    if (id in this.responses) {
      const { [id]: _dropped, ...rest } = this.responses
      this.responses = rest
    }
    if (this.selectedNodeId === id) this.selectedNodeId = null
    this.scheduleBoardSave()
  }

  removeEdge(id: string) {
    this.edges = this.edges.filter((e) => e.id !== id)
    this.scheduleBoardSave()
  }

  duplicateNode(id: string) {
    const src = this.nodes.find((n) => n.id === id)
    if (!src) return
    this.addCounter += 1
    const newId = `${src.id}-copy-${this.addCounter}`
    const data = structuredClone(src.data)
    if ('status' in data) {
      data.status = 'idle'
      data.note = undefined
    }
    // The copy needs its own board-unique key; refs elsewhere keep pointing
    // at the original (they store its node ID).
    if ('key' in data) data.key = uniqueKey(data.key, takenKeys(this.nodes))
    this.nodes = [
      ...this.nodes,
      {
        ...src,
        id: newId,
        position: { x: src.position.x + 40, y: src.position.y + 40 },
        selected: false,
        data,
      } as AppNode,
    ]
    this.selectedNodeId = newId
    this.scheduleBoardSave()
  }

  /**
   * Rename a node's reference key. Returns an error message when the key is
   * rejected (bad slug, reserved word, or taken on this board); null on
   * success. Refs store node IDs, so no field on any node is rewritten.
   */
  setNodeKey(id: string, key: string): string | null {
    if (!isValidKey(key)) return 'keys are letters, digits and _, starting with a letter ("res" and "i" are reserved)'
    if (takenKeys(this.nodes, id).has(key)) return `key "${key}" is already used on this board`
    this.updateNodeData(id, { key })
    return null
  }

  /**
   * Set or clear a node's origin override (plan 08 A1). Returns an error
   * message when the value is not an absolute http(s) URL; null on success.
   * An empty value clears the override back to the environment's base URL.
   */
  setNodeOrigin(id: string, raw: string): string | null {
    if (raw.trim() === '') {
      this.updateNodeData(id, { origin: undefined })
      return null
    }
    const origin = normalizeOrigin(raw)
    if (!origin) return 'origin must be an absolute http(s) URL, e.g. https://api.example.com'
    this.updateNodeData(id, { origin })
    return null
  }

  /** Replace one request field's parsed value (from the inspector editor). */
  setField(nodeId: string, field: NodeField) {
    const node = this.nodes.find((n) => n.id === nodeId)
    if (!node || !isHttpNode(node)) return
    const fields = node.data.fields.some((f) => f.key === field.key)
      ? node.data.fields.map((f) => (f.key === field.key ? field : f))
      : [...node.data.fields, field]
    this.updateNodeData(nodeId, { fields })
  }

  removeField(nodeId: string, fieldKey: string) {
    const node = this.nodes.find((n) => n.id === nodeId)
    if (!node || !isHttpNode(node)) return
    this.updateNodeData(nodeId, { fields: node.data.fields.filter((f) => f.key !== fieldKey) })
  }

  /** Replace a node's declared output aliases (inspector Outputs section). */
  setExports(nodeId: string, exports: NodeExport[]) {
    this.updateNodeData(nodeId, { exports })
  }

  /**
   * Pin the schema inferred from the node's last captured response onto the
   * node (plan 05 §8). Pinned schemas serialize with the board, so shared
   * boards keep working pickers without run history; invoking again after a
   * newer run re-infers.
   */
  useLastResponseAsSchema(nodeId: string) {
    const captured = this.responses[nodeId]
    if (!captured) return
    this.updateNodeData(nodeId, { responseSchema: inferSchema(captured.body) })
  }

  /** Select the node and ask the inspector to focus its name field. */
  requestRename(id: string) {
    this.selectedNodeId = id
    this.renameSignal += 1
  }

  openContextMenu(menu: ContextMenuState) {
    this.contextMenu = menu
  }

  closeContextMenu() {
    this.contextMenu = null
  }

  /** Escape priority: context menu → scissors tool → inspector (unless typing in a field). */
  escapePressed(typing = false) {
    if (this.contextMenu) {
      this.contextMenu = null
      return
    }
    if (this.canvasTool !== 'select') {
      this.canvasTool = 'select'
      return
    }
    if (!typing) this.selectedNodeId = null
  }

  /** Demo-only run simulation (sim.ts); replaced by engine events once M1 is wired in. */
  async simulateRun(targetId?: string, scope: RunScope = 'upstream') {
    await simulateRun(this, targetId, scope)
  }

  // --- collections (plan 08 B1/B2) -------------------------------------------

  get collections(): CollectionDef[] {
    return this.project?.collections ?? []
  }

  /**
   * Apply an immutable tree operation to one collection and persist the
   * result. A null from the operation means "target not found / invariant
   * would break" — the state is left untouched.
   */
  private mutateCollection(
    collectionId: string,
    fn: (collection: CollectionDef) => CollectionDef | null,
  ): boolean {
    if (!this.project) return false
    const current = this.project.collections.find((c) => c.id === collectionId)
    if (!current) return false
    const next = fn(current)
    if (!next) return false
    this.project.collections = this.project.collections.map((c) =>
      c.id === collectionId ? next : c,
    )
    void this.saveCollectionNow(next)
    return true
  }

  private async saveCollectionNow(collection: CollectionDef) {
    const projectId = this.projectId
    if (!projectId) return
    try {
      await api.saveCollection(projectId, $state.snapshot(collection) as CollectionDef)
    } catch (err) {
      // Same policy as board saves: a failed write must not take down the UI.
      console.error('collection save failed:', err)
    }
  }

  createCollection(name: string): CollectionDef | null {
    if (!this.project) return null
    const collection = makeCollection(name)
    this.project.collections = [...this.project.collections, collection]
    void this.saveCollectionNow(collection)
    return collection
  }

  renameCollection(collectionId: string, name: string) {
    this.mutateCollection(collectionId, (c) => ({ ...c, name }))
  }

  async deleteCollection(collectionId: string) {
    const projectId = this.projectId
    if (!this.project || !projectId) return
    this.project.collections = this.project.collections.filter((c) => c.id !== collectionId)
    try {
      await api.deleteCollection(projectId, collectionId)
    } catch (err) {
      console.error('collection delete failed:', err)
    }
  }

  /** Nodes across all boards (the open one included) referencing the collection. */
  collectionRefCount(collectionId: string, requestId?: string): number {
    if (!this.project) return 0
    const savedBoards = this.project.boards.filter((b) => b.id !== this.boardId)
    const savedNodes = savedBoards.flatMap((b) => b.nodes)
    const canvasNodes = this.nodes.map((n) => ({ data: n.data as Record<string, unknown> }))
    return requestRefCount([...savedNodes, ...canvasNodes], collectionId, requestId)
  }

  /** Returns the new folder's id, or null when the parent is missing or the depth cap would break. */
  addCollectionFolder(collectionId: string, parentFolderId: string, name: string): string | null {
    const folder = makeFolder(name)
    const ok = this.mutateCollection(collectionId, (c) => {
      const root = addFolder(c.root, parentFolderId, folder)
      return root ? { ...c, root } : null
    })
    return ok ? folder.id : null
  }

  renameCollectionFolder(collectionId: string, folderId: string, name: string) {
    this.mutateCollection(collectionId, (c) => {
      const root = updateFolder(c.root, folderId, (f) => ({ ...f, name }))
      return root ? { ...c, root } : null
    })
  }

  deleteCollectionFolder(collectionId: string, folderId: string) {
    this.mutateCollection(collectionId, (c) => {
      const root = removeFolder(c.root, folderId)
      return root ? { ...c, root } : null
    })
  }

  renameCollectionRequest(collectionId: string, requestId: string, name: string) {
    this.mutateCollection(collectionId, (c) => {
      const root = updateRequest(c.root, requestId, (r) => ({ ...r, name }))
      return root ? { ...c, root } : null
    })
  }

  duplicateCollectionRequest(collectionId: string, folderId: string, requestId: string) {
    this.mutateCollection(collectionId, (c) => {
      const source = findRequest(c.root, requestId)
      if (!source) return null
      const copy: RequestDef = {
        ...structuredClone($state.snapshot(source) as RequestDef),
        id: libraryId('req'),
        name: `${source.name} copy`,
      }
      const root = addRequest(c.root, folderId, copy)
      return root ? { ...c, root } : null
    })
  }

  deleteCollectionRequest(collectionId: string, requestId: string) {
    this.mutateCollection(collectionId, (c) => {
      const root = removeRequest(c.root, requestId)
      return root ? { ...c, root } : null
    })
  }

  /** Instantiate a collection request as a canvas node (plan 08 B3). */
  addNodeFromRequest(collectionId: string, request: RequestDef, position?: { x: number; y: number }) {
    if (request.protocol !== 'http') return
    this.addCounter += 1
    const defaults = this.project?.project.defaults
    this.insertNode(
      makeHttpNodeFromRequest(
        collectionId,
        $state.snapshot(request) as RequestDef,
        `req-${this.addCounter}`,
        this.nodes,
        defaults,
        position ?? this.autoPosition(),
      ),
    )
  }
}

export const app = new AppState()
