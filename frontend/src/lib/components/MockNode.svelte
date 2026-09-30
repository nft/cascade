<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte'
  import type { MockNodeData } from '../model'
  import { app } from '../state.svelte'
  import { statusDot, statusLabel } from '../ui'
  import Icon from './Icon.svelte'

  let { id, data, selected = false }: { id: string; data: MockNodeData; selected?: boolean } = $props()

  // Config-tier warning: an unparseable body only fails this node
  // at run time, but the card flags it live while editing.
  let parses = $derived.by(() => {
    try {
      JSON.parse(data.body)
      return true
    } catch {
      return false
    }
  })
</script>

<!-- Mock card: data icon, no method badge and no env/credential
     row — a mock has no target, it just emits its authored JSON. -->
<div
  class="group w-56 rounded-lg border bg-zinc-900 shadow-lg {selected
    ? 'border-amber-500'
    : 'border-zinc-700 hover:border-zinc-500'} {app.logHoverNodeId === id
    ? 'ring-2 ring-sky-400/70'
    : ''}"
>
  <Handle type="target" position={Position.Left} class="!h-2.5 !w-2.5 !border-zinc-500 !bg-zinc-800" />

  <div class="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
    <span class="flex items-center rounded bg-amber-500/15 px-1 py-0.5 text-amber-300">
      <Icon name="data_object" size={13} />
    </span>
    <span class="truncate text-xs font-medium text-zinc-100">{data.name}</span>
    <span class="ml-auto flex shrink-0 items-center gap-1">
      {#if !parses}
        <span class="flex items-center text-amber-400" title="Body is not valid JSON — this node will fail when run">
          <Icon name="warning" size={13} />
        </span>
      {/if}
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
    <p class="font-mono text-[11px] text-zinc-500">mock · {data.statusCode}</p>
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
