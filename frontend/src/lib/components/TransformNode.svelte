<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte'
  import type { TransformNodeData } from '../model'
  import {
    CARD_ROW_CAP,
    capturedBodyShape,
    isResultStale,
    pickRowSummaries,
    scriptSummary,
    withOverflow,
  } from '../nodeIO'
  import { keyByNodeId } from '../refs'
  import { app } from '../state.svelte'
  import { statusDot, statusLabel } from '../ui'
  import Icon from './Icon.svelte'
  import NodeBodyShape from './NodeBodyShape.svelte'

  let { id, data, selected = false }: { id: string; data: TransformNodeData; selected?: boolean } = $props()

  const keys = $derived(keyByNodeId(app.nodes))
  // The pick rows are both what the node reads and what it produces, so they
  // stand in for the "uses" row other cards carry.
  const rows = $derived(withOverflow(pickRowSummaries(data.pick, keys), CARD_ROW_CAP))
  const script = $derived(scriptSummary(data.script))
  // Script mode says nothing about its output on its own, so the card shows the
  // shape of what the script last returned, titled by the key downstream nodes
  // reference it under.
  const captured = $derived(app.responses[id])
  const result = $derived(capturedBodyShape(captured))
  const resultStale = $derived(isResultStale(captured, data.transformEditedAt))
</script>

<!-- Transform card: function icon, no method badge and no
     env/credential row — a transform has no target, it only reshapes. -->
<div
  class="group w-56 rounded-lg border bg-zinc-900 shadow-lg {selected
    ? 'border-violet-500'
    : 'border-zinc-700 hover:border-zinc-500'} {app.logHoverNodeId === id
    ? 'ring-2 ring-sky-400/70'
    : ''}"
>
  <Handle type="target" position={Position.Left} class="!h-2.5 !w-2.5 !border-zinc-500 !bg-zinc-800" />

  <div class="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
    <span class="flex items-center rounded bg-violet-500/15 px-1 py-0.5 text-violet-300">
      <Icon name="function" size={13} />
    </span>
    <span class="truncate text-xs font-medium text-zinc-100">{data.name}</span>
    <span class="ml-auto flex shrink-0 items-center gap-1">
      <button
        class="nodrag flex items-center rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-400 disabled:cursor-not-allowed disabled:text-zinc-600 {selected
          ? ''
          : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}"
        disabled={app.isRunning}
        onclick={(e) => {
          e.stopPropagation()
          app.run(id, 'downstream')
        }}
        title="Run this node and the chain after it"
        aria-label="Run this node"
      >
        <Icon name="play_arrow" size={14} />
      </button>
    </span>
  </div>

  <div class="space-y-1.5 px-3 py-2">
    {#if data.mode === 'script'}
      <p
        class="truncate font-mono text-[11px] {script.empty ? 'text-zinc-600' : 'text-zinc-400'}"
        title={script.empty ? undefined : data.script}
      >
        {script.line}
      </p>
      <NodeBodyShape shape={result} label={data.key} stale={resultStale} />
    {:else if rows.shown.length === 0}
      <p class="font-mono text-[11px] text-zinc-600">pick · no rows yet</p>
    {:else}
      <div class="space-y-0.5">
        {#each rows.shown as row}
          <div class="flex min-w-0 items-center gap-1">
            <span class="max-w-24 truncate font-mono text-[11px] text-violet-300">{row.key}</span>
            <Icon name="arrow_left_alt" size={11} class="shrink-0 text-zinc-600" />
            <span class="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-500" title={row.expr}>
              {row.expr}
            </span>
          </div>
        {/each}
        {#if rows.more > 0}
          <p class="text-[10px] text-zinc-600">+{rows.more} more</p>
        {/if}
      </div>
    {/if}
    <div class="flex items-center gap-1.5 pt-0.5">
      <span class="h-2 w-2 rounded-full {statusDot[data.status]}"></span>
      <span class="text-[10px] text-zinc-400">{statusLabel[data.status]}</span>
      {#if data.note}
        <span class="truncate text-[10px] text-rose-400" title={data.note}>· {data.note}</span>
      {/if}
    </div>
  </div>

  <Handle type="source" position={Position.Right} class="!h-2.5 !w-2.5 !border-zinc-500 !bg-zinc-800" />
</div>
