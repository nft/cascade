<script lang="ts">
  import type { NoteNodeSpec } from '$demo/board'

  // The app's sticky note (NoteNode.svelte).
  let { node }: { node: NoteNodeSpec } = $props()
</script>

<div class="h-full rounded-lg border border-amber-300/60 bg-amber-100/95 p-2 shadow-lg">
  <p class="text-[1.1em] leading-snug text-amber-950">{node.text}</p>
</div>
