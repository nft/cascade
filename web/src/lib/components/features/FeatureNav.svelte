<script lang="ts">
  import Container from '$components/ui/Container.svelte'
  import Icon from '$components/ui/Icon.svelte'
  import { FEATURES_PAGE, type FeatureSection } from '$content/features'
  import { prefersReducedMotion } from '$lib/motion/reveal'

  // Sticks under the site header and marks the section being read. Where the
  // labels overflow (phones), the row scrolls sideways to keep it in view.
  let { sections, current }: { sections: readonly FeatureSection[]; current: string | null } = $props()

  // Reruns whenever `current` changes. Scrolls the row only: scrollIntoView
  // could cancel the page's own smooth scroll to the section.
  function centerCurrent(list: HTMLUListElement) {
    const link = current ? list.querySelector<HTMLElement>(`[href="#${current}"]`) : null
    if (!link) return
    list.scrollTo({
      left: link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }
</script>

<!-- z-20: over the sections, under the site header (z-30). -->
<nav aria-label={FEATURES_PAGE.navLabel} class="sticky top-16 z-20 border-b border-white/6 bg-canvas/80 backdrop-blur-xl">
  <Container>
    <ul
      {@attach centerCurrent}
      class="relative -mx-4 flex gap-1 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:justify-center-safe lg:px-0"
    >
      {#each sections as section (section.id)}
        <li class="shrink-0">
          <a
            href="#{section.id}"
            aria-current={current === section.id ? 'location' : undefined}
            class="group flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap text-fg-muted transition-colors hover:text-fg aria-[current=location]:bg-white/8 aria-[current=location]:text-fg"
          >
            <Icon
              name={section.icon}
              size={17}
              class="text-fg-subtle transition-colors group-aria-[current=location]:text-coral-400"
            />
            {section.nav}
          </a>
        </li>
      {/each}
    </ul>
  </Container>
</nav>
