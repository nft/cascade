<script lang="ts">
  import { Background, Controls, MiniMap, SvelteFlow } from '@xyflow/svelte'
  import '@xyflow/svelte/dist/style.css'
  import { decorateEdges } from '../graph'
  import { app } from '../state.svelte'
  import CanvasToolbar from './CanvasToolbar.svelte'
  import ContextMenu from './ContextMenu.svelte'
  import OperationNode from './OperationNode.svelte'

  const nodeTypes = { operation: OperationNode }

  const scissors = $derived(app.canvasTool === 'scissors')
  const displayEdges = $derived(decorateEdges(app.nodes, app.edges))

  function screenPoint(event: MouseEvent | TouchEvent) {
    const p = 'touches' in event ? event.touches[0] : event
    return { x: p?.clientX ?? 0, y: p?.clientY ?? 0 }
  }
</script>

<div class="min-h-0 flex-1 {scissors ? 'cursor-scissors' : ''}">
  <SvelteFlow
    bind:nodes={app.nodes}
    bind:edges={() => displayEdges, (v) => (app.edges = v)}
    {nodeTypes}
    colorMode="dark"
    fitView
    deleteKey={['Backspace', 'Delete']}
    panOnDrag={!scissors}
    elementsSelectable={!scissors}
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
    <Controls />
    <MiniMap
      class="!h-28 !w-40"
      bgColor="var(--color-surface)"
      maskColor="rgba(0,0,0,0.55)"
      nodeColor="#3f3f46"
    />
    <CanvasToolbar />
    <ContextMenu />
  </SvelteFlow>
</div>
