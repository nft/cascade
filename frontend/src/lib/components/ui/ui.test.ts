// Unit tests for the ui/ primitives. Input/Select go through harnesses so
// bind:value/bind:el are exercised from a real parent; the rest mount directly
// with raw snippets for children.
import { createRawSnippet, flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InputHarness from '../testing/InputHarness.svelte'
import SelectHarness from '../testing/SelectHarness.svelte'
import Button from './Button.svelte'
import Field from './Field.svelte'
import IconButton from './IconButton.svelte'
import Textarea from './Textarea.svelte'

// The harnesses expose their bound state through instance exports.
type Harness = {
  getValue?: () => unknown
  setValue?: (v: string) => void
  getEl?: () => HTMLInputElement | HTMLSelectElement | null
}

let instance: object | null = null

function mountComponent<P extends Record<string, unknown>>(component: unknown, props: P): Harness {
  instance = mount(component as never, { target: document.body, props })
  flushSync()
  return instance as Harness
}

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
  document.body.innerHTML = ''
})

function inputEl(): HTMLInputElement {
  const el = document.querySelector('input')
  if (!el) throw new Error('no input rendered')
  return el
}

function type(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  el.value = text
  el.dispatchEvent(new Event('input', { bubbles: true }))
  flushSync()
}

describe('Input', () => {
  it('round-trips bind:value', () => {
    const h = mountComponent(InputHarness, { initial: 'start' })
    expect(inputEl().value).toBe('start')

    type(inputEl(), 'typed')
    expect(h.getValue?.()).toBe('typed')

    h.setValue?.('from parent')
    flushSync()
    expect(inputEl().value).toBe('from parent')
  })

  it('supports uncontrolled value + oninput, with parent prop flow-down', () => {
    const oninput = vi.fn()
    const h = mountComponent(InputHarness, { initial: 'a', bound: false, oninput })
    type(inputEl(), 'ab')
    expect(oninput).toHaveBeenCalledOnce()

    h.setValue?.('b')
    flushSync()
    expect(inputEl().value).toBe('b')
  })

  it('lets an onchange handler snap the DOM value back on reject', () => {
    // NameKeySection's rejected-key pattern: the handler writes el.value
    // directly; the internal binding must not overwrite it afterwards.
    const onchange = (e: Event) => {
      ;(e.currentTarget as HTMLInputElement).value = 'kept'
    }
    mountComponent(InputHarness, { initial: 'kept', bound: false, onchange })
    type(inputEl(), 'rejected')
    inputEl().dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()
    expect(inputEl().value).toBe('kept')
  })

  it('exposes the element through bind:el', () => {
    const h = mountComponent(InputHarness, { initial: 'cursor' })
    const el = h.getEl?.() as HTMLInputElement
    expect(el).toBe(inputEl())
    el.focus()
    el.setSelectionRange(2, 4)
    expect(document.activeElement).toBe(el)
    expect(el.selectionStart).toBe(2)
    expect(el.selectionEnd).toBe(4)
  })

  it('passes rest attributes and handlers through', () => {
    const onkeydown = vi.fn()
    mountComponent(InputHarness, {
      placeholder: 'Create invoice',
      type: 'password',
      autocomplete: 'off',
      'aria-label': 'Secret',
      disabled: true,
      onkeydown,
    })
    const el = inputEl()
    expect(el.placeholder).toBe('Create invoice')
    expect(el.type).toBe('password')
    expect(el.getAttribute('autocomplete')).toBe('off')
    expect(el.getAttribute('aria-label')).toBe('Secret')
    expect(el.disabled).toBe(true)
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onkeydown).toHaveBeenCalledOnce()
  })

  it('focuses on mount when autofocus rides the spread', () => {
    mountComponent(InputHarness, { autofocus: true })
    expect(document.activeElement).toBe(inputEl())
  })

  it('applies tone and mono variants', () => {
    mountComponent(InputHarness, { tone: 'error', mono: true, class: 'w-full' })
    const cls = inputEl().className
    expect(cls).toContain('border-rose-500/40')
    expect(cls).not.toContain('border-zinc-800')
    expect(cls).toContain('font-mono')
    expect(cls).toContain('w-full')
  })

  it('applies the accent tone', () => {
    mountComponent(InputHarness, { tone: 'accent' })
    expect(inputEl().className).toContain('border-violet-500/30')
  })
})

