<script lang="ts">
  // "Save to collection…" picker (plan 08 B3): choose collection + folder +
  // name for a canvas node; saving strips board wiring (library.ts) and
  // links the node back via requestRef.
  import { folderOptions, ROOT_FOLDER_ID } from '../../collections'
  import { dialogs } from '../../dialogs.svelte'
  import { app } from '../../state.svelte'
  import Button from '../ui/Button.svelte'
  import Field from '../ui/Field.svelte'
  import Input from '../ui/Input.svelte'
  import Select from '../ui/Select.svelte'
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
  <Field label="Request name">
    <Input
      bind:el={nameEl}
      bind:value={name}
      class="mt-1 w-full"
      placeholder="Create invoice"
      onkeydown={(e) => {
        if (e.key === 'Enter') save()
      }}
    />
  </Field>

  <Field label="Collection">
    <Select
      class="mt-1 w-full"
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
    </Select>
  </Field>

  {#if collectionId === NEW_COLLECTION}
    <Field label="Collection name">
      <Input bind:value={newCollectionName} class="mt-1 w-full" placeholder="Payments" />
    </Field>
  {:else if folders.length > 1}
    <Field label="Folder">
      <Select class="mt-1 w-full" bind:value={folderId}>
        {#each folders as folder (folder.id)}
          <option value={folder.id}>{folder.label}</option>
        {/each}
      </Select>
    </Field>
  {/if}

  <p class="text-[10px] leading-relaxed text-zinc-600">
    Bindings and credentials stay on the board — the library keeps literal defaults only.
  </p>

  <div class="flex justify-end gap-1.5 pt-1">
    <Button variant="ghost" onclick={close}>Cancel</Button>
    <Button variant="primary" disabled={!canSave} onclick={save}>Save</Button>
  </div>
</ModalShell>
