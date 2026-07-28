/**
 * Behaviour-layer tests: the three `ae` modules that make the site interactive.
 *
 * Isolation is the tricky part. `ae` caches one live handle per `data-ae` name
 * and keeps every binding ever registered on it, so calling an `init*` once per
 * test would stack duplicate bindings — two `.list` bindings on the log
 * container stamp every row twice. The rescue is that a handle only attaches
 * *old* bindings to *new* elements through the MutationObserver `ae` installed
 * on `document.body` at import time: swapping in a fresh `<body>` before each
 * test orphans that observer, so only the bindings registered by this test's
 * `init*` call (which attach eagerly to already-connected elements) are live.
 *
 * Consequence for anyone extending this file: build the DOM *before* calling
 * `init*`, because elements added afterwards will not be picked up here the way
 * they are in a browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ae } from '@aeroapp/ae'
import { initNav } from '../src/lib/nav'
import { initCopy } from '../src/lib/copy'
import { initDemo } from '../src/lib/demo'
import {
  AE,
  COPY_FEEDBACK_MS,
  COPY_LABEL,
  DATA_ATTR,
  DEMO_TIMING,
  EDGE_CLASS,
  LOG_PART,
  NODE_STATE,
  NODE_STATE_CLASS,
  type NodeState,
} from '../src/lib/constants'
import { DEMO_EDGES, DEMO_LEVELS, DEMO_NODES, DEMO_TOTAL_RECORDS } from '../src/data/demo'

const AE_ATTR = 'data-ae'
const aeSelector = (name: string) => `[${AE_ATTR}="${name}"]`
const aeAttr = (name: string) => `${AE_ATTR}="${name}"`

/** Ids used only to grab fixture elements that carry no `data-ae` name. */
const ID = {
  panelLink: 'panel-link',
  panelText: 'panel-text',
} as const

const PANEL_LINK_HREF = '#features'
const INSTALL_COMMAND = 'brew install cascade'

/** Globals jsdom does not implement, stubbed per test and torn down after. */
const GLOBAL = {
  matchMedia: 'matchMedia',
  intersectionObserver: 'IntersectionObserver',
} as const
const CLIPBOARD_PROP = 'clipboard'

/** Row element the log `<template>` stamps; also the selector for the result. */
const LOG_ROW_TAG = 'li'

/**
 * Mirrors of constants that `src/lib/demo.ts` keeps private. Duplicating them
 * here is deliberate: changing the cap or the run pacing has to be an explicit
 * edit in two places rather than a silent change to what the hero shows.
 */
const MAX_LOG_ROWS = 5
const RUN_DURATION_MS = DEMO_LEVELS.length * (DEMO_TIMING.runningDwell + DEMO_TIMING.stepDelay)

/** Fine enough to land inside every dwell and gap of a run. */
const SAMPLE_MS = 40

/** The demo only ever reports success statuses. */
const HTTP_OK = 200
const HTTP_REDIRECT = 300

const DURATION_TEXT = /^\d+ ms$/
const COUNT_PREFIX = '×'

const ZERO_TEXT = (0).toLocaleString()

// ---------------------------------------------------------------- DOM helpers

function requireEl<E extends Element>(root: ParentNode, selector: string): E {
  const el = root.querySelector<E>(selector)
  if (el === null) throw new Error(`no element matched "${selector}"`)
  return el
}

function byName(name: string): HTMLElement {
  return requireEl<HTMLElement>(document, aeSelector(name))
}

function byId(id: string): HTMLElement {
  return requireEl<HTMLElement>(document, `#${id}`)
}

function textOf(el: Element): string {
  return el.textContent ?? ''
}

/**
 * `ae.settled()` advances on `setTimeout`, so under fake timers the clock has
 * to be pumped for it to resolve. Advancing by zero drains the pending hops
 * without moving the demo's own schedule.
 */
async function settle(): Promise<void> {
  const done = ae.settled()
  if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0)
  await done
}

/** Stubs a global on both the module scope and `window`, which the modules use
 * interchangeably (`IntersectionObserver` bare, `window.matchMedia` qualified). */
