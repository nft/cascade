<script lang="ts">
  import type { HttpNode } from '../../model'
  import { app } from '../../state.svelte'
  import Icon from '../Icon.svelte'
  import FieldRow from './FieldRow.svelte'

  let { node }: { node: HttpNode } = $props()

  let newKey = $state('')

  function addField() {
    const key = newKey.trim()
    if (key === '' || node.data.fields.some((f) => f.key === key)) return
    app.setField(node.id, { key, source: 'literal', value: '' })
    newKey = ''
  }
</script>

<div>
  <div class="flex items-center justify-between">
    <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Request fields</span>
    <span class="text-[10px] text-zinc-600">literal · res.path · {'{{'}…{'}}'}</span>
  </div>
  <div class="mt-1.5 space-y-1.5">
    {#each node.data.fields as field (field.key)}
      <FieldRow nodeId={node.id} {field} />
    {:else}
      <p class="rounded-md border border-dashed border-zinc-800 px-2 py-3 text-center text-[11px] text-zinc-600">
        No fields yet — add one below (schema-driven forms land with the M2 engine wiring).
      </p>
    {/each}
    <div class="flex items-center gap-1">
      <input
        class="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        placeholder="body.email, path.id, query.limit…"
        bind:value={newKey}
        onkeydown={(e) => {
          if (e.key === 'Enter') addField()
        }}
      />
      <button
        class="flex items-center gap-1 rounded-md border border-zinc-800 px-1.5 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-700"
        disabled={newKey.trim() === ''}
        onclick={addField}
        title="Add field"
      >
        <Icon name="add" size={13} />
        Add
      </button>
    </div>
  </div>
</div>
