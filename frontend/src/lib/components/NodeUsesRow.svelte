<script lang="ts">
  import { CARD_CHIP_CAP, withOverflow } from '../nodeIO'

  // What a card reads from upstream. The other half of the flow — what it
  // hands downstream — is labelled on the outgoing edges instead, so the
  // wire carries the payload and the card carries the configuration.
  let { refs }: { refs: string[] } = $props()

  const read = $derived(withOverflow(refs, CARD_CHIP_CAP))
</script>

{#if refs.length > 0}
  <div class="flex min-w-0 items-center gap-1" title="Reads from upstream: {refs.join(', ')}">
    <span class="shrink-0 text-[9px] tracking-wide text-zinc-600 uppercase">uses</span>
    {#each read.shown as ref}
      <span class="min-w-0 truncate rounded bg-sky-500/10 px-1 font-mono text-[10px] text-sky-300">{ref}</span>
    {/each}
    {#if read.more > 0}
      <span class="shrink-0 text-[10px] text-zinc-600">+{read.more}</span>
    {/if}
  </div>
{/if}
