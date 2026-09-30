<script lang="ts">
  // One collection-request row: method badge, name, url tooltip.
  // ws requests render disabled — the protocol is a reserved stub until
  // WebSocket lands.
  import type { RequestDef } from '../../model'
  import { methodBadge } from '../../ui'

  const WS_TITLE = 'WebSocket requests land later'

  let {
    request,
    onpick,
    oncontextmenu,
  }: {
    request: RequestDef
    onpick: () => void
    oncontextmenu: (event: MouseEvent) => void
  } = $props()

  const isWs = $derived(request.protocol === 'ws')
</script>

<button
  class="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-zinc-800/70 disabled:cursor-not-allowed disabled:opacity-50"
  disabled={isWs}
  onclick={onpick}
  {oncontextmenu}
  title={isWs ? WS_TITLE : `${request.name} · ${request.url}`}
>
  {#if isWs}
    <span class="w-12 shrink-0 rounded bg-zinc-500/15 px-1 py-0.5 text-center text-[10px] font-semibold text-zinc-400 uppercase">
      ws
    </span>
  {:else}
    <span class="w-12 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-semibold {methodBadge[request.method ?? 'GET']}">
      {request.method ?? 'GET'}
    </span>
  {/if}
  <span class="truncate text-[11px] text-zinc-300">{request.name}</span>
</button>
