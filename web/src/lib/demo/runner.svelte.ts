// Plays a run of the demo board the way the app shows a real one: nodes one
// at a time in dependency order, the edges into a node animated while it
// runs, a loop running its child once per iteration, a log row per request.
// Nothing leaves the page.
import { DEMO_BASE_URL, DEMO_EDGES, DEMO_NODES, childrenOf, nodeById, type HttpNodeSpec, type LoopNodeSpec, type Method } from './board'
import { runOrder } from './geometry'

export type NodeStatus = 'idle' | 'running' | 'success'
export type EdgeState = 'idle' | 'flowing' | 'done'

export interface LogRow {
  id: number
  /** Wall-clock time the response arrived, in epoch milliseconds. */
  at: number
  node: string
  /** Loop iteration, 0-based like `{{i}}`; null outside a loop. */
  iteration: number | null
  method: Method
  url: string
  status: number
  ms: number
}

const START_DELAY_MS = 450
/** A beat between nodes so each hand-off reads. */
const STEP_GAP_MS = 220
const LATENCY_MIN_MS = 240
const LATENCY_SPREAD_MS = 380
const MAX_LOG_ROWS = 40
const ID_LENGTH = 6
// Crockford-style base32, the look of the app's own ids (org_01HZX9).
const ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const PATH_PARAM = '{id}'

const topLevel = DEMO_NODES.filter((n) => n.kind !== 'note' && !(n.kind === 'http' && n.parent)).map((n) => n.id)
const RUN_ORDER = runOrder(topLevel, DEMO_EDGES)

function randomId(prefix: string): string {
  let id = ''
  for (let i = 0; i < ID_LENGTH; i++) id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  return `${prefix}_${id}`
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

const idleStatuses = () =>
  Object.fromEntries(DEMO_NODES.filter((n) => n.kind !== 'note').map((n) => [n.id, 'idle' as NodeStatus]))
const idleEdges = () => Object.fromEntries(DEMO_EDGES.map((e) => [e.id, 'idle' as EdgeState]))

export class DemoRunner {
  status = $state<Record<string, NodeStatus>>(idleStatuses())
  edges = $state<Record<string, EdgeState>>(idleEdges())
  /** The id each node's response carried on this run. */
  outputs = $state<Record<string, string>>({})
  /** How many times each node has started this run; a new start replays its arrival cue. */
  starts = $state<Record<string, number>>({})
  /** Completed iterations of the loop. */
  loopDone = $state(0)
  logs = $state<LogRow[]>([])
  running = $state(false)
  /** Completed runs. */
  runs = $state(0)

  #controller: AbortController | null = null
  #logId = 0

  async run(): Promise<void> {
    if (this.running) return
    this.#reset()
    this.running = true
    const controller = new AbortController()
    this.#controller = controller
    try {
      await sleep(START_DELAY_MS, controller.signal)
      for (const id of RUN_ORDER) await this.#runTopLevel(id, controller.signal)
      this.runs++
    } catch {
      this.#settleStopped()
    } finally {
      this.running = false
      this.#controller = null
    }
  }

  stop(): void {
    this.#controller?.abort()
  }

  /** The request URL with its path parameter filled, once the upstream id exists. */
  url(node: HttpNodeSpec): string {
    const id = node.uses ? this.outputs[node.uses] : undefined
    return DEMO_BASE_URL + (id ? node.path.replace(PATH_PARAM, id) : node.path)
  }

  #reset(): void {
    this.status = idleStatuses()
    this.edges = idleEdges()
    this.outputs = {}
    this.starts = {}
    this.loopDone = 0
    this.logs = []
  }

  async #runTopLevel(id: string, signal: AbortSignal): Promise<void> {
    const node = nodeById(id)
    const incoming = DEMO_EDGES.filter((e) => e.to === id)
    for (const edge of incoming) this.edges[edge.id] = 'flowing'
    if (node.kind === 'loop') await this.#runLoop(node, signal)
    else if (node.kind === 'http') await this.#runRequest(node, null, signal)
    for (const edge of incoming) this.edges[edge.id] = 'done'
    await sleep(STEP_GAP_MS, signal)
  }

  async #runRequest(node: HttpNodeSpec, iteration: number | null, signal: AbortSignal): Promise<void> {
    this.status[node.id] = 'running'
    this.starts[node.id] = (this.starts[node.id] ?? 0) + 1
    const ms = Math.round(LATENCY_MIN_MS + Math.random() * LATENCY_SPREAD_MS)
    await sleep(ms, signal)
    const url = this.url(node)
    // A GET by id returns the resource it names; creates mint a new id.
    this.outputs[node.id] = node.method === 'GET' && node.uses ? this.outputs[node.uses] : randomId(node.produces)
    this.status[node.id] = 'success'
    this.#log({ node: node.name, iteration, method: node.method, url, status: node.status, ms })
  }

  async #runLoop(loop: LoopNodeSpec, signal: AbortSignal): Promise<void> {
    this.status[loop.id] = 'running'
    for (let i = 0; i < loop.count; i++) {
      for (const child of childrenOf(loop.id)) await this.#runRequest(child, i, signal)
      this.loopDone = i + 1
    }
    this.status[loop.id] = 'success'
  }

  #log(row: Omit<LogRow, 'id' | 'at'>): void {
    this.logs = [{ id: ++this.#logId, at: Date.now(), ...row }, ...this.logs].slice(0, MAX_LOG_ROWS)
  }

  /** A stopped run keeps what finished; whatever was in flight goes back to idle. */
  #settleStopped(): void {
    for (const [id, status] of Object.entries(this.status)) if (status === 'running') this.status[id] = 'idle'
    for (const [id, state] of Object.entries(this.edges)) if (state === 'flowing') this.edges[id] = 'idle'
  }
}
