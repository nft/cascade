<script lang="ts">
  import { CARD_FIELD_CAP, withOverflow, type BodyShape } from '../nodeIO'

  // The shape of the body a node produces, as far as a card can show it:
  // the body's own type, how many keys it has, and the first few of them.
  // Absent until a schema is pinned or a run has been captured.
  let { shape }: { shape: BodyShape | null } = $props()

  const fields = $derived(withOverflow(shape?.fields ?? [], CARD_FIELD_CAP))
</script>

{#if shape}
  <div class="space-y-0.5 rounded border border-zinc-800/80 bg-zinc-950/40 px-1.5 py-1">
    <div class="flex items-center gap-1">
      <span class="shrink-0 text-[9px] tracking-wide text-zinc-600 uppercase">body</span>
      <span class="min-w-0 truncate font-mono text-[10px] text-zinc-500">{shape.type}</span>
      {#if shape.fields.length > 0}
        <span class="ml-auto shrink-0 text-[9px] text-zinc-600">
          {shape.fields.length}
          {shape.fields.length === 1 ? 'key' : 'keys'}
        </span>
      {/if}
    </div>
    {#each fields.shown as field}
      <div class="flex items-center gap-2">
        <span class="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-300">{field.key}</span>
        <span class="shrink-0 truncate font-mono text-[10px] text-zinc-600">{field.type}</span>
      </div>
    {/each}
  </div>
{/if}
