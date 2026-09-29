<script lang="ts">
  import Icon from '$components/ui/Icon.svelte'
  import { getDemoRunner } from '$demo/context'
  import { METHOD_BADGE } from '$demo/styles'
  import { formatClock } from '$lib/text/format'

  // The app's logs panel (LogsPanel.svelte): newest first, loop iterations
  // numbered from #1.
  const runner = getDemoRunner()
  const HEAD = 'px-2 py-1.5 font-medium'
  const CELL = 'px-2 py-1.5'
</script>

<section aria-label="Run log" class="border-t border-zinc-800 bg-app-surface">
  <header class="flex h-9 items-center gap-3 px-3">
    <span class="flex items-center gap-1.5 text-xs text-zinc-300">
      <Icon name="terminal" size={14} />
      Logs
      <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{runner.logs.length}</span>
    </span>
    <span aria-hidden="true" class="ml-auto hidden items-center gap-1.5 text-[11px] text-zinc-500 sm:flex">
      <Icon name="filter_list" size={14} />
      all statuses
    </span>
  </header>

  <div class="h-44 overflow-hidden border-t border-zinc-800/60">
    <table class="w-full table-fixed text-left text-[11px]">
      <thead>
        <tr class="text-[10px] tracking-wide text-zinc-600 uppercase">
          <th class="hidden w-28 {HEAD} pl-3 sm:table-cell">Time</th>
          <th class="w-32 {HEAD} pl-3 sm:w-36 sm:pl-2">Node</th>
          <th class={HEAD}>Request</th>
          <th class="w-14 {HEAD} text-right">Status</th>
          <th class="hidden w-20 {HEAD} pr-3 text-right sm:table-cell">Duration</th>
        </tr>
      </thead>
      <tbody>
        {#each runner.logs as row (row.id)}
          <tr class="animate-row border-t border-zinc-800/40 motion-reduce:animate-none">
            <td class="hidden {CELL} pl-3 font-mono text-zinc-500 sm:table-cell">{formatClock(row.at)}</td>
            <td class="{CELL} truncate pl-3 text-zinc-300 sm:pl-2">
              {row.node}
              {#if row.iteration !== null}
                <span class="ml-1 rounded bg-emerald-500/10 px-1 py-0.5 font-mono text-[10px] text-emerald-300/80"
                  >#{row.iteration + 1}</span
                >
              {/if}
            </td>
            <td class="{CELL} truncate">
              <span class="mr-1.5 rounded px-1 py-0.5 text-[10px] font-semibold {METHOD_BADGE[row.method]}"
                >{row.method}</span
              ><span class="font-mono text-zinc-400">{row.url}</span>
            </td>
            <td class="{CELL} text-right font-mono text-emerald-400">{row.status}</td>
            <td class="hidden {CELL} pr-3 text-right font-mono text-zinc-500 sm:table-cell">{row.ms}ms</td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" class="px-3 py-10 text-center text-zinc-600">
              No requests yet. Press Run and the board fills this log.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
