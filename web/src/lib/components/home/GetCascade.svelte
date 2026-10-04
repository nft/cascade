<script lang="ts">
  import { resolve } from '$app/paths'
  import PlatformCard from '$components/release/PlatformCard.svelte'
  import Container from '$components/ui/Container.svelte'
  import Icon from '$components/ui/Icon.svelte'
  import SectionHeading from '$components/ui/SectionHeading.svelte'
  import { GET_CASCADE } from '$content/home'
  import { ANCHORS, ROUTES } from '$lib/config/routes'
  import { LINKS } from '$lib/config/site'
  import { reveal } from '$lib/motion/reveal'
  import { detectedPlatform } from '$lib/release/detected.svelte'
  import { PLATFORM_IDS, PLATFORMS, type ReleaseState } from '$lib/release/platforms'

  let { release }: { release: ReleaseState } = $props()

  const detected = detectedPlatform()
  const STAGGER_MS = 80
  const LINK = 'inline-flex items-center gap-1.5 font-semibold text-fg-muted transition-colors hover:text-fg'
</script>

<section class="relative isolate overflow-hidden py-24 sm:py-32">
  <div
    aria-hidden="true"
    class="absolute bottom-0 left-1/2 -z-10 h-[30rem] w-[min(64rem,140vw)] -translate-x-1/2 translate-y-1/3 rounded-[100%] bg-coral-500/10 blur-3xl"
  ></div>

  <Container>
    <div {@attach reveal()}>
      <SectionHeading title={GET_CASCADE.title} align="center">{GET_CASCADE.body}</SectionHeading>
    </div>

    <div class="mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-3">
      {#each PLATFORM_IDS as id, index (id)}
        <PlatformCard
          platform={PLATFORMS[id]}
          {release}
          detected={detected.current === id}
          {@attach reveal(index * STAGGER_MS)}
        />
      {/each}
    </div>

    <p class="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
      <a href="{resolve(ROUTES.download)}#{ANCHORS.install}" class={LINK}>
        Install notes and checksums
        <Icon name="arrow_forward" size={16} />
      </a>
      <a href={LINKS.releases} target="_blank" rel="noopener" class={LINK}>
        Every release on GitHub
        <Icon name="arrow_outward" size={16} />
      </a>
    </p>
  </Container>
</section>
