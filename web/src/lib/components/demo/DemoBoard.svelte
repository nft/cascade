<script lang="ts">
  import { DEMO_EDGES, DEMO_NODES, type DemoLayout } from '$demo/board'
  import { layoutEdges } from '$demo/geometry'
  import DemoEdges from './DemoEdges.svelte'
  import DemoHttpNode from './DemoHttpNode.svelte'
  import DemoLoopNode from './DemoLoopNode.svelte'
  import DemoNoteNode from './DemoNoteNode.svelte'
  import DemoPorts from './DemoPorts.svelte'

  // One arrangement of the board, scaled to its container's width in CSS:
  // the wrapper is the size container the canvas units resolve against.
  let { layout, class: cls = '' }: { layout: DemoLayout; class?: string } = $props()

  const edges = $derived(layoutEdges(layout, DEMO_EDGES))
  const placed = $derived(
    DEMO_NODES.flatMap((node) => {
      const box = layout.boxes[node.id]
      return box ? [{ node, box }] : []
    }),
  )
</script>

<div class="@container {cls}">
  <div
    class="canvas-units relative aspect-(--ratio) text-zinc-300"
    style:--cw={layout.width}
    style:--ratio="{layout.width} / {layout.height}"
  >
    <DemoEdges {layout} {edges} />
    {#each placed as { node, box } (node.id)}
      <div class="canvas-box" style:--x={box.x} style:--y={box.y} style:--w={box.w} style:--h={box.h}>
        {#if node.kind === 'http'}
          <DemoHttpNode {node} />
        {:else if node.kind === 'loop'}
          <DemoLoopNode {node} />
        {:else}
          <DemoNoteNode {node} />
        {/if}
      </div>
    {/each}
    <DemoPorts {layout} />
  </div>
</div>
