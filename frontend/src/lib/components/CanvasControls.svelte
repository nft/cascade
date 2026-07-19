<script lang="ts">
  import { useSvelteFlow } from '@xyflow/svelte'
  import { app } from '../state.svelte'
  import Icon from './Icon.svelte'

  // Replaces xyflow's default <Controls /> so the buttons use the app-wide
  // Material Symbols set instead of the library's bundled SVGs.
  const { zoomIn, zoomOut, fitView } = useSvelteFlow()

  const BUTTON_CLASS =
    'flex h-8 w-8 items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'

  const actions: { icon: string; label: string; run: () => void }[] = [
    { icon: 'add', label: 'Zoom in', run: () => void zoomIn() },
    { icon: 'remove', label: 'Zoom out', run: () => void zoomOut() },
    { icon: 'fit_screen', label: 'Fit view', run: () => void fitView() },
  ]
</script>

<div
  class="absolute bottom-3 left-3 z-10 flex flex-col divide-y divide-zinc-800 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 shadow-lg"
>
  {#each actions as action (action.icon)}
    <button class={BUTTON_CLASS} title={action.label} aria-label={action.label} onclick={action.run}>
      <Icon name={action.icon} size={16} />
    </button>
  {/each}
  <button
    class="{BUTTON_CLASS} {app.canvasLocked ? 'text-amber-400 hover:text-amber-300' : ''}"
    title={app.canvasLocked ? 'Unlock canvas' : 'Lock canvas'}
    aria-label={app.canvasLocked ? 'Unlock canvas' : 'Lock canvas'}
    aria-pressed={app.canvasLocked}
    onclick={() => (app.canvasLocked = !app.canvasLocked)}
  >
    <Icon name={app.canvasLocked ? 'lock' : 'lock_open'} size={16} filled={app.canvasLocked} />
  </button>
</div>
