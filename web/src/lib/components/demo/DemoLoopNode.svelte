<script lang="ts">
  import Icon from '$components/ui/Icon.svelte'
  import type { LoopNodeSpec } from '$demo/board'
  import { getDemoRunner } from '$demo/context'
  import { LOOP_BORDER } from '$demo/styles'

  // The app's loop container (ForNode.svelte). Its child is a separate node
  // placed inside it, as on the real canvas.
  let { node }: { node: LoopNodeSpec } = $props()

  const runner = getDemoRunner()
  const status = $derived(runner.status[node.id] ?? 'idle')
</script>

<div class="h-full rounded-lg border bg-zinc-900/40 transition-colors duration-300 {LOOP_BORDER[status]}">
  <div class="flex items-center gap-2 rounded-t-lg border-b border-zinc-800 bg-zinc-900 px-3 py-2">
    <span class="flex items-center rounded-sm bg-emerald-500/15 px-1 py-0.5 text-emerald-300">
      <Icon name="laps" size="1.3em" />
    </span>
    <span class="truncate text-[1.2em] leading-none font-medium text-zinc-100">{node.name}</span>
    <span class="ml-auto flex shrink-0 items-center gap-1.5 leading-tight">
      {#if status === 'running'}
        <span class="rounded-sm bg-sky-500/15 px-1.5 py-0.5 font-mono text-sky-300">{runner.loopDone}/{node.count}</span>
      {/if}
      <span class="rounded-sm bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-400">×{node.count}</span>
    </span>
  </div>
</div>
