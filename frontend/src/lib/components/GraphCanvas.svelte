<script lang="ts">
  import { Background, MiniMap, SvelteFlow } from '@xyflow/svelte'
  import '@xyflow/svelte/dist/style.css'
  import { sameScope } from '../containment'
  import { assertKnownNodeTypes, decorateEdges, polylinesIntersect, type Point } from '../graph'
  import { app } from '../state.svelte'
  import CanvasControls from './CanvasControls.svelte'
  import CanvasToolbar from './CanvasToolbar.svelte'
  import ContextMenu from './ContextMenu.svelte'
  import FlowBridge from './FlowBridge.svelte'
  import { nodeTypes, registeredNodeTypes } from './nodeTypes'

  // Unknown node types must fail loudly, not render as xyflow's default node.
  $effect(() => assertKnownNodeTypes(app.nodes, registeredNodeTypes))

  // The minimap's SVG takes its size from these props, not from CSS on the
  // panel; sizing the panel alone lets the default 200×150 map spill out.
  const MINIMAP_WIDTH = 160
  const MINIMAP_HEIGHT = 112

  const scissors = $derived(app.canvasTool === 'scissors')
  const interactive = $derived(!scissors && !app.canvasLocked)
  const displayEdges = $derived(
    decorateEdges(app.nodes, app.edges, app.activeRunIds, app.logHoverNodeId, app.contextEdgeId),
  )

  function screenPoint(event: MouseEvent | TouchEvent) {
    const p = 'touches' in event ? event.touches[0] : event
    return { x: p?.clientX ?? 0, y: p?.clientY ?? 0 }
  }

  // Scissors slice gesture: left-drag draws a trace; on release
  // every edge whose rendered path crosses it is cut, then the trace fades out.
  const EDGE_SAMPLES = 24
  const MIN_TRACE_STEP = 4
  const TRACE_FADE_MS = 500

  let containerEl = $state<HTMLDivElement | null>(null)
  let slicePoints = $state<Point[]>([])
  let sliceFading = $state(false)
  let slicing = false
  let fadeTimer: ReturnType<typeof setTimeout> | undefined

  function containerPoint(event: PointerEvent): Point {
    const rect = containerEl!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function sliceStart(event: PointerEvent) {
    if (!scissors || event.button !== 0 || !containerEl) return
    if ((event.target as HTMLElement).closest('button')) return
    slicing = true
    clearTimeout(fadeTimer)
    sliceFading = false
    slicePoints = [containerPoint(event)]
  }

  function sliceMove(event: PointerEvent) {
    if (!slicing) return
    const p = containerPoint(event)
    const last = slicePoints.at(-1)!
    if (Math.hypot(p.x - last.x, p.y - last.y) < MIN_TRACE_STEP) return
    slicePoints = [...slicePoints, p]
  }

  function sliceEnd() {
    if (!slicing) return
    slicing = false
    if (slicePoints.length < 2) {
      slicePoints = []
      return
    }
    cutEdgesAlong(slicePoints)
    sliceFading = true
    fadeTimer = setTimeout(() => {
      slicePoints = []
      sliceFading = false
    }, TRACE_FADE_MS)
  }

  /** Sample each rendered edge path in screen space and cut those crossing the trace. */
  function cutEdgesAlong(trace: Point[]) {
    if (!containerEl) return
    const rect = containerEl.getBoundingClientRect()
    for (const path of containerEl.querySelectorAll<SVGPathElement>('.svelte-flow__edge-path')) {
      const id = path.closest('.svelte-flow__edge')?.getAttribute('data-id')
      if (!id) continue
      const ctm = path.getScreenCTM()
      const total = path.getTotalLength()
      if (!ctm || !total) continue
      const samples: Point[] = []
      for (let i = 0; i <= EDGE_SAMPLES; i++) {
        const p = path.getPointAtLength((total * i) / EDGE_SAMPLES).matrixTransform(ctm)
        samples.push({ x: p.x - rect.left, y: p.y - rect.top })
      }
      if (polylinesIntersect(trace, samples)) app.removeEdge(id)
    }
  }
</script>

<svelte:window onpointermove={sliceMove} onpointerup={sliceEnd} />

<div
  bind:this={containerEl}
  role="application"
  aria-label="Request graph canvas"
  class="relative min-h-0 flex-1 {scissors ? 'cursor-scissors' : ''}"
  onpointerdown={sliceStart}
>
  <SvelteFlow
    bind:nodes={() => app.nodes, (v) => app.setNodesFromCanvas(v)}
    bind:edges={() => displayEdges, (v) => app.setEdgesFromCanvas(v)}
    {nodeTypes}
    colorMode="dark"
    fitView
    deleteKey={['Backspace', 'Delete']}
    panOnDrag={!scissors}
    elementsSelectable={interactive}
    nodesDraggable={interactive}
    nodesConnectable={interactive}
    isValidConnection={(conn) => sameScope(app.nodes, conn.source, conn.target)}
    onnodedragstop={({ nodes: dragged }) => {
      // Loop membership is decided on drop, not during the drag.
      for (const node of dragged) app.dropNode(node.id)
    }}
    onbeforedelete={async ({ nodes: doomed }) => {
      // Canvas deletion (Backspace) of a For that still has children routes
      // through the confirm dialog instead of orphaning them.
      const container = doomed.find(
        (n) => n.type === 'for' && app.nodes.some((c) => c.parentId === n.id),
      )
      if (!container) return true
      app.removeNodeRequest(container.id)
      return false
    }}
    onnodeclick={({ node }) => (app.selectedNodeId = node.id)}
    onpaneclick={() => {
      app.closeContextMenu()
      app.selectedNodeId = null
    }}
    onedgeclick={({ edge }) => {
      if (app.canvasTool === 'scissors') app.removeEdge(edge.id)
    }}
    onpanecontextmenu={({ event }) => {
      event.preventDefault()
      app.openContextMenu({ kind: 'pane', screen: screenPoint(event) })
    }}
    onnodecontextmenu={({ node, event }) => {
      event.preventDefault()
      app.openContextMenu({ kind: 'node', id: node.id, screen: screenPoint(event) })
    }}
    onedgecontextmenu={({ edge, event }) => {
      event.preventDefault()
      app.openContextMenu({ kind: 'edge', id: edge.id, screen: screenPoint(event) })
    }}
    onmovestart={() => app.closeContextMenu()}
  >
    <Background bgColor="#0b0b0e" patternColor="#27272a" />
    <CanvasControls />
    <MiniMap
      width={MINIMAP_WIDTH}
      height={MINIMAP_HEIGHT}
      bgColor="var(--color-surface)"
      maskColor="rgba(0,0,0,0.55)"
      nodeColor="#3f3f46"
    />
    <CanvasToolbar />
    <ContextMenu />
    <FlowBridge container={containerEl} />
  </SvelteFlow>

  {#if slicePoints.length > 1}
    <svg class="pointer-events-none absolute inset-0 z-20 h-full w-full">
      <polyline
        points={slicePoints.map((p) => `${p.x},${p.y}`).join(' ')}
        stroke-linecap="round"
        stroke-linejoin="round"
        class="fill-none stroke-white stroke-2 transition-opacity duration-500 ease-out {sliceFading
          ? 'opacity-0'
          : 'opacity-90'}"
      />
    </svg>
  {/if}
</div>
