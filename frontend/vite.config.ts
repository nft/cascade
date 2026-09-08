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
  server: {
    fs: { allow: ['..'] },
    // In `wails dev` the page is served from wails.localhost, a hostname macOS
    // App Transport Security refuses cleartext websockets to, killing HMR. Pin
    // the socket's hostname to localhost (ATS-exempt); it still reaches Vite
    // through the Wails dev proxy on the page's port.
    ws: { host: 'localhost' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
    // Capture timestamps are UTC on the wire and rendered in the viewer's
    // clock, so a UTC test machine would pass either way. Tokyo has no DST,
    // which keeps the expected values fixed year-round.
    env: { TZ: 'Asia/Tokyo' },
  },
})
