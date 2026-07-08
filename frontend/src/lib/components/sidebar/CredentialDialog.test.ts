import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { dialogs, type CredentialDialogContext } from '../../dialogs.svelte'
import type { CredentialDef } from '../../model'
import { app } from '../../state.svelte'
import CredentialDialog from './CredentialDialog.svelte'

const existing: CredentialDef = {
  name: 'internal',
  kind: 'header',
  header: 'X-Internal-Token',
  template: 'Token {secret}',
  createdAt: '2026-01-01T00:00:00Z',
}

let instance: ReturnType<typeof mount> | null = null

function mountDialog(context: CredentialDialogContext) {
  document.body.innerHTML = ''
  dialogs.credential = context
  instance = mount(CredentialDialog, { target: document.body, props: { context } })
  flushSync()
}

const secretInput = () => document.querySelector<HTMLInputElement>('input[type="password"]')
const inputByPlaceholder = (placeholder: string) =>
  document.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)
const buttonByText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === text,
  )

function setValue(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  flushSync()
}

async function settle() {
  // A macrotask outlasts the save's chained awaits (metadata, then secret).
  await new Promise((resolve) => setTimeout(resolve, 0))
  flushSync()
}

beforeEach(async () => {
  // Register the project with the in-memory api so credential saves persist.
  const [info] = await api.listProjects()
  app.nodes = []
  app.edges = []
  app.project = {
    project: { id: info.id, name: info.name, defaults: {} },
    sources: [],
    environments: [],
    credentials: [structuredClone(existing)],
    boards: [],
    collections: [],
  }
  await api.saveCredentials(info.id, [existing])
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
  dialogs.credential = null
})

describe('CredentialDialog', () => {
  it('creates a header credential and stores the secret write-only', async () => {
    mountDialog({ mode: 'create' })
    const spy = vi.spyOn(api, 'setCredentialSecret')

    setValue(inputByPlaceholder('internal')!, 'new-cred')
    const kind = document.querySelector<HTMLSelectElement>('select')!
    kind.value = 'header'
    kind.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()
    setValue(inputByPlaceholder('X-Internal-Token')!, 'X-Api-Key')
    setValue(inputByPlaceholder('Token {secret}')!, 'Key {secret}')

    // The live preview reflects the draft with the secret masked.
    expect(document.querySelector('code')?.textContent).toContain('X-Api-Key: Key ••••••')

    const save = buttonByText('Save')!
    expect(save.disabled).toBe(true) // no secret entered yet
    setValue(secretInput()!, 's3cret-v4lue')
    expect(save.disabled).toBe(false)
    save.click()
    await settle()

    expect(app.credentials.map((c) => c.name)).toContain('new-cred')
    const saved = app.credentials.find((c) => c.name === 'new-cred')!
    expect(saved).toMatchObject({ kind: 'header', header: 'X-Api-Key', template: 'Key {secret}' })
    expect(spy).toHaveBeenCalledWith(app.projectId, 'new-cred', 's3cret-v4lue')
    expect(dialogs.credential).toBeNull()
    // The metadata never carries the value under any key.
    expect(JSON.stringify(app.credentials)).not.toContain('s3cret-v4lue')
    spy.mockRestore()
  })

  it('edit mode has no secret field — a saved value never repopulates', () => {
    mountDialog({ mode: 'edit', name: 'internal' })
    expect(secretInput()).toBeNull()
    const name = inputByPlaceholder('internal')!
    expect(name.value).toBe('internal')
    expect(name.disabled).toBe(true) // nodes reference by name
    expect(inputByPlaceholder('X-Internal-Token')!.value).toBe('X-Internal-Token')
  })

  it('rotate mode shows only an empty secret input', async () => {
    mountDialog({ mode: 'rotate', name: 'internal' })
    const spy = vi.spyOn(api, 'setCredentialSecret')

    const input = secretInput()!
    expect(input.value).toBe('')
    expect(inputByPlaceholder('internal')).toBeNull() // no metadata fields
    expect(buttonByText('Save')!.disabled).toBe(true)
    setValue(input, 'rotated-value')
    buttonByText('Save')!.click()
    await settle()

    expect(spy).toHaveBeenCalledWith(app.projectId, 'internal', 'rotated-value')
    expect(dialogs.credential).toBeNull()
    spy.mockRestore()
  })

  it('rejects a duplicate name before saving', () => {
    mountDialog({ mode: 'create' })
    setValue(inputByPlaceholder('internal')!, 'internal')
    setValue(secretInput()!, 'whatever')
    expect(buttonByText('Save')!.disabled).toBe(true)
    expect(document.body.textContent).toContain('already exists')
  })
})
