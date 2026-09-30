<script lang="ts">
  import { tick } from 'svelte'
  import type { NodeField, TransformNode } from '../../model'
  import {
    fieldDisplayValue,
    keyByNodeId,
    nodeIdByKey,
    parseFieldInput,
    validateFieldRefs,
  } from '../../refs'
  import { app } from '../../state.svelte'
  import Icon from '../Icon.svelte'
  import Button from '../ui/Button.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import Input from '../ui/Input.svelte'
  import BindingPicker from './BindingPicker.svelte'

  let { node }: { node: TransformNode } = $props()

  const rows = $derived(node.data.pick)
  const keys = $derived(keyByNodeId(app.nodes))

  let newKey = $state('')
  /** Row key whose expression input shows the binding picker; null = closed. */
  let pickingFor = $state<string | null>(null)
  /** Per-row input refs, keyed by row key; rows come and go with the each block. */
  let inputEls: Record<string, HTMLInputElement | null> = $state({})

  function inputEl(key: string) {
    return inputEls[key] ?? null
  }

  function setInputEl(key: string, el: HTMLInputElement | null) {
    inputEls[key] = el
  }

  const newKeyTaken = $derived(rows.some((r) => r.key === newKey.trim()))

  function setRows(next: NodeField[]) {
    app.updateNodeData(node.id, { pick: next })
  }

  function addRow() {
    const key = newKey.trim()
    if (key === '' || newKeyTaken) return
    setRows([...rows, { key, source: 'literal', value: '' }])
    newKey = ''
  }

  function commit(row: NodeField, input: string) {
    const parsed = parseFieldInput(row.key, input, nodeIdByKey(app.nodes), new Set(app.nodes.map((n) => n.id)))
    setRows(rows.map((r) => (r.key === row.key ? parsed : r)))
  }

  function removeRow(key: string) {
    setRows(rows.filter((r) => r.key !== key))
  }

  /** Insert picker text at the cursor of the row's expression input. */
  function insert(row: NodeField, text: string) {
    pickingFor = null
    const el = inputEls[row.key]
    const display = fieldDisplayValue(row, keys)
    if (!el) {
      commit(row, display + text)
      return
    }
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    commit(row, el.value.slice(0, start) + text + el.value.slice(end))
    void tick().then(() => {
      el.focus()
      const cursor = start + text.length
      el.setSelectionRange(cursor, cursor)
    })
  }
</script>

<div class="space-y-1.5">
  {#each rows as row (row.key)}
    {@const error = validateFieldRefs(row, node.id, app.nodes, app.edges)}
    <div class="rounded-md border bg-zinc-900/60 px-2 py-1.5 {error ? 'border-rose-500/40' : 'border-zinc-800'}">
      <div class="flex items-center gap-1">
        <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-violet-300">{row.key}</span>
        <IconButton
          icon="add_link"
          tone={pickingFor === row.key ? 'accent' : 'default'}
          onclick={() => (pickingFor = pickingFor === row.key ? null : row.key)}
          title="Insert reference…"
          label="Insert reference into {row.key}"
        />
        <IconButton
          icon="close"
          iconSize={12}
          tone="danger"
          onclick={() => removeRow(row.key)}
          title="Remove row"
          label="Remove row {row.key}"
        />
      </div>
      <Input
        bind:el={() => inputEl(row.key), (el) => setInputEl(row.key, el)}
        size="xs"
        mono
        class="mt-1 w-full"
        value={fieldDisplayValue(row, keys)}
        oninput={(e) => commit(row, e.currentTarget.value)}
        placeholder="res.body.orgs[*].id or {'{{'}nodeKey.path{'}}'}"
      />
      {#if error}
        <p class="mt-1 text-[10px] text-rose-400">{error}</p>
      {/if}
      {#if pickingFor === row.key}
        <BindingPicker nodeId={node.id} onInsert={(text) => insert(row, text)} />
      {/if}
    </div>
  {:else}
    <p class="rounded-md border border-dashed border-zinc-800 px-2 py-3 text-center text-[11px] text-zinc-600">
      No rows yet — each row writes one output key from an upstream expression.
    </p>
  {/each}
  <div class="flex items-center gap-1">
    <Input
      size="sm"
      surface="raised"
      mono
      class="min-w-0 flex-1"
      placeholder="output key: emails, user.id…"
      bind:value={newKey}
      onkeydown={(e) => {
        if (e.key === 'Enter') addRow()
      }}
    />
    <Button variant="secondary" size="xs" disabled={newKey.trim() === '' || newKeyTaken} onclick={addRow} title="Add row">
      <Icon name="add" size={13} />
      Add
    </Button>
  </div>
  {#if newKeyTaken}
    <p class="text-[10px] text-rose-400">a row named "{newKey.trim()}" already exists</p>
  {/if}
</div>
