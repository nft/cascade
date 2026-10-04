<script lang="ts">
  import { formatDuration } from '../format'
  import type { LogEntry } from '../model'
  import { settings } from '../settings.svelte'
  import { app } from '../state.svelte'
  import { HTTP_FAILURE_STATUS, httpStatusClass, methodBadge } from '../ui'
  import Icon from './Icon.svelte'
  import IconButton from './ui/IconButton.svelte'
  import Select from './ui/Select.svelte'

  // Resizable body height (drag the strip above the header); capped so the
  // canvas always keeps a workable share of the window.
  const LOGS_DEFAULT_HEIGHT_PX = 208
  const LOGS_MIN_HEIGHT_PX = 96
  const LOGS_MAX_VIEWPORT_FRACTION = 0.7

  let statusFilter = $state<'all' | 'success' | 'failed'>('all')
  let query = $state('')
  let expandedId = $state<string | null>(null)
  let panelHeight = $state(LOGS_DEFAULT_HEIGHT_PX)

  function resizeStart(event: PointerEvent) {
    const handle = event.currentTarget as HTMLElement
    const startY = event.clientY
    const startHeight = panelHeight
    handle.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) => {
      const max = window.innerHeight * LOGS_MAX_VIEWPORT_FRACTION
      // Pointer deltas are viewport pixels; the panel's height is in its scaled units.
      const delta = (startY - e.clientY) / settings.uiScale
      panelHeight = Math.min(max, Math.max(LOGS_MIN_HEIGHT_PX, startHeight + delta))
    }
    const stop = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', stop)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', stop)
  }

  function clearLogs() {
    app.clearLogs()
    expandedId = null
  }

  // An http row that never reached a server carries an error and no status,
  // and `undefined >= 400` is false — so testing the status alone would file
  // the most common real-run failure under "success".
  function entryFailed(entry: LogEntry): boolean {
    const status = 'status' in entry ? (entry.status ?? 0) : 0
    return entry.error !== undefined || status >= HTTP_FAILURE_STATUS
  }

  function searchText(entry: LogEntry): string {
    const target =
      entry.kind === 'http' ? entry.url : entry.kind === 'transform' ? entry.inputNodes.join(' ') : entry.kind
    return `${entry.node} ${target} ${entry.runId}`.toLowerCase()
  }

  const filtered = $derived(
    app.logs.filter((entry) => {
      if (statusFilter === 'success' && entryFailed(entry)) return false
      if (statusFilter === 'failed' && !entryFailed(entry)) return false
      const q = query.toLowerCase()
      return q === '' || searchText(entry).includes(q)
    }),
  )

  // Stale-highlight guard: pointerleave never fires when the
  // hovered row disappears out from under the pointer (filter typed, status
  // filter changed, panel collapsed) — reset whenever no rendered row carries
  // the highlighted node id.
  $effect(() => {
    if (app.logHoverNodeId === null) return
    if (app.logsOpen && filtered.some((entry) => entry.nodeId === app.logHoverNodeId)) return
    app.logHoverNodeId = null
  })
</script>

