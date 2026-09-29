<script lang="ts">
  import Icon from '$components/ui/Icon.svelte'
  import { TALL_LAYOUT, WIDE_LAYOUT } from '$demo/board'
  import type { IconName } from '$lib/icons'
  import DemoBoard from './DemoBoard.svelte'

  const ZOOM_ICONS: readonly IconName[] = ['add', 'remove', 'fit_screen', 'lock_open']
  const CHROME_ICON = 16
</script>

<!-- Both arrangements are rendered and CSS picks one, so the prerendered
     page and the hydrated one always agree. -->
<div class="relative bg-app-canvas bg-dots [--dot-gap:20px] [--dot:var(--color-app-dot)]">
  <!-- The canvas' tool palette and zoom controls, shown for looks. -->
  <div
    aria-hidden="true"
    class="absolute top-3 left-3 hidden overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 lg:flex"
  >
    <span class="grid size-8 place-items-center bg-emerald-500/15 text-emerald-300">
      <Icon name="arrow_selector_tool" size={CHROME_ICON} />
    </span>
    <span class="grid size-8 place-items-center text-zinc-400">
      <Icon name="content_cut" size={CHROME_ICON} />
    </span>
  </div>

  <div class="px-3 py-5 sm:px-8 lg:px-14 lg:py-8">
    <DemoBoard layout={WIDE_LAYOUT} class="hidden lg:block" />
    <DemoBoard layout={TALL_LAYOUT} class="mx-auto max-w-md lg:hidden" />
  </div>

  <div
    aria-hidden="true"
    class="absolute bottom-3 left-3 hidden flex-col overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 lg:flex"
  >
    {#each ZOOM_ICONS as icon (icon)}
      <span class="grid size-8 place-items-center text-zinc-400"><Icon name={icon} size={CHROME_ICON} /></span>
    {/each}
  </div>
</div>
