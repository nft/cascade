<script lang="ts">
  // The dialog's button row, one set per phase. Every action is a store
  // method, so this stays a pure mapping from phase to choices.
  import { updates } from '../../updates.svelte'
  import Button from '../ui/Button.svelte'

  // A release that cannot be installed from here is only downloadable by hand.
  const blocked = $derived(updates.installBlocker !== '' || updates.phase === 'unsupported')
</script>

<div class="flex items-center justify-end gap-2 pt-1">
  {#if updates.phase === 'available' && !blocked}
    <Button variant="ghost" onclick={() => updates.skip()}>Skip this version</Button>
    <Button variant="secondary" onclick={() => updates.later()}>Later</Button>
    <Button variant="primary" onclick={() => void updates.download()}>Download and install</Button>
  {:else if updates.phase === 'available' || updates.phase === 'unsupported'}
    <Button variant="secondary" onclick={() => updates.later()}>Later</Button>
    <Button variant="primary" onclick={() => updates.openReleasePage()}>Open releases page</Button>
  {:else if updates.phase === 'downloading'}
    <Button variant="secondary" onclick={() => void updates.cancelDownload()}>Cancel</Button>
  {:else if updates.phase === 'ready'}
    <Button variant="secondary" onclick={() => updates.later()}>Later</Button>
    <Button variant="primary" onclick={() => void updates.install()}>{updates.installLabel}</Button>
  {:else if updates.phase === 'failed'}
    <Button variant="secondary" onclick={() => updates.openReleasePage()}>Open releases page</Button>
    <Button variant="primary" onclick={() => updates.retry()}>Try again</Button>
  {/if}
</div>
