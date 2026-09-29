import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

// GitHub Pages serves a project site from the repository's sub-path, so the
// Pages workflow sets BASE_PATH=/cascade. Unset, the site builds for the root.
const base = process.env.BASE_PATH ?? ''

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // GitHub Pages answers unknown paths with 404.html. As a SvelteKit
    // fallback it boots the client router, which renders +error.svelte.
    adapter: adapter({ fallback: '404.html' }),
    // Absolute paths: GitHub Pages serves 404.html at whatever depth was
    // requested, where relative asset paths would miss, and og:image needs
    // an absolute URL anyway.
    paths: { base, relative: false },
    // SvelteKit mirrors these into Vite's resolve.alias and tsconfig paths.
    alias: {
      $components: 'src/lib/components',
      $content: 'src/lib/content',
      $demo: 'src/lib/demo',
      $assets: 'src/lib/assets',
      // The repository root, for build-time reads of CHANGELOG.md.
      $repo: '..',
    },
  },
}

export default config
