import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dialogs, type RequestEditorContext } from '../../dialogs.svelte'
import { demoCollection } from '../../mock'
import { app } from '../../state.svelte'
import RequestEditorDialog from './RequestEditorDialog.svelte'

let instance: ReturnType<typeof mount> | null = null

function mountDialog(context: RequestEditorContext) {
  document.body.innerHTML = ''
  dialogs.requestEditor = context
  instance = mount(RequestEditorDialog, { target: document.body, props: { context } })
  flushSync()
}

const byLabel = <T extends HTMLElement>(label: string) =>
  document.querySelector<T>(`[aria-label="${label}"]`)

const buttonByText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === text,
  )

function setInput(el: HTMLInputElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  flushSync()
}

beforeEach(() => {
  app.nodes = []
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
  dialogs.requestEditor = null
})

describe('RequestEditorDialog (plan 08 C7)', () => {
  it('creates a new request in the target folder, ws stays disabled', () => {
    mountDialog({ collectionId: demoCollection.id, folderId: 'billing' })
    expect(document.body.textContent).toContain('New request')
    const ws = buttonByText('ws')!
    expect(ws.disabled).toBe(true)

    const save = buttonByText('Add to collection')!
    expect(save.disabled).toBe(true) // name and url still empty

    const name = document.querySelector<HTMLInputElement>('input[placeholder="Create invoice"]')!
    setInput(name, 'Refund invoice')
    setInput(byLabel<HTMLInputElement>('Request URL')!, '/v1/refunds')
    expect(save.disabled).toBe(false)
    save.click()
    flushSync()

    const billing = app.collections[0].root.folders?.find((f) => f.id === 'billing')
    const created = billing?.requests.find((r) => r.name === 'Refund invoice')
    expect(created).toBeDefined()
    expect(created?.protocol).toBe('http')
    expect(created?.url).toBe('/v1/refunds')
    expect(dialogs.requestEditor).toBeNull()
  })

  it('adding a field in a section stores an auto-prefixed literal default', () => {
    mountDialog({ collectionId: demoCollection.id, folderId: 'root' })
    setInput(document.querySelector<HTMLInputElement>('input[placeholder="Create invoice"]')!, 'Ping')
    setInput(byLabel<HTMLInputElement>('Request URL')!, '/ping')

    const headersTab = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) =>
      b.textContent?.includes('Headers'),
    )!
    headersTab.click()
    flushSync()
    const add = document.querySelector<HTMLInputElement>('input[placeholder*="X-Api-Key"]')!
    setInput(add, 'X-Debug')
    add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    flushSync()

    buttonByText('Add to collection')!.click()
    flushSync()
    const created = app.collections[0].root.requests.find((r) => r.name === 'Ping')
    expect(created?.defaults).toEqual([{ key: 'header.X-Debug', source: 'literal', value: '' }])
  })

  it('editing an existing request prefills the draft and replaces it in place', () => {
    mountDialog({
      collectionId: demoCollection.id,
      folderId: 'billing',
      requestId: 'create-invoice',
    })
    expect(document.body.textContent).toContain('Edit request')
    const name = document.querySelector<HTMLInputElement>('input[placeholder="Create invoice"]')!
    expect(name.value).toBe('Create invoice')
    expect(byLabel<HTMLSelectElement>('HTTP method')!.value).toBe('POST')

    setInput(byLabel<HTMLInputElement>('Request URL')!, '/v2/invoices')
    buttonByText('Save changes')!.click()
    flushSync()

    const billing = app.collections[0].root.folders?.find((f) => f.id === 'billing')
    const updated = billing?.requests.find((r) => r.id === 'create-invoice')
    expect(updated?.url).toBe('/v2/invoices')
    expect(updated?.defaults).toEqual([
      { key: 'body.amount', source: 'literal', value: '100' },
      { key: 'body.currency', source: 'literal', value: 'EUR' },
    ])
    expect(billing?.requests).toHaveLength(2) // replaced, not duplicated
  })
})
