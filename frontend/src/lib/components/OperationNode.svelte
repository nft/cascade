<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte'
  import { isDanglingCredential } from '../credentials'
  import type { OperationNodeData } from '../model'
  import { urlHost } from '../request'
  import { app } from '../state.svelte'
  import { methodBadge, statusDot, statusLabel } from '../ui'
  import Icon from './Icon.svelte'

  let { id, data, selected = false }: { id: string; data: OperationNodeData; selected?: boolean } = $props()

  // Dangling reference (plan 04 K5): the credential was deleted after this
  // node was pointed at it. The run fails loudly Go-side; the badge makes the
  // problem visible before anything is sent.
  const danglingCredential = $derived(isDanglingCredential(app.credentials, data.credential))
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
          app.simulateRun(id, 'downstream')
        }}
        title="Run this node and the chain after it"
        aria-label="Run this node"
      >
        <Icon name="play_arrow" size={14} />
      </button>
    </span>
  </div>

  <div class="space-y-1.5 px-3 py-2">
    <p class="truncate font-mono text-[11px] text-zinc-500">{data.path}</p>
    <div class="flex items-center gap-1.5">
      {#if data.origin}
        <!-- Origin override (plan 08 A1): "this node talks elsewhere" must be visible on the canvas. -->
        <span
          class="flex min-w-0 items-center gap-0.5 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300"
          title={data.origin}
        >
          <Icon name="public" size={11} />
          <span class="truncate">{urlHost(data.origin)}</span>
        </span>
      {:else}
        <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{data.environment}</span>
      {/if}
      {#if danglingCredential}
        <span
          class="flex min-w-0 items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300"
          title="credential {data.credential} no longer exists — pick another one or None in the inspector"
        >
          <Icon name="warning" size={11} />
          <span class="truncate">{data.credential}</span>
        </span>
      {:else}
        <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] {data.credential ? 'text-zinc-500' : 'text-zinc-600'}">
          {data.credential || 'none'}
        </span>
      {/if}
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
