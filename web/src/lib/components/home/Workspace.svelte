<script lang="ts">
  import Container from '$components/ui/Container.svelte'
  import SectionHeading from '$components/ui/SectionHeading.svelte'
  import WindowFrame from '$components/ui/WindowFrame.svelte'
  import { WORKSPACE, WORKSPACE_PARTS } from '$content/home'
  import { SITE } from '$lib/config/site'
  import { reveal } from '$lib/motion/reveal'
  import { naturalSizes, WORKSPACE_SHOT } from '$lib/screenshots'

  const STAGGER_MS = 70
</script>

<section class="py-24 sm:py-32">
  <Container>
    <div {@attach reveal()}>
      <SectionHeading title={WORKSPACE.title}>{WORKSPACE.body}</SectionHeading>
    </div>

    <div class="mt-14" {@attach reveal(100)}>
      <WindowFrame title={SITE.name}>
        <enhanced:img
          src={WORKSPACE_SHOT}
          sizes={naturalSizes(WORKSPACE_SHOT)}
          alt={WORKSPACE.alt}
          class="block h-auto w-full"
        />
      </WindowFrame>
    </div>

    <ol class="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
      {#each WORKSPACE_PARTS as part, index (part.title)}
        <li class="border-t border-white/10 pt-5" {@attach reveal(index * STAGGER_MS)}>
          <span class="font-mono text-xs text-coral-400">0{index + 1}</span>
          <h3 class="mt-2 font-semibold text-fg">{part.title}</h3>
          <p class="mt-1.5 text-[0.95rem] leading-relaxed text-fg-muted">{part.body}</p>
        </li>
      {/each}
    </ol>
  </Container>
</section>
