<script lang="ts">
  import { credentials, environments, operations } from '../mock'
  import { app } from '../state.svelte'
  import { methodBadge } from '../ui'
  import Icon from './Icon.svelte'

  let query = $state('')

  const tabs = [
    { id: 'operations', label: 'Operations', icon: 'api' },
    { id: 'environments', label: 'Envs', icon: 'dns' },
    { id: 'keys', label: 'API Keys', icon: 'key' },
  ] as const

  const filtered = $derived(
    operations.filter((op) =>
      `${op.method} ${op.path} ${op.summary}`.toLowerCase().includes(query.toLowerCase()),
    ),
  )
  const groups = $derived([...new Set(filtered.map((op) => op.group))])
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
        placeholder="Search operations…"
        bind:value={query}
      />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <p class="px-1 pb-2 text-[10px] text-zinc-600">demo-api v1.4.0 · OpenAPI 3.0 · click to add to canvas</p>
      {#each groups as group (group)}
        <p class="px-1 pt-2 pb-1 text-[10px] font-medium tracking-wide text-zinc-500 uppercase">{group}</p>
        {#each filtered.filter((op) => op.group === group) as op (op.ref)}
          <button
            class="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-zinc-800/70"
            onclick={() => app.addNode(op)}
            title={op.summary}
          >
            <span class="w-12 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-semibold {methodBadge[op.method]}">
              {op.method}
            </span>
            <span class="truncate font-mono text-[11px] text-zinc-300">{op.path}</span>
          </button>
        {/each}
      {/each}
    </div>
  {:else if app.sidebarTab === 'environments'}
    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      {#each environments as env (env.name)}
        <div class="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
          <p class="text-xs font-medium text-zinc-200">{env.name}</p>
          <p class="truncate font-mono text-[11px] text-zinc-500">{env.baseUrl}</p>
        </div>
      {/each}
      <button class="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-zinc-700 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">
        <Icon name="add" size={14} />
        Add environment
      </button>
    </div>
  {:else}
    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      {#each credentials as cred (cred.name)}
        <div class="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
          <div class="flex items-center justify-between">
            <p class="text-xs font-medium text-zinc-200">{cred.name}</p>
            <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{cred.type}</span>
          </div>
          <p class="pt-1 font-mono text-[11px] tracking-widest text-zinc-600">••••••••••••</p>
          <p class="pt-0.5 text-[10px] text-zinc-600">added {cred.createdAt}</p>
        </div>
      {/each}
      <button class="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-zinc-700 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">
        <Icon name="add" size={14} />
        Add API key
      </button>
      <p class="px-1 text-[10px] leading-relaxed text-zinc-600">
        Values are write-only after saving and stored in the OS keychain — never in workspace files.
      </p>
    </div>
  {/if}
</aside>
