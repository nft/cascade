<script lang="ts">
  import { DEMO_CREDENTIAL, DEMO_ENVIRONMENT, USES_PATH, type HttpNodeSpec } from '$demo/board'
  import { getDemoRunner } from '$demo/context'
  import { METHOD_BADGE, NODE_BORDER, STATUS_DOT } from '$demo/styles'

  // The app's request card (OperationNode.svelte): method and name, path,
  // environment and credential, what it reads from upstream, run status.
  let { node }: { node: HttpNodeSpec } = $props()

  const runner = getDemoRunner()
  const status = $derived(runner.status[node.id] ?? 'idle')
  const output = $derived(runner.outputs[node.id])
  const starts = $derived(runner.starts[node.id] ?? 0)
</script>

<div
  class="flex h-full flex-col overflow-hidden rounded-lg border bg-zinc-900 shadow-lg transition-colors duration-300 {NODE_BORDER[
    status
  ]}"
>
  <div class="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
    <span class="rounded-sm px-1.5 py-0.5 text-[1em] leading-none font-semibold {METHOD_BADGE[node.method]}"
      >{node.method}</span
    >
    <span class="truncate text-[1.2em] leading-none font-medium text-zinc-100">{node.name}</span>
  </div>

  <div class="flex flex-1 flex-col justify-between px-3 py-2">
    <p class="truncate font-mono text-[1.1em] leading-tight text-zinc-500">{node.path}</p>
    <div class="flex gap-1.5 leading-tight">
      <span class="rounded-sm bg-zinc-800 px-1.5 py-0.5 text-zinc-400">{DEMO_ENVIRONMENT}</span>
      <span class="rounded-sm bg-zinc-800 px-1.5 py-0.5 text-zinc-500">{DEMO_CREDENTIAL}</span>
    </div>
    {#if node.uses}
      <div class="flex min-w-0 items-center gap-1">
        <span class="shrink-0 text-[0.9em] tracking-wide text-zinc-600 uppercase">uses</span>
        <!-- Re-created on every start, so the arrival ring replays per iteration. -->
        {#key starts}
          <span
            class="min-w-0 truncate rounded-sm bg-sky-500/10 px-1 font-mono text-sky-300 {starts > 0 ? 'animate-arrive' : ''}"
            >{node.uses}.{USES_PATH}</span
          >
        {/key}
      </div>
    {/if}
    <div class="flex min-w-0 items-center gap-1.5">
      <span class="size-2 shrink-0 rounded-full {STATUS_DOT[status]}"></span>
      <span class="text-zinc-400">{status}</span>
      {#if output}
        <span class="ml-auto truncate font-mono text-zinc-500">{output}</span>
      {/if}
    </div>
  </div>
</div>
