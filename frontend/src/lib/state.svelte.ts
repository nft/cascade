import { api } from './api'
import { deserializeBoard, serializeBoard } from './board'
import type { ContextMenuKind } from './contextMenu'
import { componentIds, downstreamIds, upstreamIds } from './graph'
import {
  isHttpNode,
  type AppEdge,
  type AppNode,
  type BoardViewport,
  type CapturedResponse,
  type CredentialDef,
  type EnvironmentDef,
  type HttpNode,
  type LogEntry,
  type NodeExport,
  type NodeField,
  type Operation,
  type ProjectBundle,
  type ProjectInfo,
} from './model'
import {
  directUpstreams,
  isValidKey,
  resolveField,
  slugifyKey,
  takenKeys,
  uniqueKey,
  type ResolveContext,
} from './refs'
import { inferSchema } from './schema'

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Demo-sim id generator: uuid-shaped so schema inference can show its format guess. */
function pseudoUuid(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16)
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, hex)
}

/** Sets a dot-path leaf inside the fabricated response body ("owner.id" → {owner: {id}}). */
function setBodyPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split('.')
  let current = target
  for (const seg of segs.slice(0, -1)) {
    const next = current[seg]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      current[seg] = {}
    }
    current = current[seg] as Record<string, unknown>
  }
  current[segs[segs.length - 1]] = value
}

const BOARD_SAVE_DEBOUNCE_MS = 400

/** Mirrors the Go-side first-launch bootstrap name (bootstrap.go). */
const DEFAULT_PROJECT_NAME = 'Default'

/** Node data keys that are run products, not user edits — changing only these never triggers a board save. */
const TRANSIENT_NODE_KEYS: ReadonlySet<string> = new Set(['status', 'note'])

/** Captured response bodies above this JSON size are dropped (plan 05 §8). */
const RESPONSE_BODY_CAP_BYTES = 256 * 1024

/** Most recently opened first; never-opened projects sort last in index order. */
const byLastOpened = (a: ProjectInfo, b: ProjectInfo) =>
  (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? '')

class AppState {
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
    const id = `${op.ref}-${this.addCounter}`
    const defaults = this.project?.project.defaults
    this.nodes = [
      ...this.nodes,
      {
        id,
        type: 'http',
        position: position ?? { x: 120 + this.addCounter * 40, y: 380 + this.addCounter * 24 },
        data: {
          name: op.summary,
          key: uniqueKey(slugifyKey(op.summary), takenKeys(this.nodes)),
          method: op.method,
          path: op.path,
          environment: defaults?.environment ?? '',
          credential: defaults?.credential ?? '',
          status: 'idle',
          repeat: 1,
          fields: [],
        },
      },
    ]
    this.selectedNodeId = id
    this.scheduleBoardSave()
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

  /**
   * Demo-only run simulation; replaced by engine events once M1 is wired in.
   * With a target, only the target's upstream set, downstream chain, or
   * weakly-connected component runs — the same node-set semantics as the
   * engine's planned `Options.Target` subgraph runs (M1 WP5). Nodes outside
   * the set keep their previous status.
   */
  async simulateRun(targetId?: string, scope: RunScope = 'upstream') {
    if (this.isRunning) return
    this.isRunning = true
    const runId = `run-${Math.random().toString(16).slice(2, 6)}`
    const include = targetId
      ? scope === 'upstream'
        ? upstreamIds(this.edges, targetId)
        : scope === 'downstream'
          ? downstreamIds(this.edges, targetId)
          : componentIds(this.edges, targetId)
      : null
    // Note nodes are annotations — they never run, so they keep no status.
    const noteIds = new Set(this.nodes.filter((n) => n.type === 'note').map((n) => n.id))
    const order = this.executionOrder().filter(
      (id) => (!include || include.has(id)) && !noteIds.has(id),
    )
    this.activeRunIds = new Set(order)

    for (const id of order) this.updateNodeData(id, { status: 'idle', note: undefined })

    const failed = new Set<string>()
    for (const id of order) {
      const node = this.nodes.find((n) => n.id === id)
      if (!node) continue
      const upstreamFailed = this.edges.some((e) => e.target === id && failed.has(e.source))
      if (upstreamFailed) {
        failed.add(id)
        this.updateNodeData(id, { status: 'skipped' })
        continue
      }
      this.updateNodeData(id, { status: 'running' })
      await sleep(500)
      const fails = id === 'create-project'
      this.updateNodeData(
        id,
        fails ? { status: 'failed', note: '422 Unprocessable Entity' } : { status: 'success' },
      )
      if (fails) failed.add(id)
      // Transform log records are a plan 06 T2 concern; the demo sim only logs http calls.
      if (!isHttpNode(node)) continue
      const captured = fails ? null : this.captureSimulatedResponse(node)
      this.logs = [
        ...this.logs,
        {
          id: `${runId}-${id}`,
          runId,
          time: new Date().toISOString().slice(11, 23),
          node: node.data.name,
          method: node.data.method,
          url: `https://staging.api.example.com${node.data.path.replace('{id}', 'org_01HZX9')}`,
          status: fails ? 422 : 201,
          durationMs: 80 + Math.floor(Math.random() * 300),
          error: fails ? 'name "Apollo" already exists in org_01HZX9' : undefined,
          response: captured ? JSON.stringify(captured.body) : undefined,
        },
      ]
    }
    this.activeRunIds = null
    this.isRunning = false
    // Captured responses persist in the board layout (plan 05 §8).
    this.scheduleBoardSave()
  }

  /**
   * Fabricate and store the node's response for the demo sim: body.* fields
   * resolve against upstream captures (so bindings, res sugar, templates and
   * {{i}} behave like the real engine), plus a server-shaped id/created_at.
   */
  private captureSimulatedResponse(node: HttpNode): CapturedResponse {
    const ctx: ResolveContext = {
      outputs: this.responses,
      exports: Object.fromEntries(
        this.nodes.filter(isHttpNode).map((n) => [n.id, n.data.exports ?? []]),
      ),
      upstreams: directUpstreams(this.edges, node.id),
      index: 0,
    }
    const body: Record<string, unknown> = {
      id: pseudoUuid(),
      created_at: new Date().toISOString(),
    }
    for (const field of node.data.fields) {
      if (!field.key.startsWith('body.')) continue
      let value: unknown
      try {
        value = resolveField(field, ctx)
      } catch (err) {
        value = `«unresolved: ${err instanceof Error ? err.message : String(err)}»`
      }
      setBodyPath(body, field.key.slice('body.'.length), value)
    }
    const captured: CapturedResponse = {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body,
      at: new Date().toISOString(),
    }
    if (JSON.stringify(captured.body).length > RESPONSE_BODY_CAP_BYTES) {
      captured.body = null
      captured.truncated = true
    }
    this.responses = { ...this.responses, [node.id]: captured }
    return captured
  }

  /** Topological order over the current canvas; nodes in cycles are dropped (canvas rejects cycles anyway). */
  private executionOrder(): string[] {
    const indegree = new Map<string, number>(this.nodes.map((n) => [n.id, 0]))
    for (const e of this.edges) indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
    const ready = this.nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id)
    const order: string[] = []
    while (ready.length > 0) {
      const id = ready.shift()!
      order.push(id)
      for (const e of this.edges) {
        if (e.source !== id) continue
        const d = (indegree.get(e.target) ?? 0) - 1
        indegree.set(e.target, d)
        if (d === 0) ready.push(e.target)
      }
    }
    return order
  }
}

export const app = new AppState()
