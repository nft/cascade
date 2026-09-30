<script lang="ts">
  // Environment create/edit dialog, the environment twin of
  // CredentialDialog — simpler, because neither field is a secret, so edit
  // mode repopulates both instead of leaving one write-only.
  import { dialogs, type EnvironmentDialogContext } from '../../dialogs.svelte'
  import { saveEnvironment } from '../../environmentActions.svelte'
  import {
    environmentFromDraft,
    validateEnvironmentDraft,
    type EnvironmentDraft,
  } from '../../environments'
  import { app } from '../../state.svelte'
  import ModalShell from '../library/ModalShell.svelte'
  import Button from '../ui/Button.svelte'
  import Field from '../ui/Field.svelte'
  import Input from '../ui/Input.svelte'

  let { context }: { context: EnvironmentDialogContext } = $props()

  const TITLES: Record<EnvironmentDialogContext['mode'], string> = {
    create: 'New environment',
    edit: 'Edit environment',
  }

  const NAME_PLACEHOLDER = 'staging'
  const BASE_URL_PLACEHOLDER = 'https://staging.api.example.com'

  // The dialog mounts fresh per open, so init-once state is safe.
  // svelte-ignore state_referenced_locally
  const existing =
    context.mode === 'create'
      ? null
      : (app.environments.find((e) => e.name === context.name) ?? null)
  let draft = $state<EnvironmentDraft>({
    name: existing?.name ?? '',
    baseUrl: existing?.baseUrl ?? '',
  })
  let error = $state<string | null>(null)
  let firstEl = $state<HTMLInputElement | null>(null)

  $effect(() => firstEl?.focus())

  const takenNames = $derived(
    new Set(app.environments.map((e) => e.name).filter((n) => n !== existing?.name)),
  )
  const draftError = $derived(validateEnvironmentDraft(draft, takenNames))

  function close() {
    dialogs.environment = null
  }

  async function save() {
    if (draftError !== null) return
    error = await saveEnvironment(app, environmentFromDraft(draft))
    if (error === null) close()
  }
</script>

<ModalShell title={TITLES[context.mode]} onclose={close}>
  <Field label="Name">
    <Input
      bind:el={firstEl}
      bind:value={draft.name}
      disabled={context.mode === 'edit'}
      class="mt-1 w-full"
      placeholder={NAME_PLACEHOLDER}
    />
    {#if context.mode === 'edit'}
      <span class="text-[10px] text-zinc-600">Nodes reference environments by name, so it cannot change.</span>
    {/if}
  </Field>

  <Field label="Base URL">
    <Input
      bind:value={draft.baseUrl}
      mono
      class="mt-1 w-full"
      placeholder={BASE_URL_PLACEHOLDER}
      onkeydown={(e) => {
        if (e.key === 'Enter') void save()
      }}
    />
    <span class="text-[10px] text-zinc-600">
      Node paths are joined onto it, so a shared prefix like /v1 belongs here.
    </span>
  </Field>

  {#if error}
    <p class="text-[10px] leading-relaxed text-red-400">{error}</p>
  {:else if draft.name.trim() !== '' && draftError}
    <p class="text-[10px] leading-relaxed text-amber-500">{draftError}</p>
  {/if}

  <div class="flex justify-end gap-1.5 pt-1">
    <Button variant="ghost" onclick={close}>Cancel</Button>
    <Button variant="primary" disabled={draftError !== null} onclick={() => void save()}>Save</Button>
  </div>
</ModalShell>
