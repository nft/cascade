<script lang="ts">
  import type { DemoLayout } from '$demo/board'
  import { getDemoRunner } from '$demo/context'
  import type { EdgePath } from '$demo/geometry'

  // Widths in canvas units, as xyflow draws edges: 1 at rest, 2 while active.
  const EDGE_WIDTH = 1.25
  const ACTIVE_WIDTH = 2
  const DASH = 5

  let { layout, edges }: { layout: DemoLayout; edges: readonly EdgePath[] } = $props()

  const runner = getDemoRunner()
</script>

<svg
  viewBox="0 0 {layout.width} {layout.height}"
  class="pointer-events-none absolute inset-0 size-full overflow-visible"
  aria-hidden="true"
>
  {#each edges as edge (edge.id)}
    {@const state = runner.edges[edge.id] ?? 'idle'}
    <path d={edge.d} class="fill-none stroke-zinc-600" stroke-width={EDGE_WIDTH} />
    {#if state === 'flowing'}
      <!-- The app's active edge: emerald dashes walking toward the target. -->
      <path
        d={edge.d}
        class="animate-dash fill-none stroke-emerald-500 motion-reduce:animate-none"
        stroke-width={ACTIVE_WIDTH}
        stroke-dasharray={DASH}
      />
    {:else if state === 'done'}
      <path d={edge.d} class="fill-none stroke-emerald-500/45" stroke-width={ACTIVE_WIDTH} />
    {/if}
  {/each}
</svg>
