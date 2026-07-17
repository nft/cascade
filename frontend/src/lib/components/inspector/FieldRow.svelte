<script lang="ts">
  import { tick } from 'svelte'
  import type { NodeField } from '../../model'
  import { fieldKeyName, sectionKey, sectionOfKey } from '../../request'
  import type { RequestEditorTarget } from '../../requestEditor'
  import { fieldDisplayValue, keyByNodeId, nodeIdByKey, parseFieldInput, validateFieldRefs } from '../../refs'
  import { app } from '../../state.svelte'
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
  const keyName = $derived(fieldKeyName(field.key))
  // Placeholder-derived rows' names are owned by the path text; orphans lost
  // that owner, so renaming them (back to a placeholder, or into a query
  // param) is their rescue path (plan 10 §3b).
  const keyReadonly = $derived(kindBadge === 'path' && !orphan)

  let inputEl = $state<HTMLInputElement | null>(null)
  let pickerOpen = $state(false)

  function commit(input: string) {
    target.setField(
      boundNodeId
        ? parseFieldInput(field.key, input, nodeIdByKey(app.nodes), new Set(app.nodes.map((n) => n.id)))
        : { key: field.key, source: 'literal', value: input },
    )
  }

  /**
   * Rename on blur/Enter, preserving source/value/ref and row position. The
   * new name re-routes through sectionKey (a query param renamed to a current
   * placeholder becomes the path row). Empty and colliding names revert.
   */
  function commitKey(el: HTMLInputElement) {
    const name = el.value.trim()
    const section = sectionOfKey(field.key)
    const next = section && name !== '' ? sectionKey(section, name, target.path) : null
    if (next === null || next === field.key || target.fields.some((f) => f.key === next)) {
      el.value = keyName
      return
    }
    target.renameField(field.key, next)
  }

  /** Insert picker text at the cursor of this field's value input (plan 05 V4). */
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

<div>
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
    {#if keyReadonly}
      <p
        class="w-2/5 shrink-0 truncate px-1.5 py-1 font-mono text-[11px] text-zinc-400"
        title={`name comes from the {${keyName}} path placeholder`}
      >
        {keyName}
      </p>
    {:else}
      <Input
        size="xs"
        mono
        surface="raised"
        class="w-2/5 shrink-0"
        value={keyName}
        aria-label="Field name {keyName}"
        onchange={(e) => commitKey(e.currentTarget)}
        onkeydown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    {/if}
    {#if orphan}
      <span
        class="shrink-0 rounded bg-amber-500/15 px-1 py-px font-mono text-[9px] text-amber-300"
        title="No matching placeholder in the path — remove the row, rename it, or restore the placeholder"
      >
        unused
      </span>
    {/if}
    <Input
      bind:el={inputEl}
      size="xs"
      mono
      surface="raised"
      tone={error ? 'error' : isBound ? 'accent' : 'default'}
      class="min-w-0 flex-1"
      value={display}
      aria-label="Value of {keyName}"
      oninput={(e) => commit(e.currentTarget.value)}
      placeholder={boundNodeId ? `literal, res.path or {{nodeKey.path}}` : 'literal default'}
      title={boundNodeId ? `literal, res.path or {{nodeKey.path}}` : undefined}
    />
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
  {#if error}
    <p class="mt-0.5 text-[10px] text-rose-400">{error}</p>
  {:else if missing}
    <p class="mt-0.5 text-[10px] text-amber-400">required path parameter</p>
  {/if}
  {#if pickerOpen && boundNodeId}
    <BindingPicker nodeId={boundNodeId} onInsert={insert} />
  {/if}
</div>
