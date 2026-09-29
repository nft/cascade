<script lang="ts">
  import { resolve } from '$app/paths'
  import DemoWindow from '$components/demo/DemoWindow.svelte'
  import DownloadButton from '$components/release/DownloadButton.svelte'
  import Container from '$components/ui/Container.svelte'
  import GithubMark from '$components/ui/GithubMark.svelte'
  import Icon from '$components/ui/Icon.svelte'
  import LinkButton, { ICON_SIZE } from '$components/ui/LinkButton.svelte'
  import { HERO } from '$content/home'
  import { releaseAnchor, type ChangelogRelease } from '$lib/changelog/parse'
  import { ROUTES } from '$lib/config/routes'
  import { LINKS } from '$lib/config/site'
  import type { ReleaseState } from '$lib/release/platforms'

  let { release, latest }: { release: ReleaseState; latest: ChangelogRelease | null } = $props()
</script>

<section class="relative isolate overflow-hidden pt-12 pb-24 sm:pt-20 lg:pt-24">
  <!-- The canvas' dot grid fading out from the top, and a coral glow under the demo. -->
  <div
    aria-hidden="true"
    class="absolute inset-x-0 top-0 -z-10 h-[44rem] bg-dots [mask-image:radial-gradient(ellipse_80%_70%_at_50%_0%,black,transparent)] [--dot-gap:26px]"
  ></div>
  <div
    aria-hidden="true"
    class="absolute top-[30rem] left-1/2 -z-10 h-[34rem] w-[min(76rem,140vw)] -translate-x-1/2 rounded-[100%] bg-coral-500/9 blur-3xl"
  ></div>

  <Container>
    <div class="grid items-end gap-8 lg:grid-cols-12 lg:gap-12">
      <div class="lg:col-span-7">
        {#if latest}
          <a
            href="{resolve(ROUTES.changelog)}#{releaseAnchor(latest)}"
            class="group inline-flex animate-rise items-center gap-2.5 rounded-full border border-white/10 bg-white/3 py-1 pr-3 pl-1 text-sm text-fg-muted transition-colors hover:border-white/20 hover:text-fg motion-reduce:animate-none"
          >
            <span class="rounded-full bg-coral-500/15 px-2.5 py-0.5 text-xs font-semibold text-coral-300">New</span>
            What’s in {latest.version}
            <Icon name="arrow_forward" size={16} class="transition-transform group-hover:translate-x-0.5" />
          </a>
        {/if}
        <h1
          class="mt-7 animate-rise text-[3.1rem] leading-[0.98] font-semibold tracking-[-0.045em] text-balance [animation-delay:80ms] motion-reduce:animate-none sm:text-7xl lg:text-[4rem] xl:text-[5.25rem]"
        >
          {HERO.lead} <span class="text-coral-400">{HERO.emphasis}</span>
        </h1>
      </div>

      <div class="animate-rise [animation-delay:160ms] motion-reduce:animate-none lg:col-span-5 lg:pb-1.5">
        <p class="max-w-xl text-lg leading-relaxed text-pretty text-fg-muted sm:text-xl">{HERO.sub}</p>
        <div class="mt-8 flex flex-wrap gap-3">
          <DownloadButton {release} class="sm:min-w-[16.5rem]" />
          <LinkButton href={LINKS.repo} variant="secondary" size="lg" external>
            <GithubMark size={ICON_SIZE.lg} />
            View on GitHub
          </LinkButton>
        </div>
        <p class="mt-5 text-sm text-fg-subtle">{HERO.meta}</p>
      </div>
    </div>
  </Container>

  <Container width="wide" class="mt-16 animate-rise [animation-delay:260ms] motion-reduce:animate-none sm:mt-20">
    <DemoWindow />
  </Container>
</section>
