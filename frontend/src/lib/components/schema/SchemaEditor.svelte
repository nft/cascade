<script lang="ts">
  // Editable schema tree (plan 08 B4/C8), grown from the read-only
  // SchemaTree: controlled — the owner holds the SchemaJSON, every edit
  // arrives via onChange (undefined clears the schema). Manual editing never
  // requires writing JSON Schema by hand: "Paste example JSON" runs the
  // plan-05 inferSchema over a sample instead.
  import type { SchemaJSON } from '../../model'
  import { inferSchema } from '../../schema'
  import Icon from '../Icon.svelte'
  import Button from '../ui/Button.svelte'
  import Textarea from '../ui/Textarea.svelte'
  import SchemaEditorNode from './SchemaEditorNode.svelte'

  let {
    schema,
    onChange,
    rootLabel = 'body',
    emptyHint = 'No schema yet.',
  }: {
    schema: SchemaJSON | undefined
    onChange: (schema: SchemaJSON | undefined) => void
    rootLabel?: string
    emptyHint?: string
  } = $props()

  let pasting = $state(false)
  let pasteText = $state('')
  let pasteError = $state<string | null>(null)

  function edit(fn: (root: SchemaJSON) => SchemaJSON | null) {
    if (schema === undefined) return
    const next = fn(schema)
    if (next !== null) onChange(next)
  }

  function inferFromPaste() {
    pasteError = null
    try {
      onChange(inferSchema(JSON.parse(pasteText)))
      pasting = false
      pasteText = ''
    } catch {
      pasteError = 'Not valid JSON — paste a raw example response or value.'
    }
  }
</script>

<div class="space-y-1.5">
  {#if pasting}
    <Textarea
      size="dense"
      mono
      class="h-28 w-full resize-y"
      placeholder={'{"id": "usr_1", "email": "a@b.co", …} — the schema is inferred from it'}
      aria-label="Example JSON"
      bind:value={pasteText}
    />
    {#if pasteError}
      <p class="text-[11px] text-rose-400">{pasteError}</p>
    {/if}
    <div class="flex items-center gap-1.5">
      <Button variant="secondary" size="sm" disabled={pasteText.trim() === ''} onclick={inferFromPaste}>
        Infer schema
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onclick={() => {
          pasting = false
          pasteError = null
        }}
      >
        Cancel
      </Button>
    </div>
  {:else if schema === undefined}
    <div class="rounded-md border border-dashed border-zinc-800 px-2 py-3 text-center">
      <p class="text-[11px] text-zinc-600">{emptyHint}</p>
      <div class="mt-2 flex items-center justify-center gap-1.5">
        <Button variant="secondary" size="sm" onclick={() => onChange({ type: 'object', properties: {} })}>
          Start with an empty object
        </Button>
        <Button variant="secondary" size="sm" onclick={() => (pasting = true)}>Paste example JSON</Button>
      </div>
    </div>
  {:else}
    <div class="flex items-center justify-end gap-1">
      <button
        class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-300"
        onclick={() => (pasting = true)}
        title="Replace the schema with one inferred from a pasted example"
      >
        <Icon name="content_paste" size={12} />
        Paste example JSON
      </button>
      <button
        class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-rose-400"
        onclick={() => onChange(undefined)}
        title="Remove the schema entirely"
      >
        <Icon name="delete" size={12} />
        Remove
      </button>
    </div>
    <div class="rounded-md border border-zinc-800 bg-zinc-950/50 p-1.5">
      <SchemaEditorNode {schema} label={rootLabel} pathLabel={rootLabel} path={[]} fixed {edit} />
    </div>
  {/if}
</div>
