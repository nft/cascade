import { api } from './api'
import { deserializeBoard, serializeBoard, TRANSIENT_NODE_KEYS } from './board'
import { persistCollection } from './collectionActions.svelte'
import type { ContextMenuKind } from './contextMenu'
import { deleteCredential, saveCredential } from './credentialActions.svelte'
import { credentialRefCount } from './credentials'
import { adoptEdgeScope, spliceEdge } from './edgeInsert'
import {
  isHttpNode,
  type AppEdge,
  type AppNode,
  type BoardJSON,
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
import { dialogs } from './dialogs.svelte'
import {
  duplicateAppNode,
  makeCustomHttpNode,
  makeDelayNode,
  makeForNode,
  makeHttpNode,
  makeHttpNodeFromRequest,
  makeMockNode,
  makeNoteNode,
  makeTransformNode,
} from './nodeFactory'
import {
  dropNode,
  removeField,
  removeNode,
  removeNodeRequest,
  renameField,
  setField,
  setNodeKey,
  setNodeOrigin,
  useLastResponseAsSchema,
} from './nodeActions.svelte'
import { startRun, stopRun } from './runner'

type SidebarTab = 'operations' | 'environments' | 'credentials'

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

/** Prefix of the toast raised when persistence fails; the cause follows it. */
const BOARD_SAVE_FAILED_MESSAGE = 'Board save failed'

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
  sidebarOpen = $state(true)
  logsOpen = $state(true)
  /** Canvas lock (controls toggle): freezes node dragging, connecting and selection; panning stays. */
  canvasLocked = $state(false)
  isRunning = $state(false)
  /**
   * The in-flight run's id; null when idle. Stop needs it, and it is how a run
   * that outlived a board switch tells that the flags are no longer its own.
   */
  runId = $state<string | null>(null)
  /** Node ids in the currently running subgraph; null when idle. Drives edge animation. */
  activeRunIds = $state<ReadonlySet<string> | null>(null)
  /** Node id of the hovered log row; rings the node and tints its edges on the canvas (plan 10 §2). */
  logHoverNodeId = $state<string | null>(null)
  contextMenu = $state<ContextMenuState | null>(null)
  canvasTool = $state<CanvasTool>('select')
  /** Bumped by requestRename; the inspector focuses its name field when it changes. */
  renameSignal = $state(0)
  /** Set by the canvas while mounted: the canvas center as a flow position (paste target). */
  pasteTarget: (() => { x: number; y: number }) | null = null
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
    await this.openBoard(bundle.boards[0])
    this.logs = []
    this.contextMenu = null
    // Refresh the index so lastOpenedAt ordering stays current.
    this.projects = await api.listProjects()
  }

  /** Swap the active board in place (project open, board import; tabs later). */
  async openBoard(board: BoardJSON | undefined) {
    // A run outlives the switch — it holds its own copy of the board (plan 11
    // D1) — so it is cancelled first. Its flags are cleared here regardless:
    // leaving them set would disable Run on the new board forever and leave
    // stale `running` paint on whatever node ids happen to collide.
    await this.stopRun()
    this.runId = null
    this.isRunning = false
    const loaded = board
      ? deserializeBoard(board)
      : { nodes: [], edges: [], viewport: undefined, responses: {} }
    this.boardId = board?.id ?? null
    this.boardName = board?.name ?? ''
    this.nodes = loaded.nodes
    this.edges = loaded.edges
    this.viewport = loaded.viewport
    this.responses = loaded.responses
    this.selectedNodeId = null
    this.activeRunIds = null
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

  /** Run a pending debounced save immediately (project switch, board export). */
  async flushBoardSave() {
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
      // Swallowed on purpose — a failed save must not take down the canvas.
      // It is still toasted: silence would leave the user editing a board
      // that stopped being persisted.
      dialogs.showToast(
        `${BOARD_SAVE_FAILED_MESSAGE}: ${err instanceof Error ? err.message : String(err)}`,
      )
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

  /**
   * Mints a board-unique node id. The counter alone is not enough: it lives in
   * memory while boards persist, so after a relaunch it restarts at zero and
   * would re-mint ids the loaded board already contains — duplicate ids crash
   * Svelte Flow's keyed each blocks.
   */
  private allocateId(prefix: string): string {
    const used = new Set(this.nodes.map((n) => n.id))
    let id: string
    do {
      this.addCounter += 1
      id = `${prefix}-${this.addCounter}`
    } while (used.has(id))
    return id
  }

  /** Adds the node and returns its id — callers wire the fresh node up (edge insert). */
  addNode(op: Operation, position?: { x: number; y: number }): string {
    const defaults = this.project?.project.defaults
    return this.insertNode(
      makeHttpNode(op, this.allocateId(op.ref), this.nodes, defaults, position ?? this.autoPosition()),
    )
  }

  /** Ad-hoc request node (plan 08 A3) — hand-configured, credential none. */
  addCustomHttpNode(position?: { x: number; y: number }): string {
    const defaults = this.project?.project.defaults
    return this.insertNode(
      makeCustomHttpNode(this.allocateId('custom'), this.nodes, defaults, position ?? this.autoPosition()),
    )
  }

  addTransformNode(position?: { x: number; y: number }): string {
    return this.insertNode(
      makeTransformNode(this.allocateId('transform'), this.nodes, position ?? this.autoPosition()),
    )
  }

  addMockNode(position?: { x: number; y: number }): string {
    return this.insertNode(makeMockNode(this.allocateId('mock'), this.nodes, position ?? this.autoPosition()))
  }

  addDelayNode(position?: { x: number; y: number }): string {
    return this.insertNode(makeDelayNode(this.allocateId('delay'), this.nodes, position ?? this.autoPosition()))
  }

  addForNode(position?: { x: number; y: number }): string {
    return this.insertNode(makeForNode(this.allocateId('for'), this.nodes, position ?? this.autoPosition()))
  }

  addNoteNode(position?: { x: number; y: number }): string {
    return this.insertNode(makeNoteNode(this.allocateId('note'), position ?? this.autoPosition()))
  }

  private insertNode(node: AppNode): string {
    this.nodes = [...this.nodes, node]
    this.selectedNodeId = node.id
    this.scheduleBoardSave()
    return node.id
  }

  /** Stagger sidebar-added nodes so they do not stack (add-at-cursor passes a position). */
  private autoPosition(): { x: number; y: number } {
    return { x: 120 + this.addCounter * 40, y: 380 + this.addCounter * 24 }
  }

  removeNode(id: string) {
    removeNode(this, id)
  }

  /** Delete, asking first when a For container still holds children. */
  removeNodeRequest(id: string) {
    removeNodeRequest(this, id)
  }

  /** Loop membership on drop (plan 09 N5): re-parent into or out of a For container. */
  dropNode(id: string) {
    dropNode(this, id)
  }

  removeEdge(id: string) {
    this.edges = this.edges.filter((e) => e.id !== id)
    this.scheduleBoardSave()
  }

  /**
   * Rewire A→B as A→N→B: the node takes the connection's place (the edge
   * menu's insert entries). The node also joins the connection's loop scope,
   * since one created from the menu lands top-level.
   */
  insertNodeOnEdge(edgeId: string, nodeId: string) {
    const edge = this.edges.find((e) => e.id === edgeId)
    if (!edge || !this.nodes.some((n) => n.id === nodeId)) return
    this.nodes = adoptEdgeScope(this.nodes, nodeId, edge)
    this.edges = spliceEdge(this.edges, edgeId, nodeId)
    this.scheduleBoardSave()
  }

  duplicateNode(id: string) {
    const src = this.nodes.find((n) => n.id === id)
    if (!src) return
    const copy = duplicateAppNode(src, this.allocateId(`${src.id}-copy`), this.nodes)
    this.nodes = [...this.nodes, copy]
    this.selectedNodeId = copy.id
    this.scheduleBoardSave()
  }

  /** Rename a node's reference key; returns a rejection message, or null. */
  setNodeKey(id: string, key: string): string | null {
    return setNodeKey(this, id, key)
  }

  /** Set or clear a node's origin override; returns a rejection message, or null. */
  setNodeOrigin(id: string, raw: string): string | null {
    return setNodeOrigin(this, id, raw)
  }

  /** Replace one request field's parsed value (from the inspector editor). */
  setField(nodeId: string, field: NodeField) {
    setField(this, nodeId, field)
  }

  /** Rename a field in place, keeping its row position (plan 10 §3b). */
  renameField(nodeId: string, oldKey: string, newKey: string) {
    renameField(this, nodeId, oldKey, newKey)
  }

  removeField(nodeId: string, fieldKey: string) {
    removeField(this, nodeId, fieldKey)
  }

  /** Replace a node's declared output aliases (inspector Outputs section). */
  setExports(nodeId: string, exports: NodeExport[]) {
    this.updateNodeData(nodeId, { exports })
  }

  /** Pin the schema inferred from the node's last captured response (plan 05 §8). */
  useLastResponseAsSchema(nodeId: string) {
    useLastResponseAsSchema(this, nodeId)
  }

  /** Select the node and ask the inspector to focus its name field. */
  requestRename(id: string) {
    this.selectedNodeId = id
    this.renameSignal += 1
  }

  /** Edge whose context menu is open; the canvas highlights it while the menu stands. */
  get contextEdgeId(): string | null {
    return this.contextMenu?.kind === 'edge' ? (this.contextMenu.id ?? null) : null
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

  /** Logs are ephemeral (never persisted): no save scheduling, responses/statuses untouched. */
  clearLogs() {
    this.logs = []
    // The hovered row unmounts without a pointerleave; drop its highlight explicitly.
    this.logHoverNodeId = null
  }

  /** Execute the board, or one node's subgraph. Streams run events onto the canvas. */
  async run(targetId?: string, scope: RunScope = 'upstream') {
    await startRun(this, targetId, scope)
  }

  /** @deprecated call run(); kept until the call sites migrate. */
  async simulateRun(targetId?: string, scope: RunScope = 'upstream') {
    await this.run(targetId, scope)
  }

  /** Cancel the in-flight run. Idle is a no-op. */
  async stopRun() {
    await stopRun(this)
  }

  // --- credentials (plan 04 K2): flow bodies live in credentialActions.svelte.ts

  saveCredential(def: CredentialDef, secret?: string): Promise<string | null> {
    return saveCredential(this, def, secret)
  }

  deleteCredential(name: string): Promise<void> {
    return deleteCredential(this, name)
  }

  /** Nodes across all boards (the open one included) referencing the credential. */
  credentialNodeRefCount(name: string): number {
    return credentialRefCount(this.allNodeData(), name)
  }

  /** Node data across saved boards (minus the open one) plus the live canvas. */
  allNodeData() {
    if (!this.project) return []
    const saved = this.project.boards.filter((b) => b.id !== this.boardId).flatMap((b) => b.nodes)
    return [...saved, ...this.nodes.map((n) => ({ data: n.data as Record<string, unknown> }))]
  }

  // --- collections (plan 08 B1/B2): tree flows live in collectionActions.svelte.ts

  get collections(): CollectionDef[] {
    return this.project?.collections ?? []
  }

  /**
   * Apply an immutable tree operation to one collection and persist the
   * result. A null from the operation means "target not found / invariant
   * would break" — the state is left untouched. Public so the tree and
   * library flows (collectionActions.svelte.ts, library.ts) can compose it.
   */
  mutateCollection(
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
    void persistCollection(this, next)
    return true
  }

  /** Instantiate a collection request as a canvas node (plan 08 B3). */
  addNodeFromRequest(collectionId: string, request: RequestDef, position?: { x: number; y: number }) {
    if (request.protocol !== 'http') return
    const defaults = this.project?.project.defaults
    this.insertNode(
      makeHttpNodeFromRequest(
        collectionId,
        $state.snapshot(request) as RequestDef,
        this.allocateId('req'),
        this.nodes,
        defaults,
        position ?? this.autoPosition(),
      ),
    )
  }
}

export const app = new AppState()