function defineGlobal(name: string, value: unknown): void {
  for (const target of new Set<object>([globalThis, window])) {
    Object.defineProperty(target, name, { value, configurable: true, writable: true })
  }
}

function removeGlobal(name: string): void {
  for (const target of new Set<object>([globalThis, window])) {
    Reflect.deleteProperty(target, name)
  }
}

// ------------------------------------------------------------------- fixtures

function navFixture(): string {
  return `
    <button ${aeAttr(AE.navToggle)}>Menu</button>
    <nav ${aeAttr(AE.navPanel)} hidden>
      <a id="${ID.panelLink}" href="${PANEL_LINK_HREF}">Features</a>
      <span id="${ID.panelText}">Jump to</span>
    </nav>
  `
}

function copyFixture(): string {
  return `
    <button ${aeAttr(AE.copyInstall)} ${DATA_ATTR.clipboard}="${INSTALL_COMMAND}">
      <span ${aeAttr(AE.copyLabel)}></span>
    </button>
  `
}

function demoFixture(): string {
  const nodes = DEMO_NODES.map(
    (node) => `<div ${aeAttr(AE.demoNode)} ${DATA_ATTR.nodeId}="${node.id}"></div>`,
  ).join('')
  const edges = DEMO_EDGES.map(
    (edge) => `<div ${aeAttr(AE.demoEdge)} ${DATA_ATTR.edgeId}="${edge.id}"></div>`,
  ).join('')
  const parts = Object.values(LOG_PART)
    .map((part) => `<span ${aeAttr(part)}></span>`)
    .join('')

  return `
    <div>${nodes}${edges}</div>
    <p ${aeAttr(AE.demoStatus)}></p>
    <p ${aeAttr(AE.demoCounter)}></p>
    <ul ${aeAttr(AE.demoLog)}>
      <template><${LOG_ROW_TAG}>${parts}</${LOG_ROW_TAG}></template>
    </ul>
    <button ${aeAttr(AE.runDemo)}>Run</button>
    <button ${aeAttr(AE.resetDemo)}>Reset</button>
  `
}

// ------------------------------------------------------------------- stubbing

interface FakeIntersection {
  /** Reports the observed element as visible, as a real scroll would. */
  enter: () => void
  disconnected: boolean
}

/**
 * jsdom ships no `IntersectionObserver`, and `initDemo` silently skips its
 * auto-run when the constructor is missing. Stubbing one keeps the tests
 * honest about which path they exercise: nothing fires until `enter()` is
 * called, so every other test still drives the demo through its buttons.
 */
function stubIntersectionObserver(): FakeIntersection[] {
  const created: FakeIntersection[] = []

  class FakeObserver {
    private readonly record: FakeIntersection

    constructor(callback: (entries: { isIntersecting: boolean }[]) => void, _options?: unknown) {
      this.record = {
        enter: () => callback([{ isIntersecting: true }]),
        disconnected: false,
      }
      created.push(this.record)
    }

    observe(): void {}
    disconnect(): void {
      this.record.disconnected = true
    }
  }

  defineGlobal(GLOBAL.intersectionObserver, FakeObserver)
  return created
}

/** jsdom has no `matchMedia` at all, so the demo reads "no preference" by
 * default and only the reduced-motion path needs a stub. */
function stubReducedMotion(): void {
  defineGlobal(GLOBAL.matchMedia, (media: string) => ({ media, matches: true }))
}

/** `navigator.clipboard` is undefined outside a secure context, and jsdom never
 * provides it — the module under test treats both the same way. */
function stubClipboard() {
  const writeText = vi.fn(async (_text: string): Promise<void> => {})
  Object.defineProperty(navigator, CLIPBOARD_PROP, { value: { writeText }, configurable: true })
  return writeText
}

// ------------------------------------------------------------- demo assertions

function nodeEl(id: string): HTMLElement {
  return requireEl<HTMLElement>(document, `${aeSelector(AE.demoNode)}[${DATA_ATTR.nodeId}="${id}"]`)
}

function edgeEl(id: string): HTMLElement {
  return requireEl<HTMLElement>(document, `${aeSelector(AE.demoEdge)}[${DATA_ATTR.edgeId}="${id}"]`)
}

