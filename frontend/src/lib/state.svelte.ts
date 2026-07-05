import type { ContextMenuKind } from './contextMenu'
import { componentIds, downstreamIds, upstreamIds } from './graph'
import { isHttpNode, type AppEdge, type AppNode, type LogEntry, type Operation } from './model'
import { initialEdges, initialLogs, initialNodes } from './mock'

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

class AppState {
  nodes = $state.raw<AppNode[]>(initialNodes)
  edges = $state.raw<AppEdge[]>(initialEdges)
  logs = $state<LogEntry[]>(initialLogs)
  selectedNodeId = $state<string | null>(null)
  sidebarTab = $state<SidebarTab>('operations')
  logsOpen = $state(true)
  isRunning = $state(false)
  contextMenu = $state<ContextMenuState | null>(null)
  canvasTool = $state<CanvasTool>('select')
  /** Bumped by requestRename; the inspector focuses its name field when it changes. */
  renameSignal = $state(0)
  private addCounter = 0

  get selectedNode(): AppNode | null {
    return this.nodes.find((n) => n.id === this.selectedNodeId) ?? null
  }

  updateNodeData(id: string, patch: Partial<AppNode['data']>) {
    this.nodes = this.nodes.map((n) =>
      n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as AppNode) : n,
    )
  }

  addNode(op: Operation, position?: { x: number; y: number }) {
    this.addCounter += 1
    const id = `${op.ref}-${this.addCounter}`
    this.nodes = [
      ...this.nodes,
      {
        id,
        type: 'http',
        position: position ?? { x: 120 + this.addCounter * 40, y: 380 + this.addCounter * 24 },
        data: {
          name: op.summary,
          method: op.method,
          path: op.path,
          environment: 'staging',
          credential: 'staging-admin',
          status: 'idle',
          repeat: 1,
          fields: [],
        },
      },
    ]
    this.selectedNodeId = id
  }

  removeNode(id: string) {
    this.nodes = this.nodes.filter((n) => n.id !== id)
    this.edges = this.edges.filter((e) => e.source !== id && e.target !== id)
    if (this.selectedNodeId === id) this.selectedNodeId = null
  }

  removeEdge(id: string) {
    this.edges = this.edges.filter((e) => e.id !== id)
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
        },
      ]
    }
    this.isRunning = false
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
