<script lang="ts">
  import type { HttpNode } from '../../model'
  import { app } from '../../state.svelte'
  import Icon from '../Icon.svelte'
  import Button from '../ui/Button.svelte'
  import { FIELD_LABEL } from '../ui/classes'

  let { node }: { node: HttpNode } = $props()

  const captured = $derived(app.responses[node.id])
  const pinned = $derived(node.data.responseSchema !== undefined)
</script>

<div>
  <div class="flex items-center justify-between">
    <span class={FIELD_LABEL}>Response schema</span>
    {#if pinned}
      <span class="inline-flex items-center gap-0.5 rounded bg-violet-500/15 px-1 py-px text-[9px] text-violet-300">
        <Icon name="keep" size={10} />
        pinned
      </span>
    {:else if captured}
      <span class="text-[10px] text-zinc-600">inferred from last run · {captured.at.slice(11, 16)}</span>
    {:else}
      <span class="text-[10px] text-zinc-600">run the node to infer one</span>
    {/if}
  </div>
  <Button
    variant="secondary"
    class="mt-1.5 w-full"
    disabled={!captured}
    onclick={() => app.useLastResponseAsSchema(node.id)}
    title={captured
      ? 'Pin the schema inferred from the last response; it serializes with the board'
      : 'Run the node first — inference needs a captured response'}
  >
    <Icon name="schema" size={13} />
    {pinned ? 'Re-infer from last response' : 'Use last response as schema'}
  </Button>
</div>
