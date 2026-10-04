<script lang="ts">
  // Top-bar notice that a newer version is waiting. Quiet by design: it
  // appears only while the user has not answered, and opens the dialog.
  import { updates } from '../../updates.svelte'
  import Icon from '../Icon.svelte'
  import Button from '../ui/Button.svelte'

  const label = $derived(updates.phase === 'ready' ? 'Restart to update' : `Update to ${updates.release?.version}`)
</script>

{#if updates.pending}
  <Button variant="success" size="sm" title="A newer version of Cascade is available" onclick={() => updates.openDialog()}>
    <Icon name="system_update_alt" size={14} />
    {label}
  </Button>
{/if}
