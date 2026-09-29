<script lang="ts">
  import { resolve } from '$app/paths'
  import CopyButton from '$components/ui/CopyButton.svelte'
  import Icon from '$components/ui/Icon.svelte'
  import LinkButton, { ICON_SIZE } from '$components/ui/LinkButton.svelte'
  import { ANCHORS, ROUTES } from '$lib/config/routes'
  import { platformDownloads, type Platform, type ReleaseState } from '$lib/release/platforms'
  import { formatBytes } from '$lib/text/format'

  // One platform's downloads. The detailed card (download page) adds the
  // requirements, every file the platform has, and each file's checksum.
  let {
    platform,
    release,
    detected = false,
    detailed = false,
  }: { platform: Platform; release: ReleaseState; detected?: boolean; detailed?: boolean } = $props()

  const SHORT_HASH = 12

  const downloads = $derived(release.status === 'published' ? platformDownloads(release.release, platform.id) : [])
  const primary = $derived(downloads[0])
  const extras = $derived(downloads.slice(1))
</script>

<article
  id={detailed ? platform.id : undefined}
  class="relative flex scroll-mt-24 flex-col rounded-3xl border bg-surface p-6 shadow-card transition-colors sm:p-8 {detected
    ? 'border-coral-500/50 ring-1 ring-coral-500/25'
    : 'border-white/8'}"
>
  {#if detected}
    <span class="absolute top-6 right-6 rounded-full bg-coral-500/15 px-2.5 py-0.5 text-xs font-semibold text-coral-300">
      Your platform
    </span>
  {/if}

  <span class="grid size-12 place-items-center rounded-2xl bg-navy ring-1 ring-white/8">
    <Icon name={platform.icon} size={24} class="text-fg" />
  </span>
  <h3 class="mt-5 text-xl font-semibold tracking-tight text-fg">{platform.name}</h3>
  <p class="mt-1 text-sm text-fg-muted">{platform.arch}</p>
  {#if detailed}
    <p class="mt-4 text-sm leading-relaxed text-pretty text-fg-subtle">{platform.requirements}</p>
  {/if}

  <div class="mt-auto space-y-3 pt-8">
    {#if primary}
      <LinkButton href={primary.asset.url} variant={detected ? 'primary' : 'secondary'} class="w-full">
        <Icon name="download" size={ICON_SIZE.md} />
        {primary.file.label}
        <span class="font-normal opacity-70">{formatBytes(primary.asset.size)}</span>
      </LinkButton>
      {#each extras as extra (extra.file.name)}
        <a
          href={extra.asset.url}
          class="flex items-center justify-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          {extra.file.label}
          <span class="text-fg-subtle">{formatBytes(extra.asset.size)}</span>
        </a>
      {/each}
      {#if detailed}
        <ul class="space-y-1.5 border-t border-white/6 pt-4">
          {#each downloads as download (download.file.name)}
            <li class="flex items-center gap-2 font-mono text-xs text-fg-subtle">
              <span class="min-w-0 flex-1 truncate" title={download.file.name}>{download.file.name}</span>
              {#if download.asset.sha256}
                <span title="SHA-256 {download.asset.sha256}">{download.asset.sha256.slice(0, SHORT_HASH)}…</span>
                <CopyButton text={download.asset.sha256} label="Copy SHA-256 of {download.file.name}" />
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <LinkButton
        href="{resolve(ROUTES.download)}#{ANCHORS.buildFromSource}"
        variant="secondary"
        class="w-full"
      >
        <Icon name="code" size={ICON_SIZE.md} />
        Build from source
      </LinkButton>
    {/if}
  </div>
</article>
