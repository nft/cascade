<script lang="ts">
  // Deleting a For container deletes its children with it (plan 09 N5) —
  // silent orphan-and-unparent would surprise more than it helps, so the
  // destructive path is confirmed. Dragging nodes out first is the rescue.
  import { dialogs } from '../dialogs.svelte'
  import { isForNode } from '../model'
  import { app } from '../state.svelte'
  import ModalShell from './library/ModalShell.svelte'
  import Button from './ui/Button.svelte'

  let { nodeId, childCount }: { nodeId: string; childCount: number } = $props()

  const name = $derived.by(() => {
    const node = app.nodes.find((n) => n.id === nodeId)
    return node && isForNode(node) ? node.data.name : nodeId
  })
  const close = () => (dialogs.confirmDeleteFor = null)
  function confirm() {
    app.removeNode(nodeId)
    close()
  }
</script>

<ModalShell title="Delete for loop" onclose={close}>
  <p class="text-xs leading-relaxed text-zinc-300">
    Deleting "{name}" also deletes the {childCount === 1 ? 'node' : `${childCount} nodes`} inside
    it. Drag {childCount === 1 ? 'it' : 'them'} out first to keep {childCount === 1 ? 'it' : 'them'}.
  </p>
  <div class="flex justify-end gap-2">
    <Button variant="secondary" onclick={close}>Cancel</Button>
    <Button variant="danger" onclick={confirm}>Delete loop and contents</Button>
  </div>
</ModalShell>
