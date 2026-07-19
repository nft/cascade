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
import { deleteCredential, saveCredential } from './credentialActions.svelte'
import { credentialRefCount } from './credentials'
import {
  saveNodeToCollection,
  updateCollectionRequestFromNode,
  upsertCollectionRequest,
} from './library'
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
import { absoluteCenter, containerAt, parentsFirst, positionForParent } from './containment'
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
import { normalizeOrigin } from './request'
import { isValidKey, takenKeys } from './refs'
import { inferSchema } from './schema'
import { simulateRun } from './sim'

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

/** Node data keys that are run products, not user edits — changing only these never triggers a board save. */
const TRANSIENT_NODE_KEYS: ReadonlySet<string> = new Set(['status', 'note', 'progress'])

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
    this.openBoard(bundle.boards[0])
    this.logs = []
    this.contextMenu = null
    // Refresh the index so lastOpenedAt ordering stays current.
    this.projects = await api.listProjects()
  }

  /** Swap the active board in place (project open, board import; tabs later). */
  openBoard(board: BoardJSON | undefined) {
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

  addMockNode(position?: { x: number; y: number }) {
    this.addCounter += 1
    this.insertNode(makeMockNode(`mock-${this.addCounter}`, this.nodes, position ?? this.autoPosition()))
  }

  addDelayNode(position?: { x: number; y: number }) {
    this.addCounter += 1
    this.insertNode(makeDelayNode(`delay-${this.addCounter}`, this.nodes, position ?? this.autoPosition()))
  }

  addForNode(position?: { x: number; y: number }) {
    this.addCounter += 1
    this.insertNode(makeForNode(`for-${this.addCounter}`, this.nodes, position ?? this.autoPosition()))
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
    // A For container takes its children with it (plan 09 N5) — a dangling
    // parentId would break xyflow; drag-out first is the rescue path.
    const doomed = new Set([id, ...this.nodes.filter((n) => n.parentId === id).map((n) => n.id)])
    this.nodes = this.nodes.filter((n) => !doomed.has(n.id))
    this.edges = this.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target))
    if ([...doomed].some((d) => d in this.responses)) {
      this.responses = Object.fromEntries(
        Object.entries(this.responses).filter(([nodeId]) => !doomed.has(nodeId)),
      )
    }
    if (this.selectedNodeId && doomed.has(this.selectedNodeId)) this.selectedNodeId = null
    this.scheduleBoardSave()
  }

  /**
   * Delete with the For safeguard: a container that still holds children
   * asks for confirmation (the dialog calls removeNode on confirm); anything
   * else deletes immediately.
   */
  removeNodeRequest(id: string) {
    const node = this.nodes.find((n) => n.id === id)
    if (!node) return
    const childCount = this.nodes.filter((n) => n.parentId === id).length
    if (node.type === 'for' && childCount > 0) {
      dialogs.confirmDeleteFor = { nodeId: id, childCount }
      return
    }
    this.removeNode(id)
  }

  /**
   * Loop membership on drop (plan 09 N5): re-parent the dropped node into
   * the For container under its center, or back to top level, translating
   * the position so it stays visually put. Refusals (nested For, edges that
   * would cross the loop boundary) toast and change nothing.
   */
  dropNode(id: string) {
    const node = this.nodes.find((n) => n.id === id)
    if (!node || node.type === 'note') return // annotations stay top-level
    const target = containerAt(this.nodes, absoluteCenter(node, this.nodes), id)
    const targetId = target?.id ?? null
    if ((node.parentId ?? null) === targetId) return
    if (target && node.type === 'for') {
      dialogs.showToast('Nested for loops are not supported')
      return
    }
    const crossing = this.edges.some((e) => {
      if (e.source !== id && e.target !== id) return false
      const otherId = e.source === id ? e.target : e.source
      const other = this.nodes.find((n) => n.id === otherId)
      return (other?.parentId ?? null) !== targetId
    })
    if (crossing) {
      dialogs.showToast(
        target
          ? `An edge would cross the loop boundary — cut it before moving "${node.data.name}" in`
          : `An edge to a loop sibling would cross the boundary — cut it before moving "${node.data.name}" out`,
      )
      return
    }
    const position = positionForParent(node, this.nodes, target)
    this.nodes = parentsFirst(
      this.nodes.map((n) => {
        if (n.id !== id) return n
        const { parentId: _dropped, ...rest } = n
        return (target ? { ...rest, parentId: target.id, position } : { ...rest, position }) as AppNode
      }),
    )
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
    const copy = duplicateAppNode(src, `${src.id}-copy-${this.addCounter}`, this.nodes)
    this.nodes = [...this.nodes, copy]
    this.selectedNodeId = copy.id
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

  /**
   * Rename a field in place, keeping its row position — composing
   * removeField+setField would append the renamed key at the bottom of its
   * section (setField appends unknown keys), which reads as a bug (plan 10 §3b).
   */
  renameField(nodeId: string, oldKey: string, newKey: string) {
    const node = this.nodes.find((n) => n.id === nodeId)
    if (!node || !isHttpNode(node)) return
    if (node.data.fields.some((f) => f.key === newKey)) return
    this.updateNodeData(nodeId, {
      fields: node.data.fields.map((f) => (f.key === oldKey ? { ...f, key: newKey } : f)),
    })
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

  /** Logs are ephemeral (never persisted): no save scheduling, responses/statuses untouched. */
  clearLogs() {
    this.logs = []
    // The hovered row unmounts without a pointerleave; drop its highlight explicitly.
    this.logHoverNodeId = null
  }

  /** Demo-only run simulation (sim.ts); replaced by engine events once M1 is wired in. */
  async simulateRun(targetId?: string, scope: RunScope = 'upstream') {
    await simulateRun(this, targetId, scope)
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
  private allNodeData() {
    if (!this.project) return []
    const saved = this.project.boards.filter((b) => b.id !== this.boardId).flatMap((b) => b.nodes)
    return [...saved, ...this.nodes.map((n) => ({ data: n.data as Record<string, unknown> }))]
  }

  // --- collections (plan 08 B1/B2) -------------------------------------------

  get collections(): CollectionDef[] {
    return this.project?.collections ?? []
  }

  /**
   * Apply an immutable tree operation to one collection and persist the
   * result. A null from the operation means "target not found / invariant
   * would break" — the state is left untouched. Public so library flows
   * (library.ts) can compose it; components use the named methods below.
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
    return requestRefCount(this.allNodeData(), collectionId, requestId)
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

  /** "Save to collection…" (plan 08 B3); returns the new request's id, or null. */
  saveNodeToCollection(nodeId: string, collectionId: string, folderId: string, name: string): string | null {
    return saveNodeToCollection(this, nodeId, collectionId, folderId, name)
  }

  /** Explicitly push a node's shape back onto its library request (plan 08 B3). */
  updateCollectionRequestFromNode(nodeId: string): boolean {
    return updateCollectionRequestFromNode(this, nodeId)
  }

  /** Request editor dialog save: replace in place, or add to the folder (plan 08 B3). */
  upsertCollectionRequest(collectionId: string, folderId: string, request: RequestDef): boolean {
    return upsertCollectionRequest(this, collectionId, folderId, request)
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
