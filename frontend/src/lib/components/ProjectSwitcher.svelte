<script lang="ts">
  // Project switcher chip in the top bar (plan 01 P3): dropdown listing all
  // projects plus create / rename / delete. Switching is instant — saves are
  // per-mutation, so there is no unsaved state to guard.
  import { app } from '../state.svelte'
  import Icon from './Icon.svelte'
  import Button from './ui/Button.svelte'
  import Input from './ui/Input.svelte'

  type Mode = 'closed' | 'list' | 'create' | 'rename' | 'confirm-delete'

  let mode = $state<Mode>('closed')
  let draft = $state('')
  let rootEl = $state<HTMLElement | null>(null)
  let inputEl = $state<HTMLInputElement | null>(null)

  $effect(() => {
    if ((mode === 'create' || mode === 'rename') && inputEl) {
      inputEl.focus()
      inputEl.select()
    }
  })

  function close() {
    mode = 'closed'
    draft = ''
  }

  function onWindowPointerDown(event: PointerEvent) {
    if (mode !== 'closed' && rootEl && !rootEl.contains(event.target as Node)) close()
  }

  async function pick(id: string) {
    close()
    if (id !== app.projectId) await app.openProject(id)
  }

  async function submit() {
    const name = draft.trim()
    if (!name) return
    const action = mode
    close()
    if (action === 'create') await app.createProject(name)
    else if (action === 'rename') await app.renameCurrentProject(name)
  }

  function onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      void submit()
    } else if (event.key === 'Escape') {
      // Back to the list without letting the global chain close the inspector.
      event.stopPropagation()
      mode = 'list'
    }
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div class="relative" bind:this={rootEl} data-testid="project-switcher">
  <button
    class="flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
    onclick={() => (mode = mode === 'closed' ? 'list' : 'closed')}
    title="Switch project"
  >
    <Icon name="folder" size={12} />
    {app.projectName || 'Loading…'}
    <Icon name="arrow_drop_down" size={14} />
  </button>

  {#if mode !== 'closed'}
    <div class="absolute top-full left-0 z-50 mt-1 w-64 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
      {#if mode === 'create' || mode === 'rename'}
        <div class="px-2 py-1.5">
          <Input
            bind:el={inputEl}
            bind:value={draft}
            onkeydown={onInputKeydown}
            size="sm"
            surface="popover"
            class="w-full"
            placeholder={mode === 'create' ? 'New project name…' : 'Project name…'}
          />
          <div class="flex justify-end gap-1 pt-1.5">
            <Button variant="ghost" size="sm" onclick={() => (mode = 'list')}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={!draft.trim()} onclick={submit}>
              {mode === 'create' ? 'Create' : 'Rename'}
            </Button>
          </div>
        </div>
      {:else}
        {#each app.projects as project (project.id)}
          <button
            role="menuitem"
            class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
            onclick={() => pick(project.id)}
          >
            <Icon name="check" size={14} class={project.id === app.projectId ? '' : 'invisible'} />
            <span class="truncate">{project.name}</span>
          </button>
        {/each}
        <div class="my-1 border-t border-zinc-800"></div>
        <button
          role="menuitem"
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
          onclick={() => {
            draft = ''
            mode = 'create'
          }}
        >
          <Icon name="add" size={14} />
          New project…
        </button>
        <button
          role="menuitem"
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
          onclick={() => {
            draft = app.projectName
            mode = 'rename'
          }}
        >
          <Icon name="edit" size={14} />
          Rename…
        </button>
        {#if mode === 'confirm-delete'}
          <button
            role="menuitem"
            class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-rose-400 hover:bg-rose-500/10"
            onclick={() => {
              close()
              void app.deleteCurrentProject()
            }}
          >
            <Icon name="delete" size={14} />
            Really delete “{app.projectName}”?
          </button>
        {:else}
          <button
            role="menuitem"
            class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-rose-400 hover:bg-rose-500/10"
            onclick={() => (mode = 'confirm-delete')}
          >
            <Icon name="delete" size={14} />
            Delete project…
          </button>
        {/if}
      {/if}
    </div>
  {/if}
</div>
