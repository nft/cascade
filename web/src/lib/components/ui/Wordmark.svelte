<script lang="ts">
  import { SITE } from '$lib/config/site'
  import Mark from './Mark.svelte'

  // The mark sits in a navy tile like the app icon, at the icon's proportions.
  const MARK_TO_TILE = 0.62
  const TILE_PADDING_PX = 10

  let { size = 22 }: { size?: number } = $props()
</script>

<span class="inline-flex items-center gap-2.5">
  <span
    class="grid size-(--tile) place-items-center rounded-[28%] bg-navy ring-1 ring-white/8"
    style:--tile="{size + TILE_PADDING_PX}px"
  >
    <Mark size={size * MARK_TO_TILE} class="text-coral-500" />
  </span>
  <span class="text-[1.18rem] font-semibold tracking-[-0.03em] text-fg">{SITE.name}</span>
</span>
