<script lang="ts">
  import JsonBlock from '$components/ui/JsonBlock.svelte'
  import { BOARD_FILE } from '$content/boardFile'
  import type { FeatureVisual } from '$content/features'
  import { SHOTS } from '$lib/screenshots'
  import DataFolder from './DataFolder.svelte'
  import NodeKinds from './NodeKinds.svelte'
  import ShotStage from './ShotStage.svelte'

  let { visual }: { visual: FeatureVisual } = $props()
</script>

{#if visual.kind === 'shot'}
  <ShotStage shot={SHOTS[visual.shot]} alt={visual.alt} />
{:else if visual.kind === 'node-kinds'}
  <NodeKinds />
{:else if visual.kind === 'data-folder'}
  <DataFolder />
{:else}
  <JsonBlock
    name={BOARD_FILE.name}
    lines={BOARD_FILE.lines}
    class="overflow-hidden rounded-3xl border border-white/8 shadow-card"
  />
{/if}