describe('Select', () => {
  it('renders children options and round-trips value on change', () => {
    const onchange = vi.fn()
    const h = mountComponent(SelectHarness, { initial: 'a', onchange })
    const el = document.querySelector('select') as HTMLSelectElement
    expect([...el.options].map((o) => o.value)).toEqual(['a', 'b', 'c'])
    expect(el.value).toBe('a')

    el.value = 'c'
    el.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()
    expect(h.getValue?.()).toBe('c')
    expect(onchange).toHaveBeenCalledOnce()
    expect(h.getEl?.()).toBe(el)
  })

  it('carries the chevron classes and merges passthrough', () => {
    mountComponent(SelectHarness, { class: 'shrink-0 font-semibold text-sky-400' })
    const cls = (document.querySelector('select') as HTMLSelectElement).className
    expect(cls).toContain('select-chevron')
    expect(cls).toContain('pr-6')
    expect(cls).toContain('text-sky-400')
  })

  it('uses the narrow gutter for tiny sizes', () => {
    mountComponent(SelectHarness, { size: '2xs' })
    expect((document.querySelector('select') as HTMLSelectElement).className).toContain('pr-5')
  })
})

describe('Textarea', () => {
  it('renders with variant classes and accepts rest attrs', () => {
    mountComponent(Textarea, { size: 'dense', mono: true, class: 'h-28 w-full resize-y', placeholder: 'paste JSON' })
    const el = document.querySelector('textarea') as HTMLTextAreaElement
    expect(el.placeholder).toBe('paste JSON')
    expect(el.className).toContain('font-mono')
    expect(el.className).toContain('resize-y')
  })
})

describe('Field', () => {
  it('renders label > span + children like the previous inline markup', () => {
    const children = createRawSnippet(() => ({ render: () => '<input class="mt-1" />' }))
    mountComponent(Field, { label: 'Name', class: 'min-w-0 flex-1', children })
    const label = document.querySelector('label') as HTMLLabelElement
    expect(label.className).toContain('block')
    expect(label.className).toContain('flex-1')
    const span = label.querySelector('span') as HTMLSpanElement
    expect(span.textContent).toBe('Name')
    expect(span.className).toContain('uppercase')
    expect(label.querySelector('input')).not.toBeNull()
  })
})

describe('Button', () => {
  it('applies variant/size classes and forwards clicks and disabled', () => {
    const onclick = vi.fn()
    const children = createRawSnippet(() => ({ render: () => '<span>Save changes</span>' }))
    mountComponent(Button, { variant: 'primary', onclick, children })
    const el = document.querySelector('button') as HTMLButtonElement
    expect(el.textContent?.trim()).toBe('Save changes')
    expect(el.className).toContain('bg-emerald-600')
    expect(el.className).toContain('px-2.5')
    el.click()
    expect(onclick).toHaveBeenCalledOnce()
  })

  it('renders the secondary variant with the sm size', () => {
    const children = createRawSnippet(() => ({ render: () => '<span>Parse</span>' }))
    mountComponent(Button, { variant: 'secondary', size: 'sm', disabled: true, children })
    const el = document.querySelector('button') as HTMLButtonElement
    expect(el.className).toContain('border-zinc-800')
    expect(el.className).toContain('px-2')
    expect(el.disabled).toBe(true)
  })
})

describe('IconButton', () => {
  it('sets aria-label and tone, renders the icon, passes title', () => {
    mountComponent(IconButton, { icon: 'close', label: 'Close inspector', tone: 'danger', title: 'Close' })
    const el = document.querySelector('button') as HTMLButtonElement
    expect(el.getAttribute('aria-label')).toBe('Close inspector')
    expect(el.title).toBe('Close')
    expect(el.className).toContain('hover:text-rose-400')
    expect(el.querySelector('span')?.textContent).toBe('close')
  })
})
