import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { init } from '@fhtml/core'
import { renderFile } from '@fhtml/core/node'

const FHTML_EXT = '.fhtml'
const HTML_EXT = '.html'
const PLUGIN_NAME = 'cascade:fhtml'
const FULL_RELOAD = 'full-reload'

/** `pretty` keeps generated HTML readable while developing; production output
 * is minified since it is never read by hand. */
const RENDER_MODE = { dev: 'pretty', build: 'min' } as const

/** Data handed to every page template. `page` differs per page, the rest is
 * shared, so templates can key off the current page (e.g. nav highlighting). */
export interface PageContext {
  /** Vite's base path, already normalised to a trailing slash. Templates must
   * prefix their own links with it — Vite only rewrites asset URLs it owns. */
  base: string
  dev: boolean
  /** Filename stem of the page being rendered, e.g. `index`. */
  page: string
}

export interface FhtmlPluginOptions {
  /** Directory scanned (non-recursively) for page entries. */
  pagesDir: string
  /** Extra directories whose changes invalidate every page (partials, data). */
  watchDirs?: string[]
  /** Where the compiled `.html` lands — must be the Vite root so that the
   * `/src/…` references inside a page resolve. */
  outDir: string
  /** Builds the template data root for one page. */
  data: (ctx: PageContext) => unknown
  /** Treat compiler warnings as errors. Used in CI builds. */
  denyWarnings?: boolean
}

interface RenderedPage {
  name: string
  htmlPath: string
}

function pageEntries(pagesDir: string): string[] {
  if (!existsSync(pagesDir)) return []
  return readdirSync(pagesDir)
    .filter((f) => extname(f) === FHTML_EXT)
    .sort()
    .map((f) => join(pagesDir, f))
}

/**
 * Compiles every page and writes the ones whose output actually changed.
 *
 * Skipping byte-identical writes is what keeps the dev loop stable: the
 * generated HTML lives inside the Vite root, so an unconditional write would
 * trip Vite's own HTML watcher and reload in a loop.
 */
export function renderPages(
  options: FhtmlPluginOptions,
  ctx: Omit<PageContext, 'page'>,
): RenderedPage[] {
  const { pagesDir, outDir, data, denyWarnings } = options
  const mode = ctx.dev ? RENDER_MODE.dev : RENDER_MODE.build

  mkdirSync(outDir, { recursive: true })

  const pages = pageEntries(pagesDir).map((entry) => {
    const name = basename(entry, FHTML_EXT)
    const { html, warnings } = renderFile(entry, {
      data: data({ ...ctx, page: name }),
      mode,
    })

    if (warnings.length > 0) {
      const detail = warnings.map((w) => `  ${w.msg}`).join('\n')
      const label = `${PLUGIN_NAME}: ${name}${FHTML_EXT}`
      if (denyWarnings) throw new Error(`${label} produced warnings:\n${detail}`)
      console.warn(`${label}:\n${detail}`)
    }

    const htmlPath = join(outDir, `${name}${HTML_EXT}`)
    const previous = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : null
    if (previous !== html) writeFileSync(htmlPath, html)

    return { name, htmlPath }
  })

  prune(outDir, new Set(pages.map((p) => p.name)))
  return pages
}

/**
 * Deletes generated pages whose `.fhtml` source is gone, so a renamed or removed
 * page stops being served and stops being a build input.
 *
 * Every `*.html` directly in `outDir` is ours by construction — `.gitignore`
 * reserves that path for this plugin's output — so anything without a matching
 * source is stale.
 */
function prune(outDir: string, keep: Set<string>): void {
  for (const file of readdirSync(outDir)) {
    if (extname(file) !== HTML_EXT) continue
    if (keep.has(basename(file, HTML_EXT))) continue
    rmSync(join(outDir, file))
  }
}

/**
 * Compiles `src/pages/*.fhtml` into HTML entries for Vite.
 *
 * There is no published Vite integration for fhtml, so the pages are compiled
 * to real files in the Vite root and handed to Rollup as ordinary multi-page
 * HTML inputs. That keeps Vite's own HTML pipeline — asset hashing, CSS
 * extraction, `base` rewriting — working untouched.
 */
export function fhtmlPages(options: FhtmlPluginOptions): Plugin {
  const watched = (options.watchDirs ?? []).map((d) => resolve(d))
  let dev = false

  return {
    name: PLUGIN_NAME,

    // The wasm compiler must be initialised before any render, and Rollup needs
    // its inputs at config time, so both happen here.
    async config(config, env) {
      dev = env.command === 'serve'
      await init()

      // `config()` receives the raw user config, not the resolved one, so the
      // trailing slash `PageContext.base` promises has to be enforced here.
      // Templates concatenate onto it; without this a `BASE_PATH` of "/cascade"
      // silently emits "/cascadedocs.html".
      const pages = renderPages(options, { base: withTrailingSlash(config.base), dev })
      if (pages.length === 0) return

      return {
        build: {
          rollupOptions: {
            input: Object.fromEntries(pages.map((p) => [p.name, p.htmlPath])),
          },
        },
      }
    },

    configureServer(server) {
      const base = withTrailingSlash(server.config.base)
      for (const dir of watched) server.watcher.add(dir)

      const rebuild = (file: string) => {
        const touched =
          file.startsWith(resolve(options.pagesDir)) || watched.some((d) => file.startsWith(d))
        if (!touched) return

        try {
          renderPages(options, { base, dev: true })
          server.ws.send({ type: FULL_RELOAD })
        } catch (err) {
          // A syntax error mid-edit is routine; surface it in the browser
          // overlay instead of tearing the dev server down.
          server.ws.send({ type: 'error', err: toOverlayError(err) })
        }
      }

      server.watcher.on('change', rebuild)
      server.watcher.on('add', rebuild)
      server.watcher.on('unlink', rebuild)
    },
  }
}

export function withTrailingSlash(base: string | undefined): string {
  if (base === undefined || base === '') return '/'
  return base.endsWith('/') ? base : `${base}/`
}

function toOverlayError(err: unknown): { message: string; stack: string } {
  const e = err as { message?: string; stack?: string; line?: number; col?: number; file?: string }
  const where = e.line != null ? ` (${e.file ?? ''}:${e.line}:${e.col ?? 0})` : ''
  return { message: `${e.message ?? String(err)}${where}`, stack: e.stack ?? '' }
}