function expectState(id: string, state: NodeState): void {
  const classes = nodeEl(id).classList
  for (const [candidate, className] of Object.entries(NODE_STATE_CLASS)) {
    expect(classes.contains(className)).toBe(candidate === state)
  }
}

function expectEveryNode(state: NodeState): void {
  for (const node of DEMO_NODES) expectState(node.id, state)
}

/** Edges paint from their target node, so `undefined` means "neither class". */
function expectEveryEdge(state: NodeState | undefined): void {
  for (const edge of DEMO_EDGES) {
    const classes = edgeEl(edge.id).classList
    expect(classes.contains(EDGE_CLASS.active)).toBe(state === NODE_STATE.running)
    expect(classes.contains(EDGE_CLASS.done)).toBe(state === NODE_STATE.success)
  }
}

function hasState(id: string, state: NodeState): boolean {
  return nodeEl(id).classList.contains(NODE_STATE_CLASS[state])
}

function successIds(): Set<string> {
  return new Set(DEMO_NODES.filter((node) => hasState(node.id, NODE_STATE.success)).map((n) => n.id))
}

function logRows(): HTMLElement[] {
  return [...byName(AE.demoLog).querySelectorAll<HTMLElement>(LOG_ROW_TAG)]
}

function partOf(row: HTMLElement, part: string): string {
  return textOf(requireEl(row, aeSelector(part)))
}

/** Order the demo completes nodes in: level by level, in level order. */
function completionOrder(): string[] {
  return DEMO_LEVELS.flat()
}

function sampleOf(seenAt: Map<string, number>, id: string): number {
  const sample = seenAt.get(id)
  if (sample === undefined) throw new Error(`node "${id}" never reached success`)
  return sample
}

/**
 * A whole level must land in an earlier sample than any node of the next one.
 *
 * Strictly earlier, not merely not-later: comparing sample numbers rather than
 * a completion sequence is what makes an "everything succeeds in one tick"
 * regression fail here, since that keeps dependency order intact by accident.
 */
function expectLevelOrder(seenAt: Map<string, number>): void {
  let previousLast = -1
  for (const level of DEMO_LEVELS) {
    const samples = level.map((id) => sampleOf(seenAt, id))
    expect(Math.min(...samples)).toBeGreaterThan(previousLast)
    previousLast = Math.max(...samples)
  }
}

function mountDemo(): void {
  document.body.innerHTML = demoFixture()
  initDemo()
}

interface RunTrace {
  /** Node id → number of the sample it was first seen successful in. */
  seenAt: Map<string, number>
  sawRunning: boolean
}

/**
 * Runs the demo to completion on the fake clock, sampling the canvas as it goes
 * so the walk itself is asserted, not just the end state. Every sample checks
 * the two invariants the schedule exists to uphold: nothing succeeds, and
 * nothing is even in flight, before everything it depends on has succeeded.
 */
async function runToCompletion(): Promise<RunTrace> {
  const seenAt = new Map<string, number>()
  let sawRunning = false

  byName(AE.runDemo).click()

  let sample = 0
  for (let elapsed = 0; elapsed <= RUN_DURATION_MS; elapsed += SAMPLE_MS) {
    await vi.advanceTimersByTimeAsync(SAMPLE_MS)
    await settle()

    const done = successIds()
    for (const node of DEMO_NODES) {
      if (hasState(node.id, NODE_STATE.running)) {
        sawRunning = true
        for (const dependency of node.dependsOn) expect(done).toContain(dependency)
      }
      if (!done.has(node.id)) continue
      for (const dependency of node.dependsOn) expect(done).toContain(dependency)
      if (!seenAt.has(node.id)) seenAt.set(node.id, sample)
    }
    sample += 1
  }

  return { seenAt, sawRunning }
}

// ----------------------------------------------------------------------- specs

beforeEach(() => {
  // See the file header: a fresh body is what keeps the previous test's
  // bindings from reaching this test's elements.
  document.body = document.createElement('body')
})

