import type { AppEdge, AppNode, LogEntry, Operation, OperationNodeData } from './model'
import { initialEdges, initialLogs, initialNodes } from './mock'

type SidebarTab = 'operations' | 'environments' | 'keys'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

class AppState {
  nodes = $state.raw<AppNode[]>(initialNodes)
  edges = $state.raw<AppEdge[]>(initialEdges)
  logs = $state<LogEntry[]>(initialLogs)
  selectedNodeId = $state<string | null>(null)
  sidebarTab = $state<SidebarTab>('operations')
  logsOpen = $state(true)
  isRunning = $state(false)
  private addCounter = 0

  get selectedNode(): AppNode | null {
    return this.nodes.find((n) => n.id === this.selectedNodeId) ?? null
  }

  updateNodeData(id: string, patch: Partial<OperationNodeData>) {
    this.nodes = this.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
  }

  addNode(op: Operation) {
    this.addCounter += 1
    const id = `${op.ref}-${this.addCounter}`
    this.nodes = [
      ...this.nodes,
      {
        id,
        type: 'operation',
        position: { x: 120 + this.addCounter * 40, y: 380 + this.addCounter * 24 },
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

  // Demo-only run simulation; replaced by engine events once M1 is wired in.
  async simulateRun() {
    if (this.isRunning) return
    this.isRunning = true
    const runId = `run-${Math.random().toString(16).slice(2, 6)}`
    const order = this.executionOrder()

    for (const n of this.nodes) this.updateNodeData(n.id, { status: 'idle', note: undefined })

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
