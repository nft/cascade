<script lang="ts">
  import { app } from '../state.svelte'
</script>

<header class="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-925 px-4" style="background-color: #101013">
  <span class="text-sm font-semibold tracking-tight">Cascade</span>
  <span class="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">demo-workspace</span>

  <div class="ml-auto flex items-center gap-2">
    <button
      class="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
      title="Import an OpenAPI / Swagger document (wired in M2)"
    >
      Import schema
    </button>
    <div class="mx-1 h-5 w-px bg-zinc-800"></div>
    <button
      class="rounded-md bg-emerald-600 px-4 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={app.isRunning}
      onclick={() => app.simulateRun()}
    >
      {app.isRunning ? 'Running…' : '▶ Run'}
    </button>
    <button
      class="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-500"
      disabled
      title="Pause — engine support lands in M7"
    >
      ⏸ Pause
    </button>
    <button
      class="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-500"
      disabled
      title="Stop — engine support lands in M7"
    >
      ⏹ Stop
    </button>
  </div>
</header>