afterEach(() => {
  vi.useRealTimers()
  removeGlobal(GLOBAL.matchMedia)
  removeGlobal(GLOBAL.intersectionObserver)
  Reflect.deleteProperty(navigator, CLIPBOARD_PROP)
})

describe('nav', () => {
  function mountNav(): { toggle: HTMLElement; panel: HTMLElement } {
    document.body.innerHTML = navFixture()
    initNav()
    return { toggle: byName(AE.navToggle), panel: byName(AE.navPanel) }
  }

  const ARIA_EXPANDED = 'aria-expanded'
  const HIDDEN = 'hidden'

  it('opens and closes the panel from the toggle', async () => {
    const { toggle, panel } = mountNav()
    await settle()

    expect(toggle.getAttribute(ARIA_EXPANDED)).toBe(String(false))
    expect(panel.hasAttribute(HIDDEN)).toBe(true)

    toggle.click()
    await settle()
    expect(toggle.getAttribute(ARIA_EXPANDED)).toBe(String(true))
    expect(panel.hasAttribute(HIDDEN)).toBe(false)

    toggle.click()
    await settle()
    expect(toggle.getAttribute(ARIA_EXPANDED)).toBe(String(false))
    expect(panel.hasAttribute(HIDDEN)).toBe(true)
  })

  it('closes when a link inside the panel is followed', async () => {
    const { toggle, panel } = mountNav()
    toggle.click()
    await settle()

    byId(ID.panelLink).click()
    await settle()

    expect(panel.hasAttribute(HIDDEN)).toBe(true)
    expect(toggle.getAttribute(ARIA_EXPANDED)).toBe(String(false))
  })

  it('stays open when non-link content inside the panel is clicked', async () => {
    const { toggle, panel } = mountNav()
    toggle.click()
    await settle()

    byId(ID.panelText).click()
    await settle()

    expect(panel.hasAttribute(HIDDEN)).toBe(false)
    expect(toggle.getAttribute(ARIA_EXPANDED)).toBe(String(true))
  })
})

describe('copy', () => {
  function mountCopy(): { button: HTMLElement; label: HTMLElement } {
    document.body.innerHTML = copyFixture()
    initCopy()
    return { button: byName(AE.copyInstall), label: byName(AE.copyLabel) }
  }

  it('writes the button’s clipboard payload and confirms, then reverts', async () => {
    vi.useFakeTimers()
    const writeText = stubClipboard()
    const { button, label } = mountCopy()
    await settle()

    expect(textOf(label)).toBe(COPY_LABEL.idle)

    button.click()
    await settle()

    expect(writeText).toHaveBeenCalledWith(INSTALL_COMMAND)
    expect(textOf(label)).toBe(COPY_LABEL.done)

    await vi.advanceTimersByTimeAsync(COPY_FEEDBACK_MS)
    await settle()
    expect(textOf(label)).toBe(COPY_LABEL.idle)
  })

  it('keeps confirming for the full feedback window', async () => {
    vi.useFakeTimers()
    stubClipboard()
    const { button, label } = mountCopy()

    button.click()
    await settle()
    await vi.advanceTimersByTimeAsync(COPY_FEEDBACK_MS - 1)
    await settle()

    expect(textOf(label)).toBe(COPY_LABEL.done)
  })

  it('falls back to the manual label when the clipboard rejects', async () => {
    vi.useFakeTimers()
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)

    try {
      const writeText = stubClipboard()
      writeText.mockRejectedValue(new Error('denied'))
      const { button, label } = mountCopy()

      button.click()
      await settle()
      expect(textOf(label)).toBe(COPY_LABEL.failed)

      await vi.advanceTimersByTimeAsync(COPY_FEEDBACK_MS)
      await settle()
      expect(textOf(label)).toBe(COPY_LABEL.idle)
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })
})

