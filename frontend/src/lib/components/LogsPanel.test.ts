import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ForLogEntry, HttpLogEntry } from '../model'
import { app } from '../state.svelte'
import LogsPanel from './LogsPanel.svelte'

let instance: ReturnType<typeof mount> | null = null

const mkEntry = (id: string, nodeId: string, node: string): HttpLogEntry => ({
  kind: 'http',
  id,
  runId: 'run-1',
  time: '12:00:00.000',
  node,
  nodeId,
  method: 'GET',
  url: `https://api.example.com/${node}`,
  status: 200,
  durationMs: 42,
})

const rowFor = (node: string) =>
  [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')].find((r) =>
    r.textContent?.includes(node),
  )!

const clearButton = () => document.querySelector<HTMLButtonElement>('[aria-label="Clear logs"]')!

beforeEach(() => {
  document.body.innerHTML = ''
  app.logs = [mkEntry('l1', 'n1', 'alpha'), mkEntry('l2', 'n2', 'beta')]
  app.logsOpen = true
  app.logHoverNodeId = null
  instance = mount(LogsPanel, { target: document.body })
  flushSync()
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
  app.logs = []
  app.logHoverNodeId = null
})

describe('LogsPanel hover highlight', () => {
  it('sets logHoverNodeId on row enter and clears it on leave', () => {
    rowFor('alpha').dispatchEvent(new Event('pointerenter'))
    flushSync()
    expect(app.logHoverNodeId).toBe('n1')
    rowFor('alpha').dispatchEvent(new Event('pointerleave'))
    flushSync()
    expect(app.logHoverNodeId).toBe(null)
  })

  it('clears a highlight whose row was filtered away (no pointerleave fires)', () => {
    rowFor('beta').dispatchEvent(new Event('pointerenter'))
    flushSync()
    expect(app.logHoverNodeId).toBe('n2')
    const search = document.querySelector<HTMLInputElement>('input[placeholder^="Filter"]')!
    search.value = 'alpha'
    search.dispatchEvent(new Event('input'))
    flushSync()
    expect(app.logHoverNodeId).toBe(null)
  })

  it('clears the highlight when the panel collapses', () => {
    rowFor('alpha').dispatchEvent(new Event('pointerenter'))
    flushSync()
    app.logsOpen = false
    flushSync()
    expect(app.logHoverNodeId).toBe(null)
    app.logsOpen = true
  })
})

describe('LogsPanel clear button', () => {
  it('empties the table on click and resets the hover highlight', () => {
    rowFor('alpha').dispatchEvent(new Event('pointerenter'))
    flushSync()
    clearButton().click()
    flushSync()
    expect(app.logs).toEqual([])
    expect(app.logHoverNodeId).toBe(null)
    expect(document.querySelectorAll('tbody tr')).toHaveLength(1) // the empty-state row
  })

  it('is disabled when there is nothing to clear', () => {
    expect(clearButton().disabled).toBe(false)
    app.logs = []
    flushSync()
    expect(clearButton().disabled).toBe(true)
  })
})

describe('LogsPanel collapse/expand buttons', () => {
  it('collapses via the header minus button and expands back', () => {
    document.querySelector<HTMLButtonElement>('[aria-label="Collapse logs"]')!.click()
    flushSync()
    expect(app.logsOpen).toBe(false)
    expect(document.querySelector('tbody')).toBe(null)
    document.querySelector<HTMLButtonElement>('[aria-label="Expand logs"]')!.click()
    flushSync()
    expect(app.logsOpen).toBe(true)
    expect(document.querySelector('tbody')).not.toBe(null)
  })
})

describe('LogsPanel rows with no status', () => {
  // A call that never reached a server has no status, and `undefined >= 400`
  // is false — testing the status alone would file the most common real-run
  // failure under "success", in the success colour and hidden by the filter.
  const refused: HttpLogEntry = {
    ...mkEntry('l1', 'n1', 'createUser'),
    status: undefined,
    error: 'dial tcp 127.0.0.1:9999: connection refused',
  }

  it('renders a transport failure as failed and keeps it in the failed filter', () => {
    app.logs = [refused]
    flushSync()
    const row = rowFor('createUser')
    expect(row.textContent).toContain('failed')
    expect(row.className).toContain('bg-rose-500/5')

    const filter = document.querySelector('select') as HTMLSelectElement
    filter.value = 'success'
    filter.dispatchEvent(new Event('change'))
    flushSync()
    expect(document.body.textContent).not.toContain('createUser')
  })

  it('shows no iteration chip outside a loop', () => {
    app.logs = [mkEntry('l1', 'n1', 'createUser')]
    flushSync()
    expect(rowFor('createUser').textContent).not.toContain('#')
  })
})

describe('LogsPanel loop rows', () => {
  const summary: ForLogEntry = {
    kind: 'for',
    id: 'f1',
    runId: 'run-1',
    time: '12:00:01.000',
    node: 'Seed Users',
    nodeId: 'loop',
    durationMs: 1200,
    iterations: 2,
  }

  it('labels iteration rows with a 1-based #k chip', () => {
    app.logs = [{ ...mkEntry('l1', 'n1', 'createUser'), iteration: 2 }]
    flushSync()
    expect(rowFor('createUser').textContent).toContain('#3')
  })

  it('renders the for summary row with iteration count and ok/failed state', () => {
    app.logs = [summary]
    flushSync()
    const row = rowFor('Seed Users')
    expect(row.textContent).toContain('loop')
    expect(row.textContent).toContain('2 iterations')
    expect(row.textContent).toContain('ok')

    app.logs = [{ ...summary, iterations: 1, error: 'iteration 1 failed' }]
    flushSync()
    const failedRow = rowFor('Seed Users')
    expect(failedRow.textContent).toContain('1 iteration')
    expect(failedRow.textContent).toContain('failed')
  })

  it('the failed-only status filter keeps an errored loop summary', () => {
    app.logs = [summary, { ...summary, id: 'f2', node: 'Broken Loop', error: 'boom' }]
    flushSync()
    const filter = document.querySelector('select') as HTMLSelectElement
    filter.value = 'failed'
    filter.dispatchEvent(new Event('change'))
    flushSync()
    const rows = [...document.querySelectorAll('tbody tr')].map((r) => r.textContent)
    expect(rows.some((t) => t?.includes('Broken Loop'))).toBe(true)
    expect(rows.some((t) => t?.includes('Seed Users'))).toBe(false)
  })
})
