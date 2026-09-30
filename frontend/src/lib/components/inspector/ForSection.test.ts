import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FOR_MAX_ITERATIONS, FOR_MIN_COUNT, type AppNode, type ForNode } from '../../model'
import { app } from '../../state.svelte'
import Inspector from '../Inspector.svelte'

const mkMock = (id: string, key: string): AppNode => ({
  id,
  type: 'mock',
  position: { x: 0, y: 0 },
  data: { name: id, key, status: 'idle', body: '{}', statusCode: 200 },
})

const mkFor = (id: string): AppNode => ({
  id,
  type: 'for',
  position: { x: 0, y: 0 },
  width: 400,
  height: 240,
  data: { name: 'Seed Users', key: 'seedUsers', status: 'idle', mode: 'count', count: 3 },
})

const forNode = () => app.nodes.find((n) => n.id === 'loop') as ForNode

const buttonByText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === text,
  )!

const countInput = () =>
  document.querySelector<HTMLInputElement>('input[aria-label="Iteration count"]')!

// Svelte 5 delegates change/keydown to the component root — dispatched
// events must bubble to reach the handlers.
function setCount(value: string) {
  const input = countInput()
  input.value = value
  input.dispatchEvent(new Event('change', { bubbles: true }))
  flushSync()
}

let instance: ReturnType<typeof mount> | null = null

beforeEach(() => {
  document.body.innerHTML = ''
  app.nodes = [mkMock('seed', 'listUsers'), mkFor('loop')]
  app.edges = [{ id: 'e1', source: 'seed', target: 'loop' }]
  app.responses = {
    seed: {
      status: 200,
      body: { org: 'acme', users: [{ name: 'ada' }, { name: 'lin' }] },
      at: '2026-07-19T14:02:00Z',
    },
  }
  app.selectedNodeId = 'loop'
  instance = mount(Inspector, { target: document.body })
  flushSync()
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
  app.responses = {}
  app.selectedNodeId = null
})

describe('For inspector', () => {
  it('clamps the count field to the allowed range', () => {
    setCount('0')
    expect(forNode().data.count).toBe(FOR_MIN_COUNT)
    setCount('99999')
    expect(forNode().data.count).toBe(FOR_MAX_ITERATIONS)
  })

  it('mode toggle switches to each and shows the source picker', () => {
    expect(document.querySelector('[data-testid="for-source-picker"]')).toBeNull()
    buttonByText('each').click()
    flushSync()
    expect(forNode().data.mode).toBe('each')
    expect(document.querySelector('[data-testid="for-source-picker"]')).not.toBeNull()
    expect(countInput()).toBeNull()
  })

  it('offers only array-typed paths of the loop upstream', () => {
    buttonByText('each').click()
    flushSync()
    const picker = document.querySelector('[data-testid="for-source-picker"]')!
    const options = [...picker.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(options).toEqual(['body.users'])
    expect(picker.textContent).toContain('listUsers')
  })

  it('picking a path stores the structured source and shows it by key', () => {
    buttonByText('each').click()
    flushSync()
    buttonByText('body.users').click()
    flushSync()
    expect(forNode().data.source).toEqual({ nodeId: 'seed', path: 'body.users' })
    expect(document.body.textContent).toContain('listUsers.body.users')
  })

  it('the clear button removes the source', () => {
    app.updateNodeData('loop', { mode: 'each', source: { nodeId: 'seed', path: 'body.users' } })
    flushSync()
    const clear = document.querySelector<HTMLButtonElement>('button[aria-label="Clear source"]')!
    clear.click()
    flushSync()
    expect(forNode().data.source).toBeUndefined()
  })

  it('warns when the stored source is no longer an upstream of the loop', () => {
    app.updateNodeData('loop', { mode: 'each', source: { nodeId: 'seed', path: 'body.users' } })
    app.edges = []
    flushSync()
    expect(document.body.textContent).toContain('is not an upstream of this loop')
  })

  it('falls back to a free-text path input when the upstream has no schema', () => {
    app.responses = {}
    app.updateNodeData('loop', { mode: 'each' })
    flushSync()
    const free = document.querySelector<HTMLInputElement>(
      '[data-testid="for-source-picker"] input[placeholder^="body.path"]',
    )!
    expect(free).not.toBeNull()
    free.value = 'body.items'
    free.dispatchEvent(new Event('input', { bubbles: true }))
    free.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    flushSync()
    expect(forNode().data.source).toEqual({ nodeId: 'seed', path: 'body.items' })
  })
})
