import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HttpLogEntry } from '../model'
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

describe('LogsPanel hover highlight (plan 10 §2)', () => {
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

describe('LogsPanel clear button (plan 10 §1)', () => {
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
