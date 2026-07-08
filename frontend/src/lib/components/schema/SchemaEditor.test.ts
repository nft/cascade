import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SchemaJSON } from '../../model'
import SchemaEditor from './SchemaEditor.svelte'

let instance: ReturnType<typeof mount> | null = null

function mountEditor(schema: SchemaJSON | undefined) {
  document.body.innerHTML = ''
  const onChange = vi.fn()
  instance = mount(SchemaEditor, { target: document.body, props: { schema, onChange } })
  flushSync()
  return onChange
}

const byLabel = <T extends HTMLElement>(label: string) =>
  document.querySelector<T>(`[aria-label="${label}"]`)

const buttonByText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === text,
  )

function change(el: HTMLInputElement | HTMLSelectElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('change', { bubbles: true }))
  flushSync()
}

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
})

describe('SchemaEditor (plan 08 C8)', () => {
  it('empty state offers an empty object start', () => {
    const onChange = mountEditor(undefined)
    buttonByText('Start with an empty object')!.click()
    flushSync()
    expect(onChange).toHaveBeenCalledWith({ type: 'object', properties: {} })
  })

  it('paste example JSON infers a schema; invalid JSON shows an error instead', () => {
    const onChange = mountEditor(undefined)
    buttonByText('Paste example JSON')!.click()
    flushSync()
    const box = byLabel<HTMLTextAreaElement>('Example JSON')!
    box.value = 'not json'
    box.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    buttonByText('Infer schema')!.click()
    flushSync()
    expect(onChange).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Not valid JSON')

    box.value = '{"id": "a3c9d8e2-1111-4222-8333-944444444444", "n": 3}'
    box.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    buttonByText('Infer schema')!.click()
    flushSync()
    expect(onChange).toHaveBeenCalledWith({
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid' }, n: { type: 'integer' } },
    })
  })

  it('adds a property through the row add box', () => {
    const onChange = mountEditor({ type: 'object', properties: {} })
    byLabel<HTMLButtonElement>('Add property to body')!.click()
    flushSync()
    const input = byLabel<HTMLInputElement>('New property name in body')!
    input.value = 'email'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    flushSync()
    expect(onChange).toHaveBeenCalledWith({
      type: 'object',
      properties: { email: { type: 'string' } },
    })
  })

  it('type select, format input, nullable toggle, rename and delete emit valid edits', () => {
    const schema: SchemaJSON = { type: 'object', properties: { id: { type: 'string' } } }

    let onChange = mountEditor(schema)
    change(byLabel<HTMLSelectElement>('Type of body.id')!, 'integer')
    expect(onChange).toHaveBeenCalledWith({ type: 'object', properties: { id: { type: 'integer' } } })

    onChange = mountEditor(schema)
    change(byLabel<HTMLInputElement>('Format of body.id')!, 'uuid')
    expect(onChange).toHaveBeenCalledWith({
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid' } },
    })

    onChange = mountEditor(schema)
    byLabel<HTMLButtonElement>('Toggle nullable on body.id')!.click()
    flushSync()
    expect(onChange).toHaveBeenCalledWith({
      type: 'object',
      properties: { id: { type: 'string', nullable: true } },
    })

    onChange = mountEditor(schema)
    change(byLabel<HTMLInputElement>('Rename body.id')!, 'uid')
    expect(onChange).toHaveBeenCalledWith({ type: 'object', properties: { uid: { type: 'string' } } })

    onChange = mountEditor(schema)
    byLabel<HTMLButtonElement>('Delete body.id')!.click()
    flushSync()
    expect(onChange).toHaveBeenCalledWith({ type: 'object', properties: {} })
  })

  it('Remove clears the schema entirely', () => {
    const onChange = mountEditor({ type: 'object', properties: {} })
    // Toolbar buttons render an icon ligature before the label, so match loosely.
    ;[...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.includes('Remove'))!
      .click()
    flushSync()
    expect(onChange).toHaveBeenCalledWith(undefined)
  })
})
