<script lang="ts">
  import { app } from '../state.svelte'
  import { formatDuration } from '../format'
  import { httpStatusClass, methodBadge } from '../ui'
  import Icon from './Icon.svelte'

  let statusFilter = $state<'all' | 'success' | 'failed'>('all')
  let query = $state('')
  let expandedId = $state<string | null>(null)

  const filtered = $derived(
    app.logs.filter((entry) => {
      if (statusFilter === 'success' && entry.status >= 400) return false
      if (statusFilter === 'failed' && entry.status < 400) return false
      const q = query.toLowerCase()
      return q === '' || `${entry.node} ${entry.url} ${entry.runId}`.toLowerCase().includes(q)
    }),
  )
</script>

<section class="shrink-0 border-t border-zinc-800 bg-surface">
  <header class="flex h-9 items-center gap-3 px-3">
    <button class="flex items-center gap-1.5 text-xs text-zinc-300" onclick={() => (app.logsOpen = !app.logsOpen)}>
      <Icon name="terminal" size={14} />
      Logs
      <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{filtered.length}</span>
    </button>
    {#if app.logsOpen}
      <div class="ml-auto flex items-center gap-1.5">
        <Icon name="filter_list" size={14} class="text-zinc-500" />
        <select
          class="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] outline-none"
          bind:value={statusFilter}
        >
          <option value="all">all statuses</option>
          <option value="success">success only</option>
          <option value="failed">failed only</option>
        </select>
      </div>
      <div class="relative">
        <Icon name="search" size={14} class="absolute top-1/2 left-2 -translate-y-1/2 text-zinc-600" />
        <input
          class="w-56 rounded-md border border-zinc-800 bg-zinc-900 py-1 pr-2 pl-7 text-[11px] outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          placeholder="Filter by node, URL, run…"
          bind:value={query}
        />
      </div>
    {/if}
  </header>

  {#if app.logsOpen}
    <div class="h-52 overflow-y-auto border-t border-zinc-800/60">
      <table class="w-full text-left text-[11px]">
        <thead class="sticky top-0 bg-surface">
          <tr class="text-[10px] tracking-wide text-zinc-600 uppercase">
            <th class="px-3 py-1.5 font-medium">Time</th>
            <th class="px-2 py-1.5 font-medium">Node</th>
            <th class="px-2 py-1.5 font-medium">Request</th>
            <th class="px-2 py-1.5 text-right font-medium">Status</th>
            <th class="px-3 py-1.5 text-right font-medium">Duration</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered.toReversed() as entry (entry.id)}
            <tr
              class="cursor-pointer border-t border-zinc-800/40 hover:bg-zinc-800/40 {entry.status >= 400
                ? 'bg-rose-500/5'
                : ''}"
              onclick={() => (expandedId = expandedId === entry.id ? null : entry.id)}
            >
              <td class="px-3 py-1.5 font-mono text-zinc-500">{entry.time}</td>
              <td class="px-2 py-1.5 text-zinc-300">{entry.node}</td>
              <td class="px-2 py-1.5">
                <span class="mr-1.5 rounded px-1 py-0.5 text-[10px] font-semibold {methodBadge[entry.method]}">{entry.method}</span>
                <span class="font-mono text-zinc-400">{entry.url}</span>
              </td>
              <td class="px-2 py-1.5 text-right font-mono {httpStatusClass(entry.status)}">{entry.status}</td>
              <td class="px-3 py-1.5 text-right font-mono text-zinc-500">{formatDuration(entry.durationMs)}</td>
            </tr>
            {#if expandedId === entry.id}
              <tr class="border-t border-zinc-800/40 bg-zinc-900/60">
                <td colspan="5" class="px-4 py-2">
                  {#if entry.error}
                    <p class="pb-2 text-[11px] text-rose-400">{entry.error}</p>
                  {/if}
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <p class="pb-1 text-[10px] tracking-wide text-zinc-600 uppercase">Request</p>
                      <pre class="overflow-x-auto rounded-md bg-zinc-950 p-2 font-mono text-[10px] text-zinc-400">{entry.request ?? '—'}</pre>
                    </div>
                    <div>
                      <p class="pb-1 text-[10px] tracking-wide text-zinc-600 uppercase">Response</p>
                      <pre class="overflow-x-auto rounded-md bg-zinc-950 p-2 font-mono text-[10px] text-zinc-400">{entry.response ?? '—'}</pre>
                    </div>
                  </div>
                </td>
              </tr>
            {/if}
          {:else}
            <tr><td colspan="5" class="px-3 py-6 text-center text-zinc-600">No log entries match.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
