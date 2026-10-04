<script lang="ts">
  import { settings } from '../../settings.svelte'
  import Button from '../ui/Button.svelte'
  import { FIELD_LABEL } from '../ui/classes'
  import Toggle from '../ui/Toggle.svelte'
  import SettingRow from './SettingRow.svelte'

  const CONFIRM_DELETE_LABEL = 'Ask before deleting a loop with nodes inside'
</script>

<section class="space-y-4" aria-label="General settings">
  <h3 class={FIELD_LABEL}>General</h3>
  <SettingRow
    label={CONFIRM_DELETE_LABEL}
    description="Deleting a For-each container removes every node inside it. Off deletes immediately."
  >
    <Toggle
      label={CONFIRM_DELETE_LABEL}
      checked={settings.confirmDeleteWithChildren}
      onchange={(checked) => settings.update({ confirmDeleteWithChildren: checked })}
    />
  </SettingRow>
  <div class="border-t border-zinc-800 pt-4">
    <SettingRow label="Restore defaults" description="Resets every setting in this dialog except Project.">
      <Button variant="secondary" size="sm" onclick={() => settings.reset()}>Restore</Button>
    </SettingRow>
  </div>
</section>
