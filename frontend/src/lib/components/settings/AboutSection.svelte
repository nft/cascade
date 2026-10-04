<script lang="ts">
  // Version, the manual update check with its inline verdict, the launch
  // check toggle, and the app's own links.
  import { api } from '../../api'
  import { dialogs } from '../../dialogs.svelte'
  import { settings } from '../../settings.svelte'
  import { platformLabel } from '../../updates'
  import { updates } from '../../updates.svelte'
  import Icon from '../Icon.svelte'
  import Button from '../ui/Button.svelte'
  import { FIELD_LABEL } from '../ui/classes'
  import Toggle from '../ui/Toggle.svelte'
  import SettingRow from './SettingRow.svelte'

  const AUTO_CHECK_LABEL = 'Check for updates at launch'

  const links = $derived([
    { label: 'Website', url: updates.info.websiteUrl },
    { label: 'Releases', url: updates.info.releasesUrl },
    { label: 'Report an issue', url: updates.info.newIssueUrl },
  ])

  const busy = $derived(
    updates.phase === 'checking' || updates.phase === 'downloading' || updates.phase === 'installing',
  )
  // Phases a user can act on from here open the dialog.
  const viewable = $derived(
    updates.phase === 'available' ||
      updates.phase === 'ready' ||
      updates.phase === 'downloading' ||
      updates.phase === 'unsupported',
  )

  const status = $derived.by(() => {
    const version = updates.release?.version ?? ''
    switch (updates.phase) {
      case 'checking':
        return 'Checking…'
      case 'upToDate':
        return "You're on the latest version."
      case 'available':
        return `Version ${version} is available.`
      case 'downloading':
        return `Downloading version ${version}…`
      case 'ready':
        return `Version ${version} is downloaded and ready to install.`
      case 'installing':
        return 'Installing…'
      case 'unsupported':
        return `Version ${version} is out, but there is no build for ${platformLabel(updates.info)}.`
      case 'failed':
        return `Something went wrong: ${updates.error}`
      default:
        return ''
    }
  })

  // Settings closes first so the two dialogs never stack.
  function view() {
    dialogs.settings = null
    updates.openDialog()
  }
</script>

<section class="space-y-4" aria-label="About Cascade">
  <h3 class={FIELD_LABEL}>About</h3>
  <SettingRow label="Cascade {updates.info.version}" description={platformLabel(updates.info)}>
    <Button variant="secondary" size="sm" disabled={busy} onclick={() => void updates.check({ manual: true })}>
      Check for updates
    </Button>
  </SettingRow>
  {#if status}
    <p class="text-[11px] leading-relaxed text-zinc-400" role="status">
      {status}
      {#if viewable}
        <button class="ml-1 text-emerald-400 underline-offset-2 hover:underline" onclick={view}>View</button>
      {/if}
    </p>
  {/if}
  <SettingRow
    label={AUTO_CHECK_LABEL}
    description="Asks github.com for the newest release once, a few seconds after Cascade opens. Nothing else is sent."
  >
    <Toggle
      label={AUTO_CHECK_LABEL}
      checked={settings.checkForUpdates}
      onchange={(checked) => settings.update({ checkForUpdates: checked })}
    />
  </SettingRow>
  <div class="flex flex-wrap gap-1 border-t border-zinc-800 pt-4">
    {#each links as link (link.label)}
      <Button variant="ghost" size="sm" onclick={() => void api.openExternal(link.url)}>
        <Icon name="open_in_new" size={12} />
        {link.label}
      </Button>
    {/each}
  </div>
</section>
