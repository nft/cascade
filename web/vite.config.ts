import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fhtmlPages } from './plugins/fhtml'
import { templateData } from './src/data/template'

const root = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(root, 'src')

/** GitHub Pages serves the project site from `/<repo>/`; `BASE_PATH` lets the
 * Pages workflow (or a custom domain) override it. */
const BASE_PATH = process.env.BASE_PATH ?? '/cascade/'

export default defineConfig({
  root,
  base: BASE_PATH,
  plugins: [
    tailwindcss(),
    fhtmlPages({
      pagesDir: resolve(srcDir, 'pages'),
      watchDirs: [resolve(srcDir, 'partials'), resolve(srcDir, 'data')],
      outDir: root,
      data: templateData,
      denyWarnings: process.env.CI === 'true',
    }),
  ],
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
  },
})
