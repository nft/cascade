<script lang="ts">
  import Icon from '$components/ui/Icon.svelte'
  import Inline from '$components/ui/Inline.svelte'
  import { SECTION_ICONS, SECTION_ICON_FALLBACK } from '$content/changelog'
  import { releaseAnchor, type ChangelogRelease } from '$lib/changelog/parse'
  import { formatDate, isoDay } from '$lib/text/format'

  let { release, latest = false }: { release: ChangelogRelease; latest?: boolean } = $props()

  const anchor = $derived(releaseAnchor(release))
</script>

<article
  id={anchor}
  aria-labelledby="{anchor}-title"
  class="grid scroll-mt-24 gap-6 border-t border-white/8 py-14 first:border-t-0 first:pt-4 lg:grid-cols-[14rem_1fr] lg:gap-12"
>
  <div class="lg:sticky lg:top-28 lg:self-start">
    <h2 id="{anchor}-title" class="flex items-center gap-3">
      <a href="#{anchor}" class="font-mono text-2xl font-semibold tracking-tight text-fg hover:text-coral-300">
        {release.unreleased ? release.version : `v${release.version}`}
      </a>
      {#if latest}
        <span class="rounded-full bg-coral-500/15 px-2.5 py-0.5 text-xs font-semibold text-coral-300">Latest</span>
      {/if}
    </h2>
    {#if release.date}
      <time datetime={isoDay(release.date)} class="mt-2 block text-sm text-fg-subtle">{formatDate(release.date)}</time>
    {/if}
    {#if release.url}
      <a
        href={release.url}
        target="_blank"
        rel="noopener"
        class="mt-3 inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        {release.unreleased ? 'Compare on GitHub' : 'Release on GitHub'}
        <Icon name="arrow_outward" size={15} />
      </a>
    {/if}
  </div>

  <div class="min-w-0">
    {#each release.summary as paragraph (paragraph)}
      <p class="mb-8 max-w-3xl text-xl leading-relaxed text-pretty text-fg"><Inline text={paragraph} /></p>
    {/each}

    <div class="space-y-10">
      {#each release.sections as section (section.title)}
        <section>
          <h3 class="flex items-center gap-2.5 text-sm font-semibold tracking-wide text-fg-muted uppercase">
            <Icon name={SECTION_ICONS[section.title] ?? SECTION_ICON_FALLBACK} size={18} class="text-coral-400" />
            {section.title}
          </h3>
          <ul class="mt-4 max-w-3xl space-y-3.5">
            {#each section.items as item (item)}
              <li
                class="relative pl-5 leading-relaxed text-pretty text-fg-muted before:absolute before:top-[0.7em] before:left-0 before:size-1.5 before:rounded-full before:bg-fg-faint"
              >
                <Inline text={item} />
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  </div>
</article>
