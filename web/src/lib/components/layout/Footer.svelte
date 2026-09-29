<script lang="ts">
  import { resolve } from '$app/paths'
  import { ROUTES } from '$lib/config/routes'
  import { SITE } from '$lib/config/site'
  import { COPYRIGHT_HOLDER, FOOTER_BLURB, FOOTER_COLUMNS } from '$content/footer'
  import Container from '$components/ui/Container.svelte'
  import Wordmark from '$components/ui/Wordmark.svelte'

  const year = new Date().getFullYear()
  const LINK_CLASS = 'text-[0.94rem] text-fg-muted transition-colors hover:text-fg'
</script>

<footer class="border-t border-white/6 bg-surface/40">
  <Container class="grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)] md:gap-8">
    <div class="max-w-xs">
      <a href={resolve(ROUTES.home)} class="inline-block rounded-lg" aria-label="{SITE.name} home">
        <Wordmark />
      </a>
      <p class="mt-4 text-sm leading-relaxed text-fg-subtle">{FOOTER_BLURB}</p>
    </div>

    {#each FOOTER_COLUMNS as column (column.heading)}
      <div>
        <h2 class="text-sm font-semibold text-fg">{column.heading}</h2>
        <ul class="mt-4 space-y-3">
          {#each column.links as link (link.label)}
            <li>
              {#if 'route' in link}
                <a href={resolve(link.route)} class={LINK_CLASS}>{link.label}</a>
              {:else}
                <a href={link.url} target="_blank" rel="noopener" class={LINK_CLASS}>{link.label}</a>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </Container>

  <Container class="flex flex-col gap-2 border-t border-white/6 py-6 text-sm text-fg-subtle sm:flex-row sm:justify-between">
    <p>&copy; {year} {COPYRIGHT_HOLDER}. Released under the {SITE.license} License.</p>
    <p>Made with Go, Wails and Svelte.</p>
  </Container>
</footer>
