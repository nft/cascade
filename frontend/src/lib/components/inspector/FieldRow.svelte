<script lang="ts">
  import { tick } from 'svelte'
  import type { NodeField } from '../../model'
  import type { RequestEditorTarget } from '../../requestEditor'
  import { fieldDisplayValue, keyByNodeId, nodeIdByKey, parseFieldInput, validateFieldRefs } from '../../refs'
  import { app } from '../../state.svelte'
  import Icon from '../Icon.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import Input from '../ui/Input.svelte'
  import BindingPicker from './BindingPicker.svelte'

  let {
    target,
    field,
    kindBadge,
    required = false,
    orphan = false,
    removable = true,
  }: {
    /** The node or library draft being edited (plan 08 B3). */
    target: RequestEditorTarget
    field: NodeField
    /** Small path/query chip on Params rows (plan 08 A2). */
    kindBadge?: 'path' | 'query'
    /** Placeholder-backed row that must be filled before the request can run. */
    required?: boolean
    /** Stored path row whose placeholder left the path. */
    orphan?: boolean
    removable?: boolean
  } = $props()

  // Bindings/templates only exist on board nodes; a library draft edits
  // literal defaults, so refs parsing/validation and the picker are skipped.
  const boundNodeId = $derived(target.nodeId ?? null)
  const keys = $derived(keyByNodeId(app.nodes))
  const display = $derived(boundNodeId ? fieldDisplayValue(field, keys) : field.value)
  const error = $derived(boundNodeId ? validateFieldRefs(field, boundNodeId, app.nodes, app.edges) : null)
  const isBound = $derived(field.source !== 'literal')
  const missing = $derived(required && display.trim() === '')

  let inputEl = $state<HTMLInputElement | null>(null)
  let pickerOpen = $state(false)

  function commit(input: string) {
    target.setField(
      boundNodeId
        ? parseFieldInput(field.key, input, nodeIdByKey(app.nodes), new Set(app.nodes.map((n) => n.id)))
        : { key: field.key, source: 'literal', value: input },
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

<div
  class="rounded-md border bg-zinc-900/60 px-2 py-1.5 {error
    ? 'border-rose-500/40'
    : missing || orphan
      ? 'border-amber-500/40'
      : 'border-zinc-800'}"
>
  <div class="flex items-center gap-1">
    {#if kindBadge}
      <span
        class="shrink-0 rounded px-1 py-px font-mono text-[9px] {kindBadge === 'path'
          ? 'bg-sky-500/15 text-sky-300'
          : 'bg-zinc-800 text-zinc-500'}"
      >
        {kindBadge}
      </span>
    {/if}
    <p class="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-400">{field.key}</p>
    {#if orphan}
      <span
        class="shrink-0 rounded bg-amber-500/15 px-1 py-px font-mono text-[9px] text-amber-300"
        title="No matching placeholder in the path — remove the row or restore the placeholder"
      >
        unused
      </span>
    {/if}
    {#if isBound}
      <span class="inline-flex shrink-0 items-center gap-0.5 rounded bg-violet-500/15 px-1 py-px font-mono text-[9px] text-violet-300">
        <Icon name="link" size={10} />
        {field.source}
      </span>
    {/if}
    {#if boundNodeId}
      <IconButton
        icon="add_link"
        tone={pickerOpen ? 'accent' : 'default'}
        onclick={() => (pickerOpen = !pickerOpen)}
        title="Insert reference…"
        label="Insert reference into {field.key}"
      />
    {/if}
    {#if removable}
      <IconButton
        icon="close"
        iconSize={12}
        tone="danger"
        onclick={() => target.removeField(field.key)}
        title="Remove field"
        label="Remove field {field.key}"
      />
    {/if}
  </div>
  <Input
    bind:el={inputEl}
    size="xs"
    mono
    tone={isBound ? 'accent' : 'default'}
    class="mt-1 w-full"
    value={display}
    oninput={(e) => commit(e.currentTarget.value)}
    placeholder={boundNodeId ? `literal, res.path or {{nodeKey.path}}` : 'literal default'}
  />
  {#if error}
    <p class="mt-1 text-[10px] text-rose-400">{error}</p>
  {:else if missing}
    <p class="mt-1 text-[10px] text-amber-400">required path parameter</p>
  {/if}
  {#if pickerOpen && boundNodeId}
    <BindingPicker nodeId={boundNodeId} onInsert={insert} />
  {/if}
</div>
