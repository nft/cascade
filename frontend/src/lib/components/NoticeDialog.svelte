<script lang="ts">
  // App-level notice modal: surfaces paste/import errors as a
  // clean dialog until a richer notification store exists.
  import { dialogs } from '../dialogs.svelte'
  import ModalShell from './library/ModalShell.svelte'
  import Button from './ui/Button.svelte'

  let { title, message }: { title: string; message: string } = $props()

  const close = () => (dialogs.notice = null)
</script>

<ModalShell {title} onclose={close}>
  <p class="text-xs leading-relaxed text-zinc-300">{message}</p>
  <div class="flex justify-end">
    <Button variant="secondary" onclick={close}>Close</Button>
  </div>
</ModalShell>
