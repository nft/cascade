<script lang="ts">
  // The update conversation: what is new, how big, whether it can install
  // from here, and the download → install progress. Closing it keeps the
  // top-bar pill; Later and Skip are the explicit answers.
  import { formatBytes } from '../../format'
  import { parseReleaseNotes } from '../../releaseNotes'
  import { InstallKind, platformLabel } from '../../updates'
  import { updates } from '../../updates.svelte'
  import Icon from '../Icon.svelte'
  import ModalShell from '../library/ModalShell.svelte'
  import Button from '../ui/Button.svelte'
  import ReleaseNotes from './ReleaseNotes.svelte'
  import UpdateActions from './UpdateActions.svelte'
  import UpdateProgressBar from './UpdateProgressBar.svelte'

  const TITLE = 'Software update'
  const DATE_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }

  const release = $derived(updates.release)
  const blocks = $derived(release ? parseReleaseNotes(release.notes) : [])
  const handsOff = $derived(updates.plan?.kind === InstallKind.RunInstaller)
  // One line under the version: date, size when known, and what is running now.
  const meta = $derived(
    release
      ? [
          `Published ${new Date(release.publishedAt).toLocaleDateString(undefined, DATE_FORMAT)}`,
          release.assetSize ? formatBytes(release.assetSize) : '',
          `You have ${updates.info.version}`,
        ]
          .filter(Boolean)
          .join(' · ')
      : '',
  )
</script>

<ModalShell title={TITLE} onclose={() => updates.closeDialog()}>
  {#if release}
    <div class="flex items-start gap-3">
      <Icon name="system_update_alt" size={20} class="mt-0.5 shrink-0 text-emerald-400" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-zinc-100">Cascade {release.version}</p>
        <p class="text-[11px] text-zinc-500">{meta}</p>
      </div>
    </div>

    <ReleaseNotes {blocks} />

    {#if updates.phase === 'unsupported'}
      <p class="text-xs leading-relaxed text-amber-200/90">
        There is no build of this version for {platformLabel(updates.info)}. The releases page lists every build.
      </p>
    {:else if updates.installBlocker}
      <p class="text-xs leading-relaxed text-amber-200/90">
        Cascade can't update itself from here: {updates.installBlocker}. Download the new version from the releases
        page instead.
      </p>
    {/if}

    {#if updates.phase === 'downloading' && updates.progress}
      <UpdateProgressBar progress={updates.progress} fraction={updates.fraction} />
    {:else if updates.phase === 'ready'}
      <p class="flex items-center gap-1.5 text-xs text-emerald-300">
        <Icon name="check_circle" size={14} />
        Downloaded and verified.
      </p>
      <p class="text-[11px] text-zinc-500">
        {handsOff
          ? 'Cascade will quit and the installer will open.'
          : `Cascade will quit and reopen as version ${release.version}.`}
      </p>
    {:else if updates.phase === 'installing'}
      <p class="text-xs text-zinc-300" role="status">
        {handsOff ? 'Quitting so the installer can run…' : 'Installing… Cascade will reopen in a moment.'}
      </p>
    {:else if updates.phase === 'failed'}
      <p class="text-xs leading-relaxed text-rose-300" role="alert">{updates.error}</p>
    {/if}

    <UpdateActions />
  {:else}
    <p class="text-xs text-zinc-400" role="status">
      {updates.phase === 'checking' ? 'Checking for updates…' : "You're on the latest version."}
    </p>
    <div class="flex justify-end">
      <Button variant="secondary" onclick={() => updates.closeDialog()}>Close</Button>
    </div>
  {/if}
</ModalShell>
