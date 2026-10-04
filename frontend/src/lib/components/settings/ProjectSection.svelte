<script lang="ts">
  import { capturesResponses } from '../../board'
  import { dialogs } from '../../dialogs.svelte'
  import { setCaptureResponses } from '../../projectActions.svelte'
  import { app } from '../../state.svelte'
  import { FIELD_LABEL } from '../ui/classes'
  import Toggle from '../ui/Toggle.svelte'
  import SettingRow from './SettingRow.svelte'

  const CAPTURE_LABEL = 'Save response bodies in board files'

  // Default-on, so it has to say what it costs: a bare "Capture responses"
  // label would be a privacy setting nobody reads.
  const capturing = $derived(capturesResponses(app.project?.project))

  async function onToggleCapture(next: boolean) {
    const error = await setCaptureResponses(app, next)
    if (error) dialogs.showToast(error)
  }
</script>

<section class="space-y-4" aria-label="Project settings">
  <h3 class={FIELD_LABEL}>
    Project{#if app.project}: <span class="normal-case">{app.projectName}</span>{/if}
  </h3>
  <SettingRow
    label={CAPTURE_LABEL}
    description="They can hold access tokens and personal data, and board files are meant to live in git. Schemas are saved either way, so the binding picker keeps working. Applies to every board in this project."
  >
    <Toggle label={CAPTURE_LABEL} checked={capturing} disabled={!app.project} onchange={onToggleCapture} />
  </SettingRow>
</section>