<section class="ui-scaled relative shrink-0 border-t border-zinc-800 bg-surface">
  {#if app.logsOpen}
    <div
      class="absolute inset-x-0 -top-0.5 z-10 h-1 cursor-row-resize hover:bg-emerald-500/40"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize logs panel"
      onpointerdown={resizeStart}
    ></div>
  {/if}
  <header class="flex h-9 items-center gap-3 px-3">
    <button class="flex items-center gap-1.5 text-xs text-zinc-300" onclick={() => (app.logsOpen = !app.logsOpen)}>
      <Icon name="terminal" size={14} />
      Logs
      <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{filtered.length}</span>
    </button>
    {#if app.logsOpen}
      <div class="ml-auto flex items-center gap-1.5">
        <Icon name="filter_list" size={14} class="text-zinc-500" />
        <Select size="sm" surface="raised" bind:value={statusFilter}>
          <option value="all">all statuses</option>
          <option value="success">success only</option>
          <option value="failed">failed only</option>
        </Select>
      </div>
      <div class="relative">
        <Icon name="search" size={14} class="absolute top-1/2 left-2 -translate-y-1/2 text-zinc-600" />
        <!-- Stays raw: the leading-icon inset (pl-7) conflicts with ui/Input's size-owned padding. -->
        <input
          class="w-56 rounded-md border border-zinc-800 bg-zinc-900 py-1 pr-2 pl-7 text-[11px] outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          placeholder="Filter by node, URL, run…"
          bind:value={query}
        />
      </div>
      <IconButton
        icon="delete_sweep"
        label="Clear logs"
        title="Clear logs"
        tone="danger"
        disabled={app.logs.length === 0}
        onclick={clearLogs}
      />
      <IconButton
        icon="remove"
        label="Collapse logs"
        title="Collapse logs"
        onclick={() => (app.logsOpen = false)}
      />
    {:else}
      <IconButton
        class="ml-auto"
        icon="expand_less"
        label="Expand logs"
        title="Expand logs"
        onclick={() => (app.logsOpen = true)}
      />
    {/if}
  </header>

  {#if app.logsOpen}
    <div class="h-(--logs-h) overflow-y-auto border-t border-zinc-800/60" style="--logs-h:{panelHeight}px">
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
              class="cursor-pointer border-t border-zinc-800/40 hover:bg-zinc-800/40 {entryFailed(entry)
                ? 'bg-rose-500/5'
                : ''}"
              onclick={() => (expandedId = expandedId === entry.id ? null : entry.id)}
              onpointerenter={() => (app.logHoverNodeId = entry.nodeId)}
              onpointerleave={() => (app.logHoverNodeId = null)}
            >
              <td class="px-3 py-1.5 font-mono text-zinc-500">{entry.time}</td>
              <td class="px-2 py-1.5 text-zinc-300">
                {entry.node}{#if entry.iteration !== undefined}<span
                    class="ml-1.5 rounded bg-emerald-500/10 px-1 py-0.5 font-mono text-[10px] text-emerald-300/80"
                    >#{entry.iteration + 1}</span
                  >{/if}
              </td>
              {#if entry.kind === 'transform'}
                <!-- Transform rows have no URL: show what the step consumed instead. -->
                <td class="px-2 py-1.5">
                  <span class="mr-1.5 inline-flex items-center gap-1 rounded bg-violet-500/15 px-1 py-0.5 text-[10px] font-semibold text-violet-300">
                    <Icon name="function" size={11} />
                    transform
                  </span>
                  <span class="font-mono text-zinc-400">
                    {entry.inputNodes.length > 0 ? `in: ${entry.inputNodes.join(', ')}` : '—'}
                  </span>
                </td>
                <td class="px-2 py-1.5 text-right font-mono {entry.error ? 'text-rose-400' : 'text-emerald-400'}">
                  {entry.error ? 'failed' : 'ok'}
                </td>
              {:else if entry.kind === 'mock'}
                <td class="px-2 py-1.5">
                  <span class="mr-1.5 inline-flex items-center gap-1 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] font-semibold text-amber-300">
                    <Icon name="data_object" size={11} />
                    mock
                  </span>
                </td>
                <td class="px-2 py-1.5 text-right font-mono {entry.error ? 'text-rose-400' : httpStatusClass(entry.status)}">
                  {entry.error ? 'failed' : entry.status}
                </td>
              {:else if entry.kind === 'delay'}
                <td class="px-2 py-1.5">
                  <span class="mr-1.5 inline-flex items-center gap-1 rounded bg-sky-500/15 px-1 py-0.5 text-[10px] font-semibold text-sky-300">
                    <Icon name="timer" size={11} />
                    delay
                  </span>
                  <span class="font-mono text-zinc-400">waited {formatDuration(entry.durationMs)}</span>
                </td>
                <td class="px-2 py-1.5 text-right font-mono {entry.error ? 'text-rose-400' : 'text-emerald-400'}">
                  {entry.error ? 'failed' : 'ok'}
                </td>
              {:else if entry.kind === 'for'}
                <!-- Loop summary rows show the iteration total; per-iteration
                     detail lives in the child rows carrying #k chips. -->
                <td class="px-2 py-1.5">
                  <span class="mr-1.5 inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1 py-0.5 text-[10px] font-semibold text-emerald-300">
                    <Icon name="laps" size={11} />
                    loop
                  </span>
                  <span class="font-mono text-zinc-400">
                    {entry.iterations} iteration{entry.iterations === 1 ? '' : 's'}
                  </span>
                </td>
                <td class="px-2 py-1.5 text-right font-mono {entry.error ? 'text-rose-400' : 'text-emerald-400'}">
                  {entry.error ? 'failed' : 'ok'}
                </td>
              {:else}
                <td class="px-2 py-1.5">
                  <span class="mr-1.5 rounded px-1 py-0.5 text-[10px] font-semibold {methodBadge[entry.method]}">{entry.method}</span>
                  <span class="font-mono text-zinc-400">{entry.url}</span>
                </td>
                <!-- No status means the call never reached a server; the row reads like the other kinds' failures. -->
                <td class="px-2 py-1.5 text-right font-mono {entry.status === undefined ? 'text-rose-400' : httpStatusClass(entry.status)}">
                  {entry.status ?? 'failed'}
                </td>
              {/if}
              <td class="px-3 py-1.5 text-right font-mono text-zinc-500">{formatDuration(entry.durationMs)}</td>
            </tr>
            {#if expandedId === entry.id}
              <tr class="border-t border-zinc-800/40 bg-zinc-900/60">
                <td colspan="5" class="px-4 py-2">
                  {#if entry.error}
                    <p class="pb-2 text-[11px] text-rose-400">{entry.error}</p>
                  {/if}
                  {#if entry.kind === 'transform' || entry.kind === 'mock'}
                    <div>
                      <p class="pb-1 text-[10px] tracking-wide text-zinc-600 uppercase">Output</p>
                      <pre class="overflow-x-auto rounded-md bg-zinc-950 p-2 font-mono text-[10px] text-zinc-400">{entry.output ?? '—'}</pre>
                    </div>
                  {:else if entry.kind === 'delay'}
                    <p class="text-[11px] text-zinc-500">
                      waited {formatDuration(entry.durationMs)}, then passed its upstream output through
                    </p>
                  {:else if entry.kind === 'for'}
                    <p class="text-[11px] text-zinc-500">
                      {entry.iterations} iteration{entry.iterations === 1 ? '' : 's'} —
                      per-iteration rows are logged individually above.
                    </p>
                  {:else}
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
                  {/if}
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
