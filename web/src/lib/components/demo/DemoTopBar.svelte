<script lang="ts">
  import Icon from '$components/ui/Icon.svelte'
  import Mark from '$components/ui/Mark.svelte'
  import { DEMO_PROJECT } from '$demo/board'
  import { getDemoRunner } from '$demo/context'

  // The app's top bar (TopBar.svelte), with its Button styles
  // (frontend ui/classes.ts). Run and Stop drive the demo.
  const BUTTON = 'inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs disabled:cursor-not-allowed'
  const PRIMARY = 'rounded bg-emerald-600 font-medium text-white hover:bg-emerald-500 disabled:opacity-50'
  const SECONDARY =
    'rounded-md border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:text-zinc-700 disabled:hover:bg-transparent'
  const ICON = 14

  const runner = getDemoRunner()
</script>

<div class="flex h-12 items-center gap-3 border-b border-zinc-800 bg-app-surface px-4">
  <Mark size={16} class="shrink-0 text-coral-500" />
  <span aria-hidden="true" class="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-zinc-200">
    <Icon name="folder" size={ICON} class="text-zinc-400" />
    {DEMO_PROJECT}
    <Icon name="arrow_drop_down" size={ICON} class="text-zinc-500" />
  </span>

  <div class="ml-auto flex items-center gap-2">
    <button type="button" class="{BUTTON} {PRIMARY}" disabled={runner.running} onclick={() => void runner.run()}>
      <Icon name="play_arrow" size={ICON} />
      Run
    </button>
    <button type="button" class="{BUTTON} {SECONDARY}" disabled={!runner.running} onclick={() => runner.stop()}>
      <Icon name="stop" size={ICON} />
      Stop
    </button>
    <span aria-hidden="true" class="mx-1 hidden h-5 w-px bg-zinc-800 sm:block"></span>
    <Icon name="more_vert" size={16} class="hidden text-zinc-500 sm:block" />
  </div>
</div>
