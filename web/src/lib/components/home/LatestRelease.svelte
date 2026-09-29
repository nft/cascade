<script lang="ts">
  import { resolve } from '$app/paths'
  import Container from '$components/ui/Container.svelte'
  import Icon from '$components/ui/Icon.svelte'
  import Inline from '$components/ui/Inline.svelte'
  import SectionHeading from '$components/ui/SectionHeading.svelte'
  import { NEXT_UP, RELEASES_INTRO } from '$content/home'
  import { releaseAnchor, type ChangelogRelease } from '$lib/changelog/parse'
  import { ROUTES } from '$lib/config/routes'
  import { LINKS } from '$lib/config/site'
  import { reveal } from '$lib/motion/reveal'
  import { formatDate, isoDay } from '$lib/text/format'
  import { firstSentence } from '$lib/text/sentence'

  // The newest release's highlights beside what the roadmap has next.
  const HIGHLIGHTS = 5
  const CARD_DELAY_MS = 80
  const ASIDE_DELAY_MS = 160

  let { latest }: { latest: ChangelogRelease } = $props()

  const highlights = $derived(latest.sections[0]?.items.slice(0, HIGHLIGHTS).map(firstSentence) ?? [])
  const CARD = 'rounded-3xl border border-white/8 bg-surface p-6 shadow-card sm:p-8'
</script>

<section class="py-24 sm:py-32">
  <Container>
    <div {@attach reveal()}>
      <SectionHeading title={RELEASES_INTRO.title}>{RELEASES_INTRO.body}</SectionHeading>
    </div>

    <div class="mt-14 grid gap-4 lg:grid-cols-12">
      <article class="{CARD} lg:col-span-7" {@attach reveal(CARD_DELAY_MS)}>
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <span class="rounded-full bg-coral-500/15 px-3 py-1 font-mono font-semibold text-coral-300">
            v{latest.version}
          </span>
          {#if latest.date}
            <time datetime={isoDay(latest.date)} class="text-fg-subtle">{formatDate(latest.date)}</time>
          {/if}
        </div>
        {#each latest.summary.slice(0, 1) as paragraph (paragraph)}
          <p class="mt-5 text-lg leading-relaxed text-pretty text-fg"><Inline text={paragraph} /></p>
        {/each}
        <ul class="mt-6 space-y-3">
          {#each highlights as item (item)}
            <li class="flex gap-3 text-[0.95rem] leading-relaxed text-fg-muted">
              <Icon name="check" size={18} class="mt-0.5 text-coral-400" />
              <span><Inline text={item} /></span>
            </li>
          {/each}
        </ul>
        <a
          href="{resolve(ROUTES.changelog)}#{releaseAnchor(latest)}"
          class="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-coral-300 hover:text-coral-200"
        >
          Read the full notes
          <Icon name="arrow_forward" size={16} />
        </a>
      </article>

      <aside class="{CARD} flex flex-col lg:col-span-5" {@attach reveal(ASIDE_DELAY_MS)}>
        <h3 class="flex items-center gap-2.5 font-semibold text-fg">
          <Icon name="schedule" size={20} class="text-fg-subtle" />
          {RELEASES_INTRO.next}
        </h3>
        <ol class="mt-6 space-y-4">
          {#each NEXT_UP as item, index (item)}
            <li class="flex gap-4 text-[0.95rem] leading-relaxed text-fg-muted">
              <span class="font-mono text-xs leading-6 text-fg-faint">0{index + 1}</span>
              {item}
            </li>
          {/each}
        </ol>
        <a
          href={LINKS.roadmap}
          target="_blank"
          rel="noopener"
          class="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg lg:mt-auto"
        >
          The roadmap on GitHub
          <Icon name="arrow_outward" size={16} />
        </a>
      </aside>
    </div>
  </Container>
</section>
