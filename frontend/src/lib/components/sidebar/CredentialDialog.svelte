<script lang="ts">
  // Credential create/edit/rotate dialog. The secret input only
  // exists in create and rotate mode and always starts empty — a stored value
  // never travels back to the frontend, so there is nothing to repopulate.
  import { rotateCredentialSecret } from '../../credentialActions.svelte'
  import {
    CREDENTIAL_KIND_LABELS,
    credentialFromDraft,
    draftFromCredential,
    injectionPreview,
    validateCredentialDraft,
    type CredentialDraft,
  } from '../../credentials'
  import { dialogs, type CredentialDialogContext } from '../../dialogs.svelte'
  import { CREDENTIAL_KINDS } from '../../model'
  import { app } from '../../state.svelte'
  import ModalShell from '../library/ModalShell.svelte'
  import Button from '../ui/Button.svelte'
  import { FIELD_LABEL } from '../ui/classes'
  import Field from '../ui/Field.svelte'
  import Input from '../ui/Input.svelte'
  import Select from '../ui/Select.svelte'

  let { context }: { context: CredentialDialogContext } = $props()

  const TITLES: Record<CredentialDialogContext['mode'], string> = {
    create: 'New credential',
    edit: 'Edit credential',
    rotate: 'Rotate secret',
  }

  // The dialog mounts fresh per open, so init-once state is safe.
  // svelte-ignore state_referenced_locally
  const existing =
    context.mode === 'create' ? null : (app.credentials.find((c) => c.name === context.name) ?? null)
  let draft = $state<CredentialDraft>(
    existing
      ? draftFromCredential(existing)
      : { name: '', kind: 'bearer', header: '', param: '', template: '', username: '' },
  )
  let secret = $state('')
  let error = $state<string | null>(null)
  let firstEl = $state<HTMLInputElement | null>(null)

  $effect(() => firstEl?.focus())

  const takenNames = $derived(
    new Set(app.credentials.map((c) => c.name).filter((n) => n !== existing?.name)),
  )
  const draftError = $derived(validateCredentialDraft(draft, takenNames))
  const needsSecret = $derived(context.mode !== 'edit')
  const canSave = $derived(
    context.mode === 'rotate' ? secret !== '' : draftError === null && (!needsSecret || secret !== ''),
  )

  function close() {
    dialogs.credential = null
  }

  async function save() {
    if (!canSave) return
    error =
      context.mode === 'rotate'
        ? await rotateCredentialSecret(app.projectId, context.name, secret)
        : await app.saveCredential(
            credentialFromDraft(draft, existing?.createdAt ?? new Date().toISOString()),
            secret || undefined,
          )
    if (error === null) close()
  }
</script>

<ModalShell title={TITLES[context.mode]} onclose={close}>
  {#if context.mode !== 'rotate'}
    <Field label="Name">
      <Input
        bind:el={firstEl}
        bind:value={draft.name}
        disabled={context.mode === 'edit'}
        class="mt-1 w-full"
        placeholder="internal"
      />
      {#if context.mode === 'edit'}
        <span class="text-[10px] text-zinc-600">Nodes reference credentials by name, so it cannot change.</span>
      {/if}
    </Field>

    <Field label="Kind">
      <Select bind:value={draft.kind} class="mt-1 w-full">
        {#each CREDENTIAL_KINDS as kind (kind)}
          <option value={kind}>{CREDENTIAL_KIND_LABELS[kind]}</option>
        {/each}
      </Select>
    </Field>

    {#if draft.kind === 'basic'}
      <Field label="Username">
        <Input bind:value={draft.username} class="mt-1 w-full" placeholder="service-account" />
      </Field>
    {/if}

    {#if draft.kind === 'header'}
      <Field label="Header name">
        <Input bind:value={draft.header} mono class="mt-1 w-full" placeholder="X-Internal-Token" />
      </Field>
    {/if}

    {#if draft.kind === 'query'}
      <Field label="Query parameter">
        <Input bind:value={draft.param} mono class="mt-1 w-full" placeholder="api_key" />
      </Field>
      <p class="rounded-md border border-amber-900/50 bg-amber-950/30 p-2 text-[10px] leading-relaxed text-amber-500">
        The secret rides in the URL, so it can land in the target server's access logs. Prefer a
        header kind when the API supports one.
      </p>
    {/if}

    {#if draft.kind === 'header' || draft.kind === 'query'}
      <Field label="Value template (optional)">
        <Input bind:value={draft.template} mono class="mt-1 w-full" placeholder={'Token {secret}'} />
      </Field>
    {/if}

    <div>
      <span class={FIELD_LABEL}>Sends</span>
      <code class="mt-1 block truncate rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-[11px] text-zinc-400">
        {injectionPreview(draft)}
      </code>
    </div>
  {/if}

  {#if needsSecret}
    <Field label="Secret value">
      <Input
        type="password"
        bind:value={secret}
        autocomplete="off"
        mono
        class="mt-1 w-full"
        placeholder={context.mode === 'rotate' ? 'new value' : ''}
        onkeydown={(e) => {
          if (e.key === 'Enter') void save()
        }}
      />
    </Field>
    <p class="text-[10px] leading-relaxed text-zinc-600">
      Stored in the OS keychain and write-only after saving — it never appears here again.
    </p>
  {:else}
    <p class="text-[10px] leading-relaxed text-zinc-600">
      The stored value is write-only; use Rotate on the card to enter a new one.
    </p>
  {/if}

  {#if error}
    <p class="text-[10px] leading-relaxed text-red-400">{error}</p>
  {:else if context.mode !== 'rotate' && draft.name.trim() !== '' && draftError}
    <p class="text-[10px] leading-relaxed text-amber-500">{draftError}</p>
  {/if}

  <div class="flex justify-end gap-1.5 pt-1">
    <Button variant="ghost" onclick={close}>Cancel</Button>
    <Button variant="primary" disabled={!canSave} onclick={() => void save()}>Save</Button>
  </div>
</ModalShell>