describe('demo', () => {
  let observers: FakeIntersection[] = []

  beforeEach(() => {
    observers = stubIntersectionObserver()
  })

  it('paints every node idle before a run', async () => {
    mountDemo()
    await settle()

    expectEveryNode(NODE_STATE.idle)
    expectEveryEdge(undefined)
    expect(textOf(byName(AE.demoCounter))).toBe(ZERO_TEXT)
    expect(logRows()).toHaveLength(0)
    expect(observers).toHaveLength(1)
  })

  it('never marks a node successful before the nodes it depends on', async () => {
    vi.useFakeTimers()
    mountDemo()
    await settle()

    const { seenAt, sawRunning } = await runToCompletion()

    // Without an observed running phase the walk would be indistinguishable
    // from the reduced-motion shortcut, and the sampling would prove nothing.
    expect(sawRunning).toBe(true)
    expect(seenAt.size).toBe(DEMO_NODES.length)
    expectLevelOrder(seenAt)

    expectEveryNode(NODE_STATE.success)
    expectEveryEdge(NODE_STATE.success)
  })

  it('counts every record and caps the log at its newest rows', async () => {
    vi.useFakeTimers()
    mountDemo()
    await settle()

    const idleStatus = textOf(byName(AE.demoStatus))
    await runToCompletion()

    expect(textOf(byName(AE.demoCounter))).toBe(DEMO_TOTAL_RECORDS.toLocaleString())
    expect(textOf(byName(AE.demoStatus))).not.toBe(idleStatus)
    expect(textOf(byName(AE.demoStatus))).toContain(DEMO_TOTAL_RECORDS.toLocaleString())

    // More nodes complete than the log keeps, so the cap is really exercised.
    expect(DEMO_NODES.length).toBeGreaterThan(MAX_LOG_ROWS)

    const rows = logRows()
    expect(rows).toHaveLength(MAX_LOG_ROWS)

    const newestFirst = [...completionOrder()].reverse().slice(0, MAX_LOG_ROWS)
    const byIdMap = new Map(DEMO_NODES.map((node) => [node.id, node]))
    expect(rows.map((row) => partOf(row, LOG_PART.path))).toEqual(
      newestFirst.map((id) => byIdMap.get(id)?.path),
    )

    const [newestRow] = rows
    const newestNode = byIdMap.get(newestFirst[0] ?? '')
    if (newestRow === undefined || newestNode === undefined) throw new Error('no log rows stamped')

    expect(partOf(newestRow, LOG_PART.method)).toBe(newestNode.method)
    expect(partOf(newestRow, LOG_PART.count)).toBe(`${COUNT_PREFIX}${newestNode.repeat}`)
    expect(partOf(newestRow, LOG_PART.duration)).toMatch(DURATION_TEXT)

    const status = Number(partOf(newestRow, LOG_PART.status))
    expect(status).toBeGreaterThanOrEqual(HTTP_OK)
    expect(status).toBeLessThan(HTTP_REDIRECT)
  })

  it('returns to idle with a zero counter on reset', async () => {
    vi.useFakeTimers()
    mountDemo()
    await settle()
    await runToCompletion()

    byName(AE.resetDemo).click()
    await settle()

    expectEveryNode(NODE_STATE.idle)
    expectEveryEdge(undefined)
    expect(textOf(byName(AE.demoCounter))).toBe(ZERO_TEXT)
    expect(logRows()).toHaveLength(0)
  })

  it('finishes without the clock when reduced motion is preferred', async () => {
    stubReducedMotion()
    mountDemo()
    await settle()

    // Real timers on purpose: nothing may depend on a dwell elapsing.
    byName(AE.runDemo).click()
    await settle()

    expectEveryNode(NODE_STATE.success)
    expect(textOf(byName(AE.demoCounter))).toBe(DEMO_TOTAL_RECORDS.toLocaleString())
    expect(logRows()).toHaveLength(MAX_LOG_ROWS)
  })

  it('auto-runs once when the canvas scrolls into view', async () => {
    stubReducedMotion()
    mountDemo()
    await settle()

    const [observer] = observers
    if (observer === undefined) throw new Error('the demo observed nothing')

    observer.enter()
    await settle()

    expect(observer.disconnected).toBe(true)
    expectEveryNode(NODE_STATE.success)
    expect(textOf(byName(AE.demoCounter))).toBe(DEMO_TOTAL_RECORDS.toLocaleString())
  })
})
