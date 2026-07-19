<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte'
  import type { ForNodeData } from '../model'
  import { app } from '../state.svelte'
  import Icon from './Icon.svelte'

  let { id, data, selected = false }: { id: string; data: ForNodeData; selected?: boolean } = $props()

  let modeChip = $derived(
    data.mode === 'count' ? `×${data.count}` : `each: ${data.source?.path || '—'}`,
  )
</script>

<!-- For container (plan 09 N5): a group node children render inside. Header
     bar only for now — resize, progress and drop-based re-parenting land
     with N5. -->
<div
  class="group h-full min-h-40 w-full min-w-64 rounded-lg border bg-zinc-900/40 {selected
    ? 'border-emerald-500'
    : 'border-zinc-700 hover:border-zinc-500'} {app.logHoverNodeId === id
    ? 'ring-2 ring-sky-400/70'
    : ''}"
>
  <Handle type="target" position={Position.Left} class="!h-2.5 !w-2.5 !border-zinc-500 !bg-zinc-800" />

  <div class="flex items-center gap-2 rounded-t-lg border-b border-zinc-800 bg-zinc-900 px-3 py-2">
    <span class="flex items-center rounded bg-emerald-500/15 px-1 py-0.5 text-emerald-300">
      <Icon name="laps" size={13} />
    </span>
    <span class="truncate text-xs font-medium text-zinc-100">{data.name}</span>
    <span class="ml-auto shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
      {modeChip}
    </span>
  </div>

  <Handle type="source" position={Position.Right} class="!h-2.5 !w-2.5 !border-zinc-500 !bg-zinc-800" />
</div>
