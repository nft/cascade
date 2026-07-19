<script lang="ts">
  import { Handle, NodeResizer, Position } from '@xyflow/svelte'
  import {
    FOR_MAX_ITERATIONS,
    FOR_MIN_COUNT,
    isRunnableNode,
    type ForNodeData,
    type NodeStatus,
  } from '../model'
  import { ancestorNodes } from '../picker'
  import { app } from '../state.svelte'
  import Icon from './Icon.svelte'

  let { id, data, selected = false }: { id: string; data: ForNodeData; selected?: boolean } = $props()

  const MIN_WIDTH = 256
  const MIN_HEIGHT = 160

  // Chip shows the source by key with the near-universal body. prefix
  // dropped ("each: listUsers.items") — full path lives in the inspector.
  const sourceLabel = $derived.by(() => {
    const src = data.source
    if (!src) return '—'
    const owner = app.nodes.find((n) => n.id === src.nodeId)
    const key = owner && isRunnableNode(owner) ? owner.data.key : '?'
    const path = src.path.replace(/^body\.?/, '')
    return path === '' ? key : `${key}.${path}`
  })
  let modeChip = $derived(data.mode === 'count' ? `×${data.count}` : `each: ${sourceLabel}`)
  let hasChildren = $derived(app.nodes.some((n) => n.parentId === id))

  // Config-tier warnings (plan 09): these fail only this node at run time,
  // but the container flags them live while editing.
  let configWarning = $derived.by(() => {
    if (!hasChildren) return 'Empty loop — drag nodes inside; it will fail when run'
    if (data.mode === 'each' && !data.source) return 'Each mode needs an upstream array source'
    if (
      data.mode === 'each' &&
      data.source &&
      !ancestorNodes(app.nodes, app.edges, id).some(({ node }) => node.id === data.source?.nodeId)
    )
      return 'Each source is not an upstream of this loop'
    if (data.mode === 'count' && (data.count < FOR_MIN_COUNT || data.count > FOR_MAX_ITERATIONS))
      return `Count must be ${FOR_MIN_COUNT}–${FOR_MAX_ITERATIONS.toLocaleString('en-US')}`
    return null
  })

  // The run state colors the frame — the container has no status row.
  const statusBorder: Record<NodeStatus, string> = {
    idle: 'border-zinc-700 hover:border-zinc-500',
    running: 'border-sky-500/80',
    success: 'border-emerald-500/60',
    failed: 'border-rose-500/70',
    skipped: 'border-zinc-600 border-dashed',
    stale: 'border-zinc-700 hover:border-zinc-500',
  }
</script>

<!-- For container (plan 09 N5): a resizable group node children render
     inside. Membership changes on drop, handled by the canvas. -->
<NodeResizer isVisible={selected} minWidth={MIN_WIDTH} minHeight={MIN_HEIGHT} />
<div
  class="group h-full min-h-40 w-full min-w-64 rounded-lg border bg-zinc-900/40 {selected
    ? 'border-emerald-500'
    : statusBorder[data.status]} {app.logHoverNodeId === id ? 'ring-2 ring-sky-400/70' : ''}"
>
  <Handle type="target" position={Position.Left} class="!h-2.5 !w-2.5 !border-zinc-500 !bg-zinc-800" />

  <div class="flex items-center gap-2 rounded-t-lg border-b border-zinc-800 bg-zinc-900 px-3 py-2">
    <span class="flex items-center rounded bg-emerald-500/15 px-1 py-0.5 text-emerald-300">
      <Icon name="laps" size={13} />
    </span>
    <span class="truncate text-xs font-medium text-zinc-100">{data.name}</span>
    <span class="ml-auto flex shrink-0 items-center gap-1.5">
      {#if data.status === 'running' && data.progress}
        <span class="rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
          {data.progress.done}/{data.progress.total}
        </span>
      {/if}
      {#if data.status === 'failed' && data.note}
        <span class="max-w-40 truncate text-[10px] text-rose-400" title={data.note}>{data.note}</span>
      {/if}
      {#if configWarning}
        <span class="flex items-center text-amber-400" title={configWarning}>
          <Icon name="warning" size={13} />
        </span>
      {/if}
      <span class="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
        {modeChip}
      </span>
    </span>
  </div>

  <Handle type="source" position={Position.Right} class="!h-2.5 !w-2.5 !border-zinc-500 !bg-zinc-800" />
</div>
