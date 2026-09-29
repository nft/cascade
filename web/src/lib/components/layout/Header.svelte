<script lang="ts">
  import { afterNavigate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { NAV_LINKS, ROUTES } from '$lib/config/routes'
  import { LINKS, SITE } from '$lib/config/site'
  import Container from '$components/ui/Container.svelte'
  import GithubMark from '$components/ui/GithubMark.svelte'
  import Icon from '$components/ui/Icon.svelte'
  import LinkButton from '$components/ui/LinkButton.svelte'
  import Wordmark from '$components/ui/Wordmark.svelte'
  import MobileNav from './MobileNav.svelte'

  const MOBILE_NAV_ID = 'mobile-nav'

  let menuOpen = $state(false)
  afterNavigate(() => (menuOpen = false))
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && (menuOpen = false)} />

<!-- z-30: above page content and the demo's own layers, below nothing. -->
<header class="sticky top-0 z-30 border-b border-white/6 bg-canvas/80 backdrop-blur-xl">
  <Container class="flex h-16 items-center gap-6 lg:gap-10">
    <a href={resolve(ROUTES.home)} class="rounded-lg" aria-label="{SITE.name} home">
      <Wordmark />
    </a>

    <nav aria-label="Main" class="hidden md:block">
      <ul class="flex items-center gap-1">
        {#each NAV_LINKS as link (link.href)}
          <li>
            <a
              href={resolve(link.href)}
              aria-current={page.route.id === link.href ? 'page' : undefined}
              class="rounded-full px-3.5 py-2 text-[0.95rem] font-medium text-fg-muted transition-colors hover:text-fg aria-[current=page]:text-fg"
            >
              {link.label}
            </a>
          </li>
        {/each}
      </ul>
    </nav>

    <div class="ml-auto flex items-center gap-1.5 sm:gap-2.5">
      <a
        href={LINKS.repo}
        target="_blank"
        rel="noopener"
        class="hidden size-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-white/6 hover:text-fg sm:inline-flex"
      >
        <GithubMark size={19} />
        <span class="sr-only">{SITE.name} on GitHub</span>
      </a>
      <LinkButton href={resolve(ROUTES.download)} variant="primary" size="sm">
        <Icon name="download" size={17} />
        Download
      </LinkButton>
      <button
        type="button"
        class="inline-flex size-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-white/6 hover:text-fg md:hidden"
        aria-expanded={menuOpen}
        aria-controls={MOBILE_NAV_ID}
        onclick={() => (menuOpen = !menuOpen)}
      >
        <Icon name={menuOpen ? 'close' : 'menu'} size={22} />
        <span class="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
      </button>
    </div>
  </Container>

  {#if menuOpen}
    <MobileNav id={MOBILE_NAV_ID} />
  {/if}
</header>
