<script lang="ts">
  import '../app.css'
  import Footer from '$components/layout/Footer.svelte'
  import Header from '$components/layout/Header.svelte'
  import { TEXT_FONTS_URL, iconFontUrl } from '$lib/fonts'

  const MAIN_ID = 'main'

  let { children } = $props()
</script>

<svelte:head>
  <link rel="stylesheet" href={TEXT_FONTS_URL} />
  <link rel="stylesheet" href={iconFontUrl()} />
</svelte:head>

<a
  href="#{MAIN_ID}"
  class="sr-only rounded-full bg-coral-500 px-4 py-2 font-semibold text-canvas focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-40"
>
  Skip to content
</a>

<div class="flex min-h-dvh flex-col">
  <Header />
  <main id={MAIN_ID} class="flex-1">
    {@render children()}
  </main>
  <Footer />
</div>
