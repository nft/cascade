import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dialogs } from '../../dialogs.svelte'
import { demoCollection } from '../../mock'
import type { HttpNode } from '../../model'
import { app } from '../../state.svelte'
import SaveToCollectionDialog from './SaveToCollectionDialog.svelte'

const node: HttpNode = {
  id: 'n1',
  type: 'http',
  position: { x: 0, y: 0 },
  data: {
    name: 'Create refund',
    key: 'createRefund',
    method: 'POST',
    path: '/v1/refunds',
    environment: 'staging',
    credential: 'staging-admin',
    status: 'idle',
    repeat: 1,
    fields: [
      { key: 'body.amount', source: 'literal', value: '50' },
      { key: 'body.invoiceId', source: 'binding', value: 'x.body.id', ref: { nodeId: 'x', path: 'body.id' } },
    ],
  },
}

let instance: ReturnType<typeof mount> | null = null

function mountDialog() {
  document.body.innerHTML = ''
  dialogs.saveToCollection = { nodeId: 'n1' }
  instance = mount(SaveToCollectionDialog, { target: document.body, props: { nodeId: 'n1' } })
  flushSync()
}

const buttonByText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === text,
  )

beforeEach(() => {
  app.nodes = [structuredClone(node)]
  app.edges = []
  app.project = {
    project: { id: 'p1', name: 'Test', defaults: {} },
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
  dialogs.saveToCollection = null
})

describe('SaveToCollectionDialog (plan 08 B3)', () => {
  it('prefills the node name and saves the stripped request into the picked folder', () => {
    mountDialog()
    const name = document.querySelector<HTMLInputElement>('input')!
    expect(name.value).toBe('Create refund')

    const folderSelect = [...document.querySelectorAll<HTMLSelectElement>('select')][1]
    folderSelect.value = 'billing'
    folderSelect.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()

    buttonByText('Save')!.click()
    flushSync()

    const billing = app.collections[0].root.folders?.find((f) => f.id === 'billing')
    const saved = billing?.requests.find((r) => r.name === 'Create refund')
    expect(saved?.url).toBe('/v1/refunds')
    // Bindings become empty literal defaults; credentials never leave the board.
    expect(saved?.defaults).toEqual([
      { key: 'body.amount', source: 'literal', value: '50' },
      { key: 'body.invoiceId', source: 'literal', value: '' },
    ])
    expect(JSON.stringify(saved)).not.toContain('staging-admin')
    const canvas = app.nodes[0] as HttpNode
    expect(canvas.data.requestRef).toEqual({
      collectionId: demoCollection.id,
      requestId: saved?.id,
    })
    expect(dialogs.saveToCollection).toBeNull()
  })

  it('can create a new collection inline and saves into its root', () => {
    mountDialog()
    const collectionSelect = document.querySelector<HTMLSelectElement>('select')!
    collectionSelect.value = '#new'
    collectionSelect.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()

    const save = buttonByText('Save')!
    expect(save.disabled).toBe(true) // new collection needs a name

    const nameInput = document.querySelector<HTMLInputElement>('input[placeholder="Payments"]')!
    nameInput.value = 'Payments'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    save.click()
    flushSync()

    expect(app.collections).toHaveLength(2)
    const created = app.collections[1]
    expect(created.name).toBe('Payments')
    expect(created.root.requests.map((r) => r.name)).toEqual(['Create refund'])
  })
})
