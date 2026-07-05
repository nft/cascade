<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte'
  import type { OperationNodeData } from '../model'
  import { app } from '../state.svelte'
  import { methodBadge, statusDot, statusLabel } from '../ui'
  import Icon from './Icon.svelte'

  let { id, data, selected = false }: { id: string; data: OperationNodeData; selected?: boolean } = $props()
</script>

<div
  class="group w-56 rounded-lg border bg-zinc-900 shadow-lg {selected
    ? 'border-emerald-500'
    : 'border-zinc-700 hover:border-zinc-500'}"
>
  <Handle type="target" position={Position.Left} class="!h-2.5 !w-2.5 !border-zinc-500 !bg-zinc-800" />

  <div class="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
    <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold {methodBadge[data.method]}">{data.method}</span>
    <span class="truncate text-xs font-medium text-zinc-100">{data.name}</span>
    <span class="ml-auto flex shrink-0 items-center gap-1">
      {#if data.repeat > 1}
        <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">×{data.repeat}</span>
      {/if}
      <button
        class="nodrag flex items-center rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-400 disabled:cursor-not-allowed disabled:text-zinc-600 {selected
          ? ''
          : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}"
        disabled={app.isRunning}
        onclick={(e) => {
          e.stopPropagation()
          app.simulateRun(id, 'upstream')
        }}
        title="Run this node and its upstream"
        aria-label="Run this node"
      >
        <Icon name="play_arrow" size={14} />
      </button>
    </span>
  </div>

  <div class="space-y-1.5 px-3 py-2">
    <p class="truncate font-mono text-[11px] text-zinc-500">{data.path}</p>
    <div class="flex items-center gap-1.5">
      <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{data.environment}</span>
      <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{data.credential}</span>
    </div>
    <div class="flex items-center gap-1.5 pt-0.5">
      <span class="h-2 w-2 rounded-full {statusDot[data.status]}"></span>
      <span class="text-[10px] text-zinc-400">{statusLabel[data.status]}</span>
      {#if data.note}
        <span class="truncate text-[10px] text-rose-400">· {data.note}</span>
      {/if}
    </div>
  </div>

  <Handle type="source" position={Position.Right} class="!h-2.5 !w-2.5 !border-zinc-500 !bg-zinc-800" />
</div>
