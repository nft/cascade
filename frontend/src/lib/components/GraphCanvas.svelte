<script lang="ts">
  import { Background, Controls, MiniMap, SvelteFlow } from '@xyflow/svelte'
  import '@xyflow/svelte/dist/style.css'
  import { app } from '../state.svelte'
  import OperationNode from './OperationNode.svelte'

  const nodeTypes = { operation: OperationNode }
</script>

<div class="min-h-0 flex-1">
  <SvelteFlow
    bind:nodes={app.nodes}
    bind:edges={app.edges}
    {nodeTypes}
    colorMode="dark"
    fitView
    defaultEdgeOptions={{ animated: true }}
    onnodeclick={({ node }) => (app.selectedNodeId = node.id)}
    onpaneclick={() => (app.selectedNodeId = null)}
  >
    <Background bgColor="#0b0b0e" patternColor="#27272a" />
    <Controls />
    <MiniMap
      class="!h-28 !w-40"
      bgColor="#101013"
      maskColor="rgba(0,0,0,0.55)"
      nodeColor="#3f3f46"
    />
  </SvelteFlow>
</div>
