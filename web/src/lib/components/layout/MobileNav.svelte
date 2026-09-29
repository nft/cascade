<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { NAV_LINKS } from '$lib/config/routes'
  import { LINKS } from '$lib/config/site'
  import Container from '$components/ui/Container.svelte'
  import GithubMark from '$components/ui/GithubMark.svelte'
  import Icon from '$components/ui/Icon.svelte'

  let { id }: { id: string } = $props()
</script>

<nav {id} aria-label="Main" class="border-t border-white/6 bg-canvas/95 md:hidden">
  <Container class="py-3">
    <ul class="divide-y divide-white/6">
      {#each NAV_LINKS as link (link.href)}
        <li>
          <a
            href={resolve(link.href)}
            aria-current={page.route.id === link.href ? 'page' : undefined}
            class="flex items-center justify-between py-3.5 text-base font-medium text-fg-muted aria-[current=page]:text-fg"
          >
            {link.label}
            <Icon name="arrow_forward" size={18} class="text-fg-faint" />
          </a>
        </li>
      {/each}
      <li>
        <a href={LINKS.repo} target="_blank" rel="noopener" class="flex items-center gap-2.5 py-3.5 text-base font-medium text-fg-muted">
          <GithubMark size={18} />
          Source on GitHub
        </a>
      </li>
    </ul>
  </Container>
</nav>
