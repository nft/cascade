<script lang="ts">
  // Environments tab body (plan 11 W7), the environment twin of
  // CredentialsPanel. The project default is shown and movable here because
  // it is what every new node is born targeting: left implicit, it goes stale
  // the moment its environment is deleted.
  import { dialogs } from '../../dialogs.svelte'
  import {
    deleteEnvironment,
    environmentNodeRefCount,
    setDefaultEnvironment,
  } from '../../environmentActions.svelte'
  import { deleteConfirmLabel } from '../../format'
  import { app } from '../../state.svelte'
  import Icon from '../Icon.svelte'
  import Button from '../ui/Button.svelte'

  /** Name of the environment whose delete is armed; second click deletes. */
  let confirmingDelete = $state<string | null>(null)

  const defaultName = $derived(app.project?.project.defaults?.environment ?? '')

  function remove(name: string) {
    if (confirmingDelete !== name) {
      confirmingDelete = name
      return
    }
    confirmingDelete = null
    void report(deleteEnvironment(app, name))
  }

  // A failed write here is otherwise invisible: the optimistic change is
  // rolled back and the row simply reappears, indistinguishable from a click
  // that did not register. The dialog shows its own error inline; the panel
  // has nowhere to put one, so it toasts as a failed board save does.
  async function report(write: Promise<string | null>) {
    const error = await write
    if (error) dialogs.showToast(error)
  }
</script>

<div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
  {#each app.environments as env (env.name)}
    <div class="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
      <div class="flex items-center justify-between gap-1">
        <p class="truncate text-xs font-medium text-zinc-200">{env.name}</p>
        {#if env.name === defaultName}
          <span class="shrink-0 rounded bg-emerald-950 px-1.5 py-0.5 text-[10px] text-emerald-400">default</span>
        {/if}
      </div>
      {#if env.baseUrl}
        <p class="truncate pt-1 font-mono text-[11px] text-zinc-500" title={env.baseUrl}>{env.baseUrl}</p>
      {:else}
        <p class="pt-1 text-[11px] text-amber-500">No base URL — nodes targeting it cannot run.</p>
      {/if}
      <div class="flex items-center gap-1 pt-1.5">
        {#if env.name !== defaultName}
          <Button variant="ghost" size="xs" onclick={() => void report(setDefaultEnvironment(app, env.name))}>
            <Icon name="check" size={12} />
            Set default
          </Button>
        {/if}
        <Button
          variant="ghost"
          size="xs"
          onclick={() => (dialogs.environment = { mode: 'edit', name: env.name })}
        >
          <Icon name="edit" size={12} />
          Edit
        </Button>
        <Button
          variant={confirmingDelete === env.name ? 'danger' : 'ghost'}
          size="xs"
          class="ml-auto"
          onclick={() => remove(env.name)}
          onmouseleave={() => {
            if (confirmingDelete === env.name) confirmingDelete = null
          }}
        >
          <Icon name="delete" size={12} />
          {#if confirmingDelete === env.name}
            {deleteConfirmLabel(environmentNodeRefCount(app, env.name))}
          {:else}
            Delete
          {/if}
        </Button>
      </div>
    </div>
  {:else}
    <p class="p-1 text-center text-[11px] leading-relaxed text-zinc-600">
      No environments in <em>{app.projectName}</em> yet — nodes have nowhere to send their requests
      until one exists.
    </p>
  {/each}
  <Button variant="dashed" class="w-full" onclick={() => (dialogs.environment = { mode: 'create' })}>
    <Icon name="add" size={14} />
    Add environment
  </Button>
  <p class="px-1 text-[10px] leading-relaxed text-zinc-600">
    New nodes are born targeting the default environment; each node can override it.
  </p>
</div>
