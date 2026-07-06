<script lang="ts">
  import { tick } from 'svelte'
  import type { NodeField } from '../../model'
  import { fieldDisplayValue, keyByNodeId, nodeIdByKey, parseFieldInput, validateFieldRefs } from '../../refs'
  import { app } from '../../state.svelte'
  import Icon from '../Icon.svelte'
  import BindingPicker from './BindingPicker.svelte'

  let { nodeId, field }: { nodeId: string; field: NodeField } = $props()

  const keys = $derived(keyByNodeId(app.nodes))
  const display = $derived(fieldDisplayValue(field, keys))
  const error = $derived(validateFieldRefs(field, nodeId, app.nodes, app.edges))
  const isBound = $derived(field.source !== 'literal')

  let inputEl = $state<HTMLInputElement | null>(null)
  let pickerOpen = $state(false)

  function commit(input: string) {
    app.setField(
      nodeId,
      parseFieldInput(field.key, input, nodeIdByKey(app.nodes), new Set(app.nodes.map((n) => n.id))),
    )
  }

  /** Insert picker text at the cursor of this field's input (plan 05 V4). */
  function insert(text: string) {
    pickerOpen = false
    const el = inputEl
    if (!el) {
      commit(display + text)
      return
    }
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    commit(el.value.slice(0, start) + text + el.value.slice(end))
    void tick().then(() => {
      el.focus()
      const cursor = start + text.length
      el.setSelectionRange(cursor, cursor)
    })
  }
</script>

<div class="rounded-md border bg-zinc-900/60 px-2 py-1.5 {error ? 'border-rose-500/40' : 'border-zinc-800'}">
  <div class="flex items-center gap-1">
    <p class="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-400">{field.key}</p>
    {#if isBound}
      <span class="inline-flex shrink-0 items-center gap-0.5 rounded bg-violet-500/15 px-1 py-px font-mono text-[9px] text-violet-300">
        <Icon name="link" size={10} />
        {field.source}
      </span>
    {/if}
    <button
      class="flex shrink-0 items-center rounded px-1 py-0.5 hover:bg-zinc-800 {pickerOpen
        ? 'text-violet-300'
        : 'text-zinc-500 hover:text-zinc-200'}"
      onclick={() => (pickerOpen = !pickerOpen)}
      title="Insert reference…"
      aria-label="Insert reference into {field.key}"
    >
      <Icon name="add_link" size={14} />
    </button>
    <button
      class="flex shrink-0 items-center rounded px-1 py-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-rose-400"
      onclick={() => app.removeField(nodeId, field.key)}
      title="Remove field"
      aria-label="Remove field {field.key}"
    >
      <Icon name="close" size={12} />
    </button>
  </div>
  <input
    bind:this={inputEl}
    class="mt-1 w-full rounded border bg-zinc-950 px-1.5 py-1 font-mono text-[11px] outline-none focus:border-zinc-500 {isBound
      ? 'border-violet-500/30 text-violet-200'
      : 'border-zinc-800 text-zinc-200'}"
    value={display}
    oninput={(e) => commit(e.currentTarget.value)}
    placeholder="literal, res.path or {'{{'}nodeKey.path{'}}'}"
  />
  {#if error}
    <p class="mt-1 text-[10px] text-rose-400">{error}</p>
  {/if}
  {#if pickerOpen}
    <BindingPicker {nodeId} onInsert={insert} />
  {/if}
</div>
