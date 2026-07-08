<script lang="ts">
  import { app } from '../state.svelte'
  import Icon from './Icon.svelte'
  import CollectionsTree from './sidebar/CollectionsTree.svelte'
  import CredentialsPanel from './sidebar/CredentialsPanel.svelte'
  import OperationsList from './sidebar/OperationsList.svelte'

  let query = $state('')

  const tabs = [
    { id: 'operations', label: 'Operations', icon: 'api' },
    { id: 'environments', label: 'Envs', icon: 'dns' },
    { id: 'credentials', label: 'Credentials', icon: 'key' },
  ] as const
</script>

<aside class="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-surface">
  <nav class="flex shrink-0 border-b border-zinc-800 text-xs">
    {#each tabs as tab (tab.id)}
      <button
        class="flex flex-1 items-center justify-center gap-1 px-2 py-2 {app.sidebarTab === tab.id
          ? 'border-b-2 border-emerald-500 text-zinc-100'
          : 'text-zinc-500 hover:text-zinc-300'}"
        onclick={() => (app.sidebarTab = tab.id)}
      >
        <Icon name={tab.icon} size={14} />
        {tab.label}
      </button>
    {/each}
  </nav>

  {#if app.sidebarTab === 'operations'}
    <div class="p-2">
      <input
        class="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        placeholder="Search requests…"
        bind:value={query}
      />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <OperationsList {query} />
      <CollectionsTree {query} />
    </div>
  {:else if app.sidebarTab === 'environments'}
    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      {#each app.environments as env (env.name)}
        <div class="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
          <p class="text-xs font-medium text-zinc-200">{env.name}</p>
          <p class="truncate font-mono text-[11px] text-zinc-500">{env.baseUrl}</p>
        </div>
      {:else}
        <p class="p-1 text-center text-[11px] leading-relaxed text-zinc-600">
          No environments in <em>{app.projectName}</em> yet.
        </p>
      {/each}
      <button class="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-zinc-700 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">
        <Icon name="add" size={14} />
        Add environment
      </button>
    </div>
  {:else}
    <CredentialsPanel />
  {/if}
</aside>
