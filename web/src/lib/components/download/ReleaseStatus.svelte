<script lang="ts">
  import Icon from '$components/ui/Icon.svelte'
  import { RELEASE_STATUS } from '$content/download'
  import { LINKS } from '$lib/config/site'
  import type { ReleaseState } from '$lib/release/platforms'
  import { formatDate, isoDay } from '$lib/text/format'

  // One line on what the build found on GitHub: the release the cards below
  // link to, or why there are no files to link.
  let { release }: { release: ReleaseState } = $props()

  const LINK = 'inline-flex items-center gap-1 font-semibold text-coral-300 hover:text-coral-200'
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/8 bg-surface px-5 py-4 text-sm">
  {#if release.status === 'published'}
    <span class="rounded-full bg-coral-500/15 px-2.5 py-0.5 font-mono font-semibold text-coral-300">
      v{release.release.version}
    </span>
    <span class="text-fg-muted">
      Released <time datetime={isoDay(release.release.publishedAt)}>{formatDate(release.release.publishedAt)}</time>
    </span>
    <a href={release.release.url} target="_blank" rel="noopener" class="{LINK} sm:ml-auto">
      Release on GitHub
      <Icon name="arrow_outward" size={15} />
    </a>
  {:else}
    <Icon name="info" size={18} class="text-fg-subtle" />
    <span class="min-w-0 flex-1 text-fg-muted">{RELEASE_STATUS[release.status]}</span>
    <a href={LINKS.releases} target="_blank" rel="noopener" class={LINK}>
      Releases on GitHub
      <Icon name="arrow_outward" size={15} />
    </a>
  {/if}
</div>
