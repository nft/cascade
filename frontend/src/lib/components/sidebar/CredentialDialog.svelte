<script lang="ts">
  // Credential create/edit/rotate dialog (plan 04 K2). The secret input only
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
    <label class="block">
      <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Name</span>
      <input
        bind:this={firstEl}
        bind:value={draft.name}
        disabled={context.mode === 'edit'}
        class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs outline-none placeholder:text-zinc-600 focus:border-zinc-500 disabled:opacity-50"
        placeholder="internal"
      />
      {#if context.mode === 'edit'}
        <span class="text-[10px] text-zinc-600">Nodes reference credentials by name, so it cannot change.</span>
      {/if}
    </label>

    <label class="block">
      <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Kind</span>
      <select
        bind:value={draft.kind}
        class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs outline-none focus:border-zinc-500"
      >
        {#each CREDENTIAL_KINDS as kind (kind)}
          <option value={kind}>{CREDENTIAL_KIND_LABELS[kind]}</option>
        {/each}
      </select>
    </label>

    {#if draft.kind === 'basic'}
      <label class="block">
        <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Username</span>
        <input
          bind:value={draft.username}
          class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          placeholder="service-account"
        />
      </label>
    {/if}

    {#if draft.kind === 'header'}
      <label class="block">
        <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Header name</span>
        <input
          bind:value={draft.header}
          class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          placeholder="X-Internal-Token"
        />
      </label>
    {/if}

    {#if draft.kind === 'query'}
      <label class="block">
        <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Query parameter</span>
        <input
          bind:value={draft.param}
          class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          placeholder="api_key"
        />
      </label>
      <p class="rounded-md border border-amber-900/50 bg-amber-950/30 p-2 text-[10px] leading-relaxed text-amber-500">
        The secret rides in the URL, so it can land in the target server's access logs. Prefer a
        header kind when the API supports one.
      </p>
    {/if}

    {#if draft.kind === 'header' || draft.kind === 'query'}
      <label class="block">
        <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Value template (optional)</span>
        <input
          bind:value={draft.template}
          class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          placeholder={'Token {secret}'}
        />
      </label>
    {/if}

    <div>
      <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Sends</span>
      <code class="mt-1 block truncate rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-[11px] text-zinc-400">
        {injectionPreview(draft)}
      </code>
    </div>
  {/if}

  {#if needsSecret}
    <label class="block">
      <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Secret value</span>
      <input
        type="password"
        bind:value={secret}
        autocomplete="off"
        class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        placeholder={context.mode === 'rotate' ? 'new value' : ''}
        onkeydown={(e) => {
          if (e.key === 'Enter') void save()
        }}
      />
    </label>
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
    <button class="rounded px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200" onclick={close}>
      Cancel
    </button>
    <button
      class="rounded bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!canSave}
      onclick={() => void save()}
    >
      Save
    </button>
  </div>
</ModalShell>
