import { enhancedImages } from '@sveltejs/enhanced-img'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // enhancedImages must run before the SvelteKit plugin.
  plugins: [tailwindcss(), enhancedImages(), sveltekit()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
