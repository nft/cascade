<script lang="ts">
  import type { RunnableNode } from '../../model'
  import { app } from '../../state.svelte'
  import Field from '../ui/Field.svelte'
  import Input from '../ui/Input.svelte'

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

<Field label="Name">
  <Input
    bind:el={nameInput}
    surface="raised"
    class="mt-1 w-full"
    value={node.data.name}
    oninput={(e) => app.updateNodeData(node.id, { name: e.currentTarget.value })}
  />
</Field>

<Field label="Key">
  <Input
    surface="raised"
    mono
    tone={keyError ? 'error' : 'default'}
    class="mt-1 w-full"
    value={node.data.key}
    onchange={(e) => commitKey(node.id, e.currentTarget.value, e.currentTarget)}
    title="Other nodes reference this node as {'{{'}{node.data.key}.…{'}}'}"
  />
  {#if keyError}
    <p class="mt-1 text-[10px] text-rose-400">{keyError}</p>
  {/if}
</Field>
