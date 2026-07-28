# Cascade website

The marketing and documentation site for the Cascade desktop app, published to
<https://nft.github.io/cascade/>. It is a static three-page site — `index`, `docs`, `404` — with no
backend and no client-side router. The only interactive parts are the mobile nav disclosure, the
copy-the-install-command button, and an animated demo graph on the landing page.

It is independent of the app: nothing here imports from `core/`, `frontend/`, or the Go shell, and
nothing in the app imports from here. The demo graph is a hand-written fixture, not a live run.

## Stack

| Piece | What it does |
| --- | --- |
| [Bun](https://bun.sh) | Package manager and script runner |
| [Vite 8](https://vite.dev) | Build and dev server, multi-page HTML inputs |
| [Tailwind CSS v4](https://tailwindcss.com) | Styling, via `@tailwindcss/vite` |
| [fhtml](https://nft.github.io/fhtml/) (`@fhtml/core`) | Markup language the pages are authored in |
| [ae](https://nft.github.io/ae/) (`@aeroapp/ae`) | Attribute-based reactivity |
| Vitest + jsdom | Tests |
| `@fontsource-variable/*` | Self-hosted Inter and JetBrains Mono, weight axis only |

## Why fhtml needs a local Vite plugin

There is no published Vite integration for fhtml, so `plugins/fhtml.ts` is a local plugin rather
than a dependency. It does three things:

1. Awaits `init()` from `@fhtml/core` — the compiler is WASM and must be initialised before any
   render. This happens in the `config` hook because Rollup needs its inputs at config time.
2. Renders every `src/pages/*.fhtml` through `renderFile()` and writes the result to `<root>/*.html`.
   The output has to land in the Vite root: an HTML entry's `/src/style.css` and `/src/main.ts`
   references are resolved relative to the root.
3. Returns those files as `build.rollupOptions.input`, so from Vite's point of view this is an
   ordinary multi-page HTML build. Asset hashing, CSS extraction, and `base` rewriting all keep
   working untouched.

Those generated `*.html` files at the web root are build output and are gitignored (`/*.html`).

Two details in the plugin are load-bearing and easy to undo by accident:

- **Byte-identical writes are skipped.** The generated HTML lives inside the Vite root, so an
  unconditional write would trip Vite's own HTML watcher and reload in a loop.
- **Dev-time render errors go to the browser overlay**, not to the process. A syntax error
  mid-edit is routine and should not tear the dev server down.

In dev the plugin also watches `src/partials/` and `src/data/`; a change in either re-renders every
page and sends a full reload, since any page may depend on them.

`denyWarnings` turns fhtml compiler warnings into hard errors. `vite.config.ts` enables it when
`process.env.CI === 'true'`, which is the case in GitHub Actions — a template warning that is only
logged locally will fail the CI build.

## Commands

```sh
bun install

bun run dev        # Vite dev server, re-renders pages on .fhtml/data changes
bun run build      # production build into dist/
bun run preview    # serve dist/ locally
bun run check      # tsc --noEmit
bun run test       # vitest run
bun run test:watch
```

`vitest.config.ts` is deliberately separate from `vite.config.ts` so the test run does not pull in
the Tailwind and fhtml build plugins. It collects `tests/**/*.test.ts` under jsdom.

Two of those are currently red on a clean checkout, and the Pages workflow runs both:

- `bun run check` fails on `src/lib/demo.ts:169` — `bindLog()` takes `{ value: LogRow[] }` but
  `.list()` expects ae's `Reactive<readonly LogRow[]>`.
- `bun run test` fails with `No test files found` — `tests/` does not exist yet.

`bun run build` passes, including with `CI=true`.

## Layout

```
plugins/fhtml.ts     the Vite plugin described above
src/pages/*.fhtml    one file per output page; the filename stem becomes <stem>.html
src/partials/*.fhtml shared defs, included by the pages
src/data/*.ts        all content, plus the template data root
src/lib/*.ts         constants and behaviour
src/main.ts          the single entry module
src/style.css        the only stylesheet
public/              copied verbatim into dist/ (favicon.svg, .nojekyll)
tests/               Vitest specs (configured, not yet written)
```

**Pages** are whole documents. Each one includes the three partials, calls `+doc_head(...)`,
`+site_header(...)` and `+site_footer(...)`, and writes its own sections inline.

**Partials** hold only defs used by more than one page — single-use section markup stays in the page
that owns it. `icons.fhtml` is an inline SVG sprite referenced by `<use>` (no icon font);
`layout.fhtml` is head, header and footer; `ui.fhtml` is the repeated blocks (`feature_card`,
`step_row`, `code_block`, `demo_node`, …).

**Data** is the single source of content. `src/data/site.ts` holds every string on the site —
nav links, hero, features, steps, footer columns, the whole docs outline. `src/data/demo.ts` holds
the demo graph. `src/data/template.ts` exports `templateData(ctx)`, the one data root every page
reads from; there is no second source of content and no copy inlined in the templates.

**Lib** is behaviour and shared tokens. `graph.ts` is pure and framework-free — bezier edge paths,
port positions, Kahn's-algorithm `topoLevels()`, `descendantsOf()` — and is used at build time (the
edges are rendered as static SVG) and at run time (the demo schedules levels through it). `nav.ts`,
`copy.ts` and `demo.ts` each export one `init*()` that binds by name and is a no-op on pages without
the matching elements, which is why one entry module can serve the whole site.

## `data-ae` names come from `constants.ts`

`@aeroapp/ae` binds an element to script by name: markup carries `data-ae="run-demo"`, script calls
`ae('run-demo')`. Written that way the two sides are a pair of string literals that drift silently.

They are not written that way here. `AE` in `src/lib/constants.ts` is the only place the names
exist. `templateData()` passes that object into the templates as `ae`, and the markup interpolates
it:

```
button(type=button data-ae={ae.runDemo}) ...
```

while `src/lib/demo.ts` reads the same object:

```ts
ae(AE.runDemo).press(...)
```

Rename a key and both sides move together; delete one and the template fails to resolve. The same
applies to `LOG_PART` (row-local part names, exposed as `logPart`), `DATA_ATTR` (exposed as `attr`),
and `NODE_STATE` / `NODE_STATE_CLASS` (exposed as `state` and `stateClass`).

State-to-class-name mappings are lookups (`NODE_STATE_CLASS`, `CHIP_CLASS`, `METHOD_CLASS`) rather
than names assembled from a token, for two reasons: fhtml rejects class names built from
expressions, and Tailwind's scanner is static, so a class name that only exists as a concatenation
at run time is never generated.

Tailwind has no built-in reason to scan `.fhtml`, so `src/style.css` declares `@source` for the
page, partial, lib and data directories. Class tokens in fhtml are bare words, which the standard
extractor finds. Design tokens live in `@theme` and mirror the desktop app's shell colours.

## Base path and links

The site is served from a project sub-path, so `vite.config.ts` sets:

```ts
const BASE_PATH = process.env.BASE_PATH ?? '/cascade/'
```

Vite rewrites the asset URLs it owns. Links written in template content are not Vite's, so
`resolveHref()` in `src/data/template.ts` prefixes them with `base` before they reach the templates,
and pages that build a URL inline write `href="{base}docs.html"`. `canonicalUrl()` produces the
absolute `SITE_URL`-based URL used for `<link rel=canonical>` and `og:url`.

A move to a custom domain needs two changes, not one: set `BASE_PATH=/` for the link prefix, and
update `SITE_URL` in `src/data/site.ts`, which is the origin `canonicalUrl()` builds on. Changing
only `BASE_PATH` leaves every `<link rel=canonical>` and `og:url` pointing at the old
`github.io` host. `BASE_PATH` must keep its trailing slash; the fhtml plugin normalises it, but
the value is clearest written correctly.

## Deployment

`.github/workflows/pages.yml` (at the repository root, not in `web/`) builds and deploys this
directory to GitHub Pages. It runs on pushes to `main` that touch `web/**` or the workflow file, and
on manual dispatch — a change to the desktop app does not trigger a publish.

The build job runs `bun install --frozen-lockfile`, `bun run check`, `bun run test`, `bun run build`
with the working directory set to `web/`, then uploads `web/dist` as the Pages artifact. A separate
deploy job publishes it, with `concurrency: {group: pages, cancel-in-progress: false}` so deploys
queue instead of racing. `BASE_PATH` is set explicitly in the workflow even though `vite.config.ts`
already defaults to it, so the deployed base is visible in one place.

`public/.nojekyll` ships in `dist/` so the published output is served as-is.
