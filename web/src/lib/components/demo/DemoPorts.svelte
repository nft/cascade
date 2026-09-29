<script lang="ts">
  import { DEMO_NODES, type DemoLayout } from '$demo/board'
  import { inPort, outPort } from '$demo/geometry'

  // Every runnable card has an input and an output handle, connected or not,
  // drawn above the cards like xyflow's handles.
  const PORT_RADIUS = 5
  const PORT_STROKE = 1

  let { layout }: { layout: DemoLayout } = $props()

  const ports = $derived(
    DEMO_NODES.flatMap((node) => {
      const box = layout.boxes[node.id]
      if (!box || node.kind === 'note') return []
      return [inPort(box, layout.flow), outPort(box, layout.flow)]
    }),
  )
</script>

<svg
  viewBox="0 0 {layout.width} {layout.height}"
  class="pointer-events-none absolute inset-0 size-full overflow-visible"
  aria-hidden="true"
>
  {#each ports as port (`${port.x},${port.y}`)}
    <circle cx={port.x} cy={port.y} r={PORT_RADIUS} class="fill-zinc-800 stroke-zinc-500" stroke-width={PORT_STROKE} />
  {/each}
</svg>
