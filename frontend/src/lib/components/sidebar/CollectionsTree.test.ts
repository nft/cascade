import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { demoCollection } from '../../mock'
import type { HttpNode } from '../../model'
import { app } from '../../state.svelte'
import CollectionsTree from './CollectionsTree.svelte'

let instance: ReturnType<typeof mount> | null = null

function mountTree(query = '') {
  document.body.innerHTML = ''
  instance = mount(CollectionsTree, { target: document.body, props: { query } })
  flushSync()
}

const rowByText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes(text),
  )

beforeEach(() => {
  app.nodes = []
  app.edges = []
  app.project = {
    project: { id: 'test-project', name: 'Test', defaults: { environment: 'staging', credential: 'admin' } },
    sources: [],
    environments: [],
    credentials: [],
    boards: [],
    collections: [structuredClone(demoCollection)],
  }
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
})

describe('CollectionsTree (plan 08 B2)', () => {
  it('renders collections, folders and requests as an expanded tree', () => {
    mountTree()
    expect(document.body.textContent).toContain('Internal APIs')
    expect(document.body.textContent).toContain('Billing')
    expect(document.body.textContent).toContain('Health check')
    expect(document.body.textContent).toContain('Create invoice')
  })

  it('clicking an http request adds a node with a requestRef; ws rows are disabled', () => {
    mountTree()
    rowByText('Create invoice')!.click()
    flushSync()
    expect(app.nodes).toHaveLength(1)
    const node = app.nodes[0] as HttpNode
    expect(node.data.requestRef).toEqual({
      collectionId: demoCollection.id,
      requestId: 'create-invoice',
    })
    expect(node.data.fields.map((f) => f.key)).toEqual(['body.amount', 'body.currency'])

    const wsRow = rowByText('Invoice events')!
    expect(wsRow.disabled).toBe(true)
  })

  it('collapsing a collection hides its rows', () => {
    mountTree()
    rowByText('Internal APIs')!.click()
    flushSync()
    expect(document.body.textContent).not.toContain('Create invoice')
  })

  it('search flattens the tree to matching requests', () => {
    mountTree('invoice')
    expect(document.body.textContent).toContain('Create invoice')
    expect(document.body.textContent).not.toContain('Health check')
  })

  it('New collection creates one and opens inline rename', () => {
    mountTree()
    rowByText('New collection')!.click()
    flushSync()
    expect(app.collections).toHaveLength(2)
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Rename"]')!
    expect(input.value).toBe('New collection')
    input.value = 'Payments'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    flushSync()
    expect(app.collections[1].name).toBe('Payments')
  })

  it('right-click opens the row menu; delete is two-step', () => {
    mountTree()
    rowByText('Health check')!.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }),
    )
    flushSync()
    const menu = document.querySelector('[data-testid="library-menu"]')!
    expect(menu).not.toBeNull()

    const del = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) =>
      b.textContent?.includes('Delete'),
    )!
    del.click()
    flushSync()
    expect(del.textContent).toContain('Really delete?')
    expect(app.collections[0].root.requests).toHaveLength(1) // still there

    del.click()
    flushSync()
    expect(app.collections[0].root.requests).toHaveLength(0)
  })
})
