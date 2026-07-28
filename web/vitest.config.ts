import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

/** Kept separate from `vite.config.ts` so the test run does not pull in the
 * Tailwind and fhtml build plugins — the page-rendering test drives the fhtml
 * compiler directly instead. */
export default defineConfig({
  root,
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
})
