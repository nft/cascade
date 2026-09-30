<script lang="ts">
  // Publishes flow-instance helpers to code outside the SvelteFlow context:
  // keyboard paste needs the canvas center as a flow position,
  // but useSvelteFlow only works inside <SvelteFlow>. Renders nothing.
  import { useSvelteFlow } from '@xyflow/svelte'
  import { app } from '../state.svelte'

  let { container }: { container: HTMLElement | null } = $props()
  const { screenToFlowPosition } = useSvelteFlow()

  $effect(() => {
    const el = container
    if (!el) return
    app.pasteTarget = () => {
      const rect = el.getBoundingClientRect()
      return screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    }
    return () => {
      app.pasteTarget = null
    }
  })
</script>
