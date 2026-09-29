<script lang="ts">
  import { asset } from '$app/paths'
  import { page } from '$app/state'
  import { SITE, SITE_ORIGIN, pageTitle } from '$lib/config/site'

  let { title, description = SITE.description }: { title?: string; description?: string } = $props()

  const fullTitle = $derived(pageTitle(title))
  const canonical = $derived(new URL(page.url.pathname, SITE_ORIGIN).href)
  const image = new URL(asset(SITE.ogImage.path), SITE_ORIGIN).href
</script>

<svelte:head>
  <title>{fullTitle}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={SITE.name} />
  <meta property="og:title" content={fullTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content={image} />
  <meta property="og:image:width" content={String(SITE.ogImage.width)} />
  <meta property="og:image:height" content={String(SITE.ogImage.height)} />
  <meta property="og:image:alt" content={SITE.ogImage.alt} />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>
