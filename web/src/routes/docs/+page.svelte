<script lang="ts">
  import DocSection from '$components/docs/DocSection.svelte'
  import DocsNav from '$components/docs/DocsNav.svelte'
  import Seo from '$components/layout/Seo.svelte'
  import Container from '$components/ui/Container.svelte'
  import PageHeader from '$components/ui/PageHeader.svelte'
  import { DOC_SECTIONS, DOCS_PAGE } from '$content/docs'
  import { scrollSpy } from '$lib/motion/scrollSpy'

  let current = $state<string | null>(null)
</script>

<Seo title={DOCS_PAGE.title} description={DOCS_PAGE.description} />

<PageHeader title={DOCS_PAGE.heading} lead={DOCS_PAGE.lead} />

<Container class="py-12 sm:py-16 lg:py-20">
  <div class="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16 xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-20">
    <DocsNav sections={DOC_SECTIONS} {current} />
    <article class="max-w-3xl min-w-0" {@attach scrollSpy('section[id]', (id) => (current = id))}>
      {#each DOC_SECTIONS as section (section.id)}
        <DocSection {section} />
      {/each}
    </article>
  </div>
</Container>
