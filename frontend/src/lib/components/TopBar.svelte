<script lang="ts">
  import { app } from '../state.svelte'
  import Icon from './Icon.svelte'
</script>

<header class="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 bg-surface px-4">
  <span class="text-sm font-semibold tracking-tight">Cascade</span>
  <span class="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">demo-workspace</span>

  <div class="ml-auto flex items-center gap-2">
    <button
      class="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
      title="Import an OpenAPI / Swagger document (wired in M2)"
    >
      <Icon name="upload_file" size={14} />
      Import schema
    </button>
    <div class="mx-1 h-5 w-px bg-zinc-800"></div>
    <button
      class="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={app.isRunning}
      onclick={() => app.simulateRun()}
    >
      <Icon name="play_arrow" size={14} filled={app.isRunning} />
      {app.isRunning ? 'Running…' : 'Run'}
    </button>
    <button
      class="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-500"
      disabled
      title="Pause — engine support lands in M7"
    >
      <Icon name="pause" size={14} />
      Pause
    </button>
    <button
      class="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-500"
      disabled
      title="Stop — engine support lands in M7"
    >
      <Icon name="stop" size={14} />
      Stop
    </button>
  </div>
</header>
