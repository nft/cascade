<script lang="ts">
  // Test-only wrapper: ContextMenu calls useSvelteFlow(), which needs a provider.
  import { SvelteFlowProvider } from '@xyflow/svelte'
  import ContextMenu from '../ContextMenu.svelte'
</script>

<SvelteFlowProvider>
  <ContextMenu />
</SvelteFlowProvider>
