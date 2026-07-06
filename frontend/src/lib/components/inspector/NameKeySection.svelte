<script lang="ts">
  import type { RunnableNode } from '../../model'
  import { app } from '../../state.svelte'

  let { node }: { node: RunnableNode } = $props()

  let nameInput = $state<HTMLInputElement | null>(null)
  let lastRenameSignal = app.renameSignal
  $effect(() => {
    if (app.renameSignal !== lastRenameSignal) {
      lastRenameSignal = app.renameSignal
      nameInput?.focus()
      nameInput?.select()
    }
  })

  let keyError = $state<string | null>(null)
  // Editing a different node clears a stale key error.
  $effect(() => {
    void app.selectedNodeId
    keyError = null
  })

  function commitKey(id: string, value: string, el: HTMLInputElement) {
    keyError = app.setNodeKey(id, value.trim())
    // A rejected key keeps the stored one; snap the input back to it.
    if (keyError !== null) el.value = node.data.key
  }
</script>

<label class="block">
  <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Name</span>
  <input
    bind:this={nameInput}
    class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs outline-none focus:border-zinc-500"
    value={node.data.name}
    oninput={(e) => app.updateNodeData(node.id, { name: e.currentTarget.value })}
  />
</label>

<label class="block">
  <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Key</span>
  <input
    class="mt-1 w-full rounded-md border bg-zinc-900 px-2 py-1.5 font-mono text-xs outline-none focus:border-zinc-500 {keyError
      ? 'border-rose-500/40'
      : 'border-zinc-800'}"
    value={node.data.key}
    onchange={(e) => commitKey(node.id, e.currentTarget.value, e.currentTarget)}
    title="Other nodes reference this node as {'{{'}{node.data.key}.…{'}}'}"
  />
  {#if keyError}
    <p class="mt-1 text-[10px] text-rose-400">{keyError}</p>
  {/if}
</label>
