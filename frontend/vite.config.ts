import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  // Vitest runs in Node; resolve Svelte (and friends) to their client builds
  // so component tests can mount() into jsdom.
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  // The dev-mode script sandbox stand-in imports core/transform/helpers.js
  // (?raw) from outside the frontend root.
  server: { fs: { allow: ['..'] } },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
