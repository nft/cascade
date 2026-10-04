<script lang="ts">
  import { dialogs } from '../../dialogs.svelte'
  import { SETTINGS_SECTIONS, type SettingsSection } from '../../settingsSections'
  import Icon from '../Icon.svelte'
  import ModalShell from '../library/ModalShell.svelte'
  import AppearanceSection from './AppearanceSection.svelte'
  import GeneralSection from './GeneralSection.svelte'
  import ProjectSection from './ProjectSection.svelte'
  import ShortcutsSection from './ShortcutsSection.svelte'

  // Remounted per open (App.svelte), so capturing the initial section once is the intent.
  let { section: initialSection }: { section: SettingsSection } = $props()
  // svelte-ignore state_referenced_locally
  let section = $state<SettingsSection>(initialSection)

  const close = () => (dialogs.settings = null)
</script>

<ModalShell title="Settings" onclose={close} wide flush>
  <nav class="flex w-36 shrink-0 flex-col gap-0.5 border-r border-zinc-800 p-2" aria-label="Settings sections">
    {#each SETTINGS_SECTIONS as entry (entry.id)}
      <button
        class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs {section === entry.id
          ? 'bg-zinc-800 text-zinc-100'
          : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'}"
        aria-current={section === entry.id ? 'true' : undefined}
        onclick={() => (section = entry.id)}
      >
        <Icon name={entry.icon} size={14} />
        {entry.label}
      </button>
    {/each}
  </nav>
  <div class="min-h-80 min-w-0 flex-1 overflow-y-auto p-4">
    {#if section === 'general'}
      <GeneralSection />
    {:else if section === 'appearance'}
      <AppearanceSection />
    {:else if section === 'project'}
      <ProjectSection />
    {:else}
      <ShortcutsSection />
    {/if}
  </div>
</ModalShell>
