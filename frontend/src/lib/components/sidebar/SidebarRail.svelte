<script lang="ts">
  import { dialogs } from '../../dialogs.svelte'
  import { DEFAULT_SETTINGS_SECTION } from '../../settingsSections'
  import { SIDEBAR_TABS } from '../../sidebarTabs'
  import { app } from '../../state.svelte'
  import Icon from '../Icon.svelte'
</script>

<!-- The rail is the sidebar's tab bar and stays visible when the panel is
     collapsed, so every section is one click away at any width. -->
<nav
  class="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-zinc-800 bg-surface py-2"
  aria-label="Sidebar sections"
>
  {#each SIDEBAR_TABS as tab (tab.id)}
    {@const active = app.sidebarOpen && app.sidebarTab === tab.id}
    <button
      class="relative flex h-9 w-9 items-center justify-center rounded-md {active
        ? 'bg-zinc-800 text-zinc-100'
        : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'}"
      title={tab.label}
      aria-pressed={active}
      onclick={() => app.selectSidebarTab(tab.id)}
    >
      {#if active}
        <span class="absolute inset-y-1.5 -left-1 w-0.5 rounded-r bg-emerald-500" aria-hidden="true"></span>
      {/if}
      <Icon name={tab.icon} size={20} />
      <span class="sr-only">{tab.label}</span>
    </button>
  {/each}
  <button
    class="mt-auto flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300"
    title="Settings"
    onclick={() => (dialogs.settings = { section: DEFAULT_SETTINGS_SECTION })}
  >
    <Icon name="settings" size={20} />
    <span class="sr-only">Settings</span>
  </button>
</nav>
