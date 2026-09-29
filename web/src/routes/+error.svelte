<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import Seo from '$components/layout/Seo.svelte'
  import Container from '$components/ui/Container.svelte'
  import Icon from '$components/ui/Icon.svelte'
  import { ERROR_LINKS, HTTP_NOT_FOUND, NOT_FOUND, OTHER_ERROR } from '$content/error'

  const copy = $derived(page.status === HTTP_NOT_FOUND ? NOT_FOUND : OTHER_ERROR)
</script>

<Seo title={copy.title} />

<section class="relative isolate overflow-hidden py-24 sm:py-32">
  <div
    aria-hidden="true"
    class="absolute inset-0 -z-10 bg-dots [mask-image:radial-gradient(ellipse_60%_70%_at_50%_0%,black,transparent)] [--dot-gap:26px]"
  ></div>
  <Container width="narrow" class="text-center">
    <p class="font-mono text-sm font-semibold text-coral-400">{page.status}</p>
    <h1 class="mt-4 text-4xl leading-tight font-semibold tracking-[-0.035em] text-balance sm:text-6xl">{copy.title}</h1>
    <p class="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-pretty text-fg-muted">{copy.lead}</p>

    <ul class="mt-14 grid gap-3 text-left sm:grid-cols-2">
      {#each ERROR_LINKS as link (link.href)}
        <li>
          <a
            href={resolve(link.href)}
            class="group flex items-center gap-4 rounded-2xl border border-white/8 bg-surface p-5 shadow-card transition-colors hover:border-white/16"
          >
            <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-navy ring-1 ring-white/8">
              <Icon name={link.icon} size={21} class="text-coral-400" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-semibold text-fg">{link.label}</span>
              <span class="block text-sm text-fg-muted">{link.body}</span>
            </span>
            <Icon
              name="arrow_forward"
              size={18}
              class="text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
            />
          </a>
        </li>
      {/each}
    </ul>
  </Container>
</section>
