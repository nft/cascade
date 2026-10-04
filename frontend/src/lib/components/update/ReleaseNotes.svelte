<script lang="ts">
  // The release's changelog section as parsed blocks; text only, so a note
  // can never carry markup into the dialog.
  import type { NoteBlock, NoteSegment } from '../../releaseNotes'

  let { blocks }: { blocks: NoteBlock[] } = $props()
</script>

{#snippet segments(list: NoteSegment[])}
  {#each list as segment, i (i)}
    {#if segment.kind === 'code'}
      <code class="rounded bg-zinc-800 px-1 font-mono text-[10px] text-zinc-200">{segment.text}</code>
    {:else}
      {segment.text}
    {/if}
  {/each}
{/snippet}

<div
  class="max-h-64 space-y-1.5 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-xs leading-relaxed text-zinc-300"
  aria-label="Release notes"
>
  {#if blocks.length === 0}
    <p class="text-zinc-500">No notes for this release.</p>
  {/if}
  {#each blocks as block, i (i)}
    {#if block.kind === 'heading'}
      <p class="pt-1.5 text-[10px] font-medium tracking-wide text-zinc-500 uppercase first:pt-0">
        {@render segments(block.segments)}
      </p>
    {:else if block.kind === 'bullet'}
      <p class="relative pl-3 before:absolute before:left-0 before:text-zinc-600 before:content-['•']">
        {@render segments(block.segments)}
      </p>
    {:else}
      <p>{@render segments(block.segments)}</p>
    {/if}
  {/each}
</div>
