<script lang="ts">
  // "Save to collection…" picker (plan 08 B3): choose collection + folder +
  // name for a canvas node; saving strips board wiring (library.ts) and
  // links the node back via requestRef.
  import { folderOptions, ROOT_FOLDER_ID } from '../../collections'
  import { dialogs } from '../../dialogs.svelte'
  import { app } from '../../state.svelte'
  import ModalShell from './ModalShell.svelte'

  let { nodeId }: { nodeId: string } = $props()

  /** Select value for "create a collection instead" — not a valid library id. */
  const NEW_COLLECTION = '#new'

  // The dialog mounts fresh per open, so init-once state is safe.
  const node = app.nodes.find((n) => n.id === nodeId)
  let name = $state(node && node.type === 'http' ? node.data.name : '')
  let collectionId = $state(app.collections[0]?.id ?? NEW_COLLECTION)
  let newCollectionName = $state('')
  let folderId = $state(ROOT_FOLDER_ID)
  let nameEl = $state<HTMLInputElement | null>(null)

  $effect(() => {
    nameEl?.focus()
    nameEl?.select()
  })

  const collection = $derived(app.collections.find((c) => c.id === collectionId) ?? null)
  const folders = $derived(collection ? folderOptions(collection.root) : [])
  const canSave = $derived(
    name.trim() !== '' && (collectionId !== NEW_COLLECTION || newCollectionName.trim() !== ''),
  )

  function close() {
    dialogs.saveToCollection = null
  }

  function save() {
    if (!canSave) return
    let targetCollection = collectionId
    let targetFolder = folderId
    if (collectionId === NEW_COLLECTION) {
      const created = app.createCollection(newCollectionName.trim())
      if (!created) return
      targetCollection = created.id
      targetFolder = ROOT_FOLDER_ID
    }
    app.saveNodeToCollection(nodeId, targetCollection, targetFolder, name.trim())
    close()
  }
</script>

<ModalShell title="Save to collection" onclose={close}>
  <label class="block">
    <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Request name</span>
    <input
      bind:this={nameEl}
      bind:value={name}
      class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs outline-none placeholder:text-zinc-600 focus:border-zinc-500"
      placeholder="Create invoice"
      onkeydown={(e) => {
        if (e.key === 'Enter') save()
      }}
    />
  </label>

  <label class="block">
    <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Collection</span>
    <select
      class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs outline-none focus:border-zinc-500"
      value={collectionId}
      onchange={(e) => {
        collectionId = e.currentTarget.value
        folderId = ROOT_FOLDER_ID
      }}
    >
      {#each app.collections as c (c.id)}
        <option value={c.id}>{c.name}</option>
      {/each}
      <option value={NEW_COLLECTION}>New collection…</option>
    </select>
  </label>

  {#if collectionId === NEW_COLLECTION}
    <label class="block">
      <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Collection name</span>
      <input
        bind:value={newCollectionName}
        class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        placeholder="Payments"
      />
    </label>
  {:else if folders.length > 1}
    <label class="block">
      <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Folder</span>
      <select
        class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs outline-none focus:border-zinc-500"
        bind:value={folderId}
      >
        {#each folders as folder (folder.id)}
          <option value={folder.id}>{folder.label}</option>
        {/each}
      </select>
    </label>
  {/if}

  <p class="text-[10px] leading-relaxed text-zinc-600">
    Bindings and credentials stay on the board — the library keeps literal defaults only.
  </p>

  <div class="flex justify-end gap-1.5 pt-1">
    <button class="rounded px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200" onclick={close}>
      Cancel
    </button>
    <button
      class="rounded bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!canSave}
      onclick={save}
    >
      Save
    </button>
  </div>
</ModalShell>
