<script lang="ts">
  import { resolve } from '$app/paths'
  import type { HTMLAttributes } from 'svelte/elements'
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
    ...rest
  }: {
    platform: Platform
    release: ReleaseState
    detected?: boolean
    detailed?: boolean
  } & Omit<HTMLAttributes<HTMLElement>, 'class' | 'id'> = $props()

  const SHORT_HASH = 12

  // The cards sit side by side in a grid and share its row tracks, so the
  // buttons and checksums line up across platforms however long each card's
  // text is. Every direct child below is one row; the span must match. The
  // single column is minmax(0, 1fr) rather than auto, or a long file name in
  // the checksum list would widen it past the card's padding.
  const ROWS = { compact: 'row-span-5', detailed: 'row-span-7' }

  const downloads = $derived(release.status === 'published' ? platformDownloads(release.release, platform.id) : [])
  const primary = $derived(downloads[0])
  const extras = $derived(downloads.slice(1))
</script>

<article
  {...rest}
  id={detailed ? platform.id : undefined}
  class="relative grid grid-cols-1 grid-rows-subgrid gap-y-0 {detailed
    ? ROWS.detailed
    : ROWS.compact} scroll-mt-24 rounded-3xl border bg-surface p-6 shadow-card transition-colors sm:p-8 {detected
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

  {#if primary}
    <LinkButton href={primary.asset.url} variant={detected ? 'primary' : 'secondary'} class="mt-8 w-full">
      <Icon name="download" size={ICON_SIZE.md} />
      {primary.file.label}
      <span class="font-normal opacity-70">{formatBytes(primary.asset.size)}</span>
    </LinkButton>
  {:else}
    <LinkButton href="{resolve(ROUTES.download)}#{ANCHORS.buildFromSource}" variant="secondary" class="mt-8 w-full">
      <Icon name="code" size={ICON_SIZE.md} />
      Build from source
    </LinkButton>
  {/if}
  <div>
    {#each extras as extra (extra.file.name)}
      <a
        href={extra.asset.url}
        class="mt-3 flex items-center justify-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        {extra.file.label}
        <span class="text-fg-subtle">{formatBytes(extra.asset.size)}</span>
      </a>
    {/each}
  </div>
  {#if detailed && downloads.length > 0}
    <ul class="mt-3 space-y-1.5 border-t border-white/6 pt-4">
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
</article>
