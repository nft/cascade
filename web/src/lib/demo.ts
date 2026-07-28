import { ae, type ReadableSignal } from '@aeroapp/ae'
import {
  AE,
  DATASET,
  DEMO_TIMING,
  EDGE_CLASS,
  LOG_PART,
  METHOD_CLASS,
  METHOD_CLASS_FALLBACK,
  NODE_STATE,
  NODE_STATE_CLASS,
  type NodeState,
} from './constants'
import { DEMO_EDGES, DEMO_LEVELS, DEMO_NODES, type DemoNode } from '../data/demo'

/** Status code the demo reports per verb. */
const SUCCESS_STATUS: Record<string, number> = { POST: 201, PUT: 200, PATCH: 200, GET: 200 }
const DEFAULT_STATUS = 200

/** Newest-first log rows kept on screen. */
const MAX_LOG_ROWS = 5

/** Deterministic stand-in for a request duration — no randomness, so the
 * rendered output is stable across runs and in tests. */
const DURATION_BASE_MS = 24
const DURATION_PER_CALL_MS = 7

export interface LogRow {
  id: string
  method: string
  /** Verb colour, carried on the row so the template holds no colour literal. */
  methodClass: string
  path: string
  status: number
  count: number
  ms: number
}

type StateMap = Record<string, NodeState>

function idleStates(): StateMap {
  return Object.fromEntries(DEMO_NODES.map((n) => [n.id, NODE_STATE.idle]))
}

function durationOf(node: DemoNode): number {
  return DURATION_BASE_MS + node.repeat * DURATION_PER_CALL_MS
}

function logRow(node: DemoNode): LogRow {
  return {
    id: node.id,
    method: node.method,
    path: node.path,
    methodClass: METHOD_CLASS[node.method] ?? METHOD_CLASS_FALLBACK,
    status: SUCCESS_STATUS[node.method] ?? DEFAULT_STATUS,
    count: node.repeat,
    ms: durationOf(node),
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * Drives the hero graph: nodes light up level by level, exactly the order the
 * engine would schedule them in, with parallel branches advancing together.
 */
export function initDemo(): void {
  const states = ae.signal<StateMap>(idleStates())
  const records = ae.signal(0)
  const logs = ae.signal<LogRow[]>([])
  const running = ae.signal(false)
  const finished = ae.signal(false)

  const nodeById = new Map(DEMO_NODES.map((n) => [n.id, n]))
  const edgeById = new Map(DEMO_EDGES.map((e) => [e.id, e]))

  const status = ae.computed(() => {
    if (running.value) return 'Running…'
    if (finished.value) return `Done · ${records.value.toLocaleString()} records`
    return 'Ready'
  })

  bindCanvas(states, edgeById)
  ae(AE.demoStatus).text(status)
  ae(AE.demoCounter).text(() => records.value.toLocaleString())
  bindLog(logs)

  const setState = (id: string, state: NodeState) => {
    states.value = { ...states.value, [id]: state }
  }

  const reset = () => {
    states.value = idleStates()
    records.value = 0
    logs.value = []
    finished.value = false
  }

  const complete = (node: DemoNode) => {
    setState(node.id, NODE_STATE.success)
    records.value += node.repeat
    logs.value = [logRow(node), ...logs.value].slice(0, MAX_LOG_ROWS)
  }

  const run = async () => {
    if (running.value) return
    running.value = true
    reset()

    if (prefersReducedMotion()) {
      // Still show the outcome, just without the staged animation.
      for (const level of DEMO_LEVELS) {
        for (const id of level) {
          const node = nodeById.get(id)
          if (node) complete(node)
        }
      }
    } else {
      for (const level of DEMO_LEVELS) {
        for (const id of level) setState(id, NODE_STATE.running)
        await sleep(DEMO_TIMING.runningDwell)
        for (const id of level) {
          const node = nodeById.get(id)
          if (node) complete(node)
        }
        await sleep(DEMO_TIMING.stepDelay)
      }
    }

    finished.value = true
    running.value = false
  }

  ae(AE.runDemo)
    .press(() => void run())
    .attr('aria-disabled', () => (running.value ? 'true' : null))
    .mount((el) => autoRunOnView(el, () => void run()))

  ae(AE.resetDemo).press(() => {
    if (!running.value) reset()
  })
}

/** Paints node and edge state. Both re-run for elements added later, so the
 * markup can be server-rendered without any hydration step. */
function bindCanvas(
  states: ReadableSignal<StateMap>,
  edgeById: Map<string, { from: string; to: string }>,
): void {
  ae(AE.demoNode).render((el) => {
    const id = (el as HTMLElement).dataset[DATASET.nodeId]
    const state = id === undefined ? NODE_STATE.idle : (states.value[id] ?? NODE_STATE.idle)
    for (const [candidate, className] of Object.entries(NODE_STATE_CLASS)) {
      el.classList.toggle(className, candidate === state)
    }
  })

  ae(AE.demoEdge).render((el) => {
    const id = (el as HTMLElement).dataset[DATASET.edgeId]
    const edge = id === undefined ? undefined : edgeById.get(id)
    const target = edge === undefined ? undefined : states.value[edge.to]
    el.classList.toggle(EDGE_CLASS.active, target === NODE_STATE.running)
    el.classList.toggle(EDGE_CLASS.done, target === NODE_STATE.success)
  })
}

/** Keyed list stamped from the container's own `<template>`. */
function bindLog(logs: ReadableSignal<LogRow[]>): void {
  ae(AE.demoLog).list(
    logs,
    (row, item: LogRow) => {
      const parts = ae.parts(row)
      setMethod(parts[LOG_PART.method], item)
      setPart(parts[LOG_PART.path], item.path)
      setPart(parts[LOG_PART.status], String(item.status))
      setPart(parts[LOG_PART.count], `×${item.count}`)
      setPart(parts[LOG_PART.duration], `${item.ms} ms`)
    },
    (item: LogRow) => item.id,
  )
}

function setPart(el: Element | undefined, text: string): void {
  if (el) el.textContent = text
}

/** Every class the verb badge can hold, so the previous one is cleared on reuse
 * — `.list` re-renders a stamped node in place rather than replacing it. */
const METHOD_CLASSES = [...new Set([...Object.values(METHOD_CLASS), METHOD_CLASS_FALLBACK])]

function setMethod(el: Element | undefined, item: LogRow): void {
  if (!el) return
  el.textContent = item.method
  el.classList.remove(...METHOD_CLASSES)
  el.classList.add(item.methodClass)
}

/** Runs the demo once, the first time the run button scrolls into view. */
function autoRunOnView(el: Element, run: () => void): (() => void) | undefined {
  if (typeof IntersectionObserver === 'undefined') return undefined

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      run()
    },
    { threshold: 0.35 },
  )
  observer.observe(el)
  return () => observer.disconnect()
}
