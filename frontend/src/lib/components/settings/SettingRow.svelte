<script lang="ts">
  import type { Snippet } from 'svelte'

  // One setting: label and explanation on the left, its control on the right.
  let { label, description = '', children }: { label: string; description?: string; children: Snippet } = $props()
</script>

<div class="flex items-start justify-between gap-4">
  <div class="min-w-0">
    <p class="text-xs text-zinc-200">{label}</p>
    {#if description}
      <p class="mt-0.5 text-[10px] leading-relaxed text-zinc-500">{description}</p>
    {/if}
  </div>
  <div class="flex shrink-0 items-center pt-0.5">
    {@render children()}
  </div>
</div>
