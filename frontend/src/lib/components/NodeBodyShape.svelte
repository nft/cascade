<script lang="ts">
  import { CARD_FIELD_CAP, withOverflow, type BodyShape } from '../nodeIO'

  /** What the block is titled when the caller names nothing better. */
  const DEFAULT_LABEL = 'body'
  const STALE_LABEL = 'stale'
  const STALE_TITLE = 'Captured before the last edit — re-run to refresh'

  // The shape of the body a node produces, as far as a card can show it:
  // the body's own type, how many keys it has, and the first few of them.
  // Absent until a schema is pinned or a run has been captured.
  //
  // `stale` marks a shape the node's current configuration would no longer
  // produce. It is dimmed rather than dropped: the last known shape is still a
  // better hint than a blank card, as long as it does not pass for current.
  let {
    shape,
    label = DEFAULT_LABEL,
    stale = false,
  }: { shape: BodyShape | null; label?: string; stale?: boolean } = $props()

  const fields = $derived(withOverflow(shape?.fields ?? [], CARD_FIELD_CAP))
</script>

{#if shape}
  <div
    class="space-y-0.5 rounded border px-1.5 py-1 {stale
      ? 'border-dashed border-amber-500/25 bg-zinc-950/30'
      : 'border-zinc-800/80 bg-zinc-950/40'}"
  >
    <div class="flex items-center gap-1">
      <span class="max-w-20 shrink-0 truncate text-[9px] tracking-wide text-zinc-600 uppercase" title={label}>
        {label}
      </span>
      <span class="min-w-0 truncate font-mono text-[10px] {stale ? 'text-zinc-600' : 'text-zinc-500'}">
        {shape.type}
      </span>
      {#if stale}
        <span class="ml-auto shrink-0 text-[9px] text-amber-400/70" title={STALE_TITLE}>{STALE_LABEL}</span>
      {:else if shape.fields.length > 0}
        <span class="ml-auto shrink-0 text-[9px] text-zinc-600">
          {shape.fields.length}
          {shape.fields.length === 1 ? 'key' : 'keys'}
        </span>
      {/if}
    </div>
    {#each fields.shown as field (field.key)}
      <div class="flex items-center gap-2">
        <span class="min-w-0 flex-1 truncate font-mono text-[10px] {stale ? 'text-zinc-500' : 'text-zinc-300'}">
          {field.key}
        </span>
        <span class="shrink-0 truncate font-mono text-[10px] text-zinc-600">{field.type}</span>
      </div>
    {/each}
  </div>
{/if}
