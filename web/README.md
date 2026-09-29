# Cascade website

The website for the Cascade desktop app, published to <https://nft.github.io/cascade/>: a home page
with a runnable replica of the canvas, the features, downloads, the changelog and the user docs. It
is a SvelteKit app prerendered to static HTML, with no server.

It is independent of the app: nothing here imports from `core/`, `frontend/` or the Go shell. It
reads two things from the repository at build time: `CHANGELOG.md`, rendered as the changelog page,
and the latest GitHub release, whose files the download buttons link to.

## Commands

```sh
bun install
bun run dev        # dev server
bun run check      # svelte-check, warnings fail it
bun run test       # Vitest, run once
bun run build      # static site in build/
bun run preview    # serve build/
```

The Pages workflow builds with `BASE_PATH=/cascade`, the repository's sub-path on GitHub Pages.
Build and preview with it locally to check links the way they will be served, at
<http://localhost:4173/cascade/>. The preview needs the variable too:

```sh
export BASE_PATH=/cascade
bun run build && bun run preview
```

## Release data

Every page asks the GitHub API for the latest release while it prerenders, once per build. Without
a published release the download buttons fall back to the download page, which explains how to
build from source; if GitHub cannot be reached the build still succeeds and the pages say so.

- `GITHUB_TOKEN` authenticates that request, which avoids the anonymous rate limit. CI passes the
  workflow token; locally, `GITHUB_TOKEN=$(gh auth token) bun run build`.
- `RELEASE_FIXTURE=path/to/release.json` skips the network and reads a saved
  `GET /repos/{owner}/{repo}/releases/latest` response instead, to preview the published state.

The release workflow (`.github/workflows/release.yml`) uploads files named as in
`src/lib/release/platforms.ts`, and rebuilds this site when it has published them.

## Layout

| Path | Contents |
| --- | --- |
| `src/routes/` | One folder per page; the root layout sets `prerender` for all of them |
| `src/lib/content/` | Every piece of page copy, checked against the app's code |
| `src/lib/components/` | Components by page (`home/`, `features/`, `docs/`, …), plus `ui/` primitives and `layout/` |
| `src/lib/demo/` | The canvas replica: board layout, the simulated runner and its styles |
| `src/lib/release/` | Platforms, release asset names and visitor platform detection |
| `src/lib/server/` | Build-time reads: the GitHub release and `CHANGELOG.md` |
| `src/lib/changelog/` | The Keep a Changelog parser behind the changelog page |
| `src/lib/assets/screenshots/` | App screenshots, served in AVIF and WebP by `@sveltejs/enhanced-img` |
| `static/` | Favicons and the social card, copied as-is |

Aliases (`$components`, `$content`, `$demo`, `$assets`, and `$repo` for the repository root) are
declared once in `svelte.config.js`; SvelteKit passes them on to Vite and TypeScript.

## Conventions

- **Claims are verified.** Copy about the app is checked against its code and `CHANGELOG.md` before
  it lands in `src/lib/content/`. Keep it that way when the app changes.
- **Icons are a subset.** The Material Symbols request lists exactly the glyphs in
  `src/lib/icons.ts`, and `Icon.svelte` only accepts names from it; add a name there before using it.
- **Styling** follows the repository rules: Tailwind utilities, tokens in the `@theme` block of
  `src/app.css`, and real CSS only for what utilities cannot express, with a comment saying why.
- **Screenshots** are 2x captures of the app running in its browser-only mode (`frontend/`,
  `bun run dev`) against the demo project it seeds, cropped and saved as WebP. `CAPTURE_SCALE` in
  `src/lib/screenshots.ts` must match the capture's device scale factor.
