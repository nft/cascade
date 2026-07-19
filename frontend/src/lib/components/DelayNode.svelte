<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte'
  import type { DelayNodeData } from '../model'
  import { app } from '../state.svelte'
  import { statusDot, statusLabel } from '../ui'
  import Icon from './Icon.svelte'

  let { id, data, selected = false }: { id: string; data: DelayNodeData; selected?: boolean } = $props()

  const MS_PER_SECOND = 1000
  const COUNTDOWN_TICK_MS = 100

  function fmtMs(ms: number): string {
    return ms >= MS_PER_SECOND
      ? `${(ms / MS_PER_SECOND).toLocaleString('en-US', { maximumFractionDigits: 1 })} s`
      : `${Math.ceil(ms)} ms`
  }

  let duration = $derived(fmtMs(data.durationMs))

  // Countdown of the *configured* wait while running (plan 09 N3). The demo
  // sim caps its actual sleep, so the countdown may end early — it disappears
  // the moment the node completes, and matches exactly once M1 wires in.
  let remainingMs = $state(0)
  $effect(() => {
    if (data.status !== 'running') return
    const startedAt = performance.now()
    remainingMs = data.durationMs
    const tick = setInterval(() => {
      remainingMs = Math.max(0, data.durationMs - (performance.now() - startedAt))
    }, COUNTDOWN_TICK_MS)
    return () => clearInterval(tick)
  })
</script>

<!-- Delay card (plan 09 N3): timer icon and the configured duration as the
     subtitle — a timed gate, nothing to configure beyond the wait. -->
<div
  class="group w-56 rounded-lg border bg-zinc-900 shadow-lg {selected
    ? 'border-sky-500'
    : 'border-zinc-700 hover:border-zinc-500'} {app.logHoverNodeId === id
    ? 'ring-2 ring-sky-400/70'
    : ''}"
>
  <Handle type="target" position={Position.Left} class="!h-2.5 !w-2.5 !border-zinc-500 !bg-zinc-800" />

  <div class="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
    <span class="flex items-center rounded bg-sky-500/15 px-1 py-0.5 text-sky-300">
      <Icon name="timer" size={13} />
    </span>
    <span class="truncate text-xs font-medium text-zinc-100">{data.name}</span>
    <button
      class="nodrag ml-auto flex shrink-0 items-center rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-400 disabled:cursor-not-allowed disabled:text-zinc-600 {selected
        ? ''
        : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}"
      disabled={app.isRunning}
      onclick={(e) => {
        e.stopPropagation()
        app.simulateRun(id, 'downstream')
      }}
      title="Run this node and the chain after it"
      aria-label="Run this node"
    >
      <Icon name="play_arrow" size={14} />
    </button>
  </div>

  <div class="space-y-1.5 px-3 py-2">
    <p class="font-mono text-[11px] text-zinc-500">{duration}</p>
    <div class="flex items-center gap-1.5 pt-0.5">
      <span class="h-2 w-2 rounded-full {statusDot[data.status]}"></span>
      <span class="text-[10px] text-zinc-400">{statusLabel[data.status]}</span>
      {#if data.status === 'running'}
        <span class="font-mono text-[10px] text-sky-300">· {fmtMs(remainingMs)} left</span>
      {:else if data.note}
        <span class="truncate text-[10px] text-rose-400" title={data.note}>· {data.note}</span>
      {/if}
    </div>
  </div>

  <Handle type="source" position={Position.Right} class="!h-2.5 !w-2.5 !border-zinc-500 !bg-zinc-800" />
</div>
