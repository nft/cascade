import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { api } from '../../api'
import { dialogs, type EnvironmentDialogContext } from '../../dialogs.svelte'
import type { EnvironmentDef } from '../../model'
import { app } from '../../state.svelte'
import EnvironmentDialog from './EnvironmentDialog.svelte'

const existing: EnvironmentDef = { name: 'staging', baseUrl: 'https://staging.example.com' }

let instance: ReturnType<typeof mount> | null = null

function mountDialog(context: EnvironmentDialogContext) {
  document.body.innerHTML = ''
  dialogs.environment = context
  instance = mount(EnvironmentDialog, { target: document.body, props: { context } })
  flushSync()
}

const inputByPlaceholder = (placeholder: string) =>
  document.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)
const nameInput = () => inputByPlaceholder('staging')!
const baseUrlInput = () => inputByPlaceholder('https://staging.api.example.com')!
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
  // A macrotask outlasts the save's chained awaits (list, then defaults).
  await new Promise((resolve) => setTimeout(resolve, 0))
  flushSync()
}

beforeEach(async () => {
  const [info] = await api.listProjects()
  app.nodes = []
  app.edges = []
  app.project = {
    project: { id: info.id, name: info.name, defaults: {} },
    sources: [],
    environments: [structuredClone(existing)],
    credentials: [],
    boards: [],
    collections: [],
  }
  await api.saveEnvironments(info.id, [existing])
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
  dialogs.environment = null
})

describe('EnvironmentDialog', () => {
  it('creates an environment and claims the project default', async () => {
    app.project!.environments = []
    mountDialog({ mode: 'create' })

    setValue(nameInput(), 'local')
    setValue(baseUrlInput(), 'http://localhost:8080/')
    buttonByText('Save')!.click()
    await settle()

    // The trailing slash goes: joinUrl would otherwise double it at the seam.
    expect(app.environments).toEqual([{ name: 'local', baseUrl: 'http://localhost:8080' }])
    // The first environment becomes the default, so the next node has a target.
    expect(app.project?.project.defaults).toEqual({ environment: 'local' })
    expect(dialogs.environment).toBeNull()
  })

  it('keeps a path prefix — node paths are joined onto the base', async () => {
    app.project!.environments = []
    mountDialog({ mode: 'create' })

    setValue(nameInput(), 'api')
    setValue(baseUrlInput(), 'https://api.example.com/v1')
    buttonByText('Save')!.click()
    await settle()

    expect(app.environments[0].baseUrl).toBe('https://api.example.com/v1')
  })

  it('refuses a relative base URL', () => {
    app.project!.environments = []
    mountDialog({ mode: 'create' })

    setValue(nameInput(), 'local')
    setValue(baseUrlInput(), 'localhost:8080')
    expect(buttonByText('Save')!.disabled).toBe(true)
    expect(document.body.textContent).toContain('must be absolute')
  })

  it('refuses a duplicate name before saving', () => {
    mountDialog({ mode: 'create' })

    setValue(nameInput(), 'staging')
    setValue(baseUrlInput(), 'https://other.example.com')
    expect(buttonByText('Save')!.disabled).toBe(true)
    expect(document.body.textContent).toContain('already exists')
  })

  it('edit mode repopulates both fields and locks the name', async () => {
    mountDialog({ mode: 'edit', name: 'staging' })

    expect(nameInput().value).toBe('staging')
    expect(nameInput().disabled).toBe(true) // nodes reference by name
    expect(baseUrlInput().value).toBe('https://staging.example.com')

    setValue(baseUrlInput(), 'https://staging-2.example.com')
    buttonByText('Save')!.click()
    await settle()

    // Edited in place rather than appended — the name is the identity.
    expect(app.environments).toEqual([
      { name: 'staging', baseUrl: 'https://staging-2.example.com' },
    ])
  })
})
