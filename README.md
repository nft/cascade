# Cascade

Cascade generates large amounts of complicated, interdependent data against real APIs. Instead of writing one-off seed scripts you wire a visual graph of API calls: each node creates or fetches something, downstream nodes bind to the outputs (ids, tokens, nested objects) of the nodes they are connected to, and running the graph cascades data through the system. It is a desktop app — a Go backend embedding a webview — and everything it writes (projects, boards, shared exports) is plain, versioned JSON meant to live in git. Secrets are the exception: they go to the OS keychain, never into a project or export file.

## Download

Builds for macOS, Windows and Linux are on the [releases page](https://github.com/nft/cascade/releases), with install notes and checksums on the [website](https://nft.github.io/cascade/download). The macOS build is signed and notarized by Apple; the Windows build is not code-signed yet, so SmartScreen asks before its first launch.

## Status

0.1.0 is the first public preview; [CHANGELOG.md](CHANGELOG.md) lists what it does and its known limitations. Runs are real: `App.RunBoard` hands the board to the Go DAG executor ([`core/exec/`](core/exec/)), which streams node states back to the canvas as Wails events, and `StopRun` cancels requests in flight.

**Not built yet**

- **OpenAPI/Swagger import does not exist.** There is no spec parser in the Go code — `core/schema/` holds only sample-response schema inference. The "Import schema" button in the top bar is an inert placeholder, and the operation palette comes from an embedded demo catalog ([`seed/default.json`](seed/default.json)).
- Nodes run one at a time in dependency order; independent branches do not run in parallel. Pause/resume, per-node log policy, value generators, and LLM-assisted values are untouched.

[ROADMAP.md](ROADMAP.md) lists what comes next.

## First launch

On an empty data directory Cascade creates a project named "Default" from `seed/default.json`: a demo operation catalog, environments, credentials, a collection, and a "Main" board already populated with nodes. The catalog is fabricated, but Run is not: the board targets `http://localhost:8080`, so pressing Run issues real HTTP requests and the first node fails with connection-refused until something is listening there. Point the `local` environment at your own API to see it work.

Working in it: pick a request from the sidebar (sources or collections) → drop it on the canvas → connect nodes to declare dependencies → fill fields in the inspector, binding upstream outputs with `{{...}}` → Run.

## Stack

- **Backend**: Go and [Wails v2](https://wails.io/), both at the versions `go.mod` pins. The toolchain stays on Go 1.26, the last release that runs on macOS 12, the app's minimum. Two direct dependencies beyond Wails: [goja](https://github.com/dop251/goja) (embedded JavaScript for transform scripts) and [go-keyring](https://github.com/zalando/go-keyring) (OS keychain).
- **Frontend**: Svelte 5 with runes (no SvelteKit) + TypeScript, Vite, Tailwind CSS v4 (CSS-first `@theme` config in `frontend/src/style.css`), [`@xyflow/svelte`](https://svelteflow.dev/) for the node canvas, CodeMirror 6 for the script and JSON editors, Material Symbols for icons. Tested with Vitest under jsdom.

Developed on macOS. Release builds for all three platforms come from CI ([`.github/workflows/release.yml`](.github/workflows/release.yml)); the Windows and Linux ones have had little testing.

## Repo layout

Three layers, with a hard rule: nothing under `core/` may import Wails, `store/`, or `share/`. The dependency direction is `share/` → `store/` → `core/`, so the engine can back a headless runner later.

| Path | Contents |
| --- | --- |
| [`core/`](core/) | UI-independent engine: graph model and validation, `binding/` (refs, templates, path resolution), `httpcall/` (requests, credential injection, redaction), `exec/` (DAG executor, loops), `transform/` (goja sandbox), `schema/infer/` (schema from a sample response) |
| [`store/`](store/) | On-disk persistence: projects, boards, collections, environments, credential metadata, and the keychain / encrypted-file secret stores |
| [`share/`](share/) | The `.cascade.json` envelope — board and selection export, parse, import |
| [`seed/`](seed/) | `default.json`, embedded and used to seed the first project |
| `*.go` (root) | The Wails shell: `main.go`, `app.go` and friends — the methods bound to the frontend |
| [`frontend/`](frontend/) | Svelte app. `src/lib/` holds unit-tested pure helpers, `src/lib/components/` the UI (`inspector/`, `sidebar/`, `library/`, `schema/`, `ui/` primitives), `wailsjs/` the generated Go bindings (committed) |
| [`docs/`](docs/) | [`format.md`](docs/format.md), the `.cascade.json` board file format for tools that read or write boards |
| [`web/`](web/) | The marketing and documentation site, deployed to GitHub Pages; shares no code with the app |

Several files are hand-mirrored across the Go/TypeScript boundary and drift silently if you change one side only: `frontend/src/lib/model.ts` mirrors the Go types, `refs.ts` reimplements `core/binding`'s resolution semantics, `credentials.ts` mirrors `core/httpcall` and store validation, `inMemoryApi.ts` mirrors the whole store, and `mock.ts` mirrors `seed/default.json` apart from its request target, which the two disagree on deliberately — the in-memory runner fabricates responses, so mock.ts can keep pointing at a fictional host.

## Development

Prerequisites: Go ≥ 1.25 (with the default `GOTOOLCHAIN=auto` it fetches the pinned 1.26 toolchain on first use), Bun, and the Wails v2 CLI matching the library version `go.mod` pins:

```sh
go install github.com/wailsapp/wails/v2/cmd/wails@$(go list -m -f '{{.Version}}' github.com/wailsapp/wails/v2)
```

Wails also needs a platform toolchain — Xcode Command Line Tools on macOS, WebView2 on Windows, gcc with libgtk-3 and libwebkit2gtk headers on Linux; `wails doctor` checks all of it. Bun is not optional: `wails.json` hardcodes `bun install` / `bun run build` / `bun run dev` as the frontend hooks.

```sh
wails dev      # run the app with hot reload (Go + frontend)
wails build    # production build in build/bin (gitignored)
```

On Linux distributions that ship WebKitGTK 4.1 rather than 4.0, such as Ubuntu 24.04, add `-tags webkit2_41` to both.

On macOS, `scripts/build-dmg.sh` builds the universal app and packs it into `build/bin/Cascade-macOS-universal.dmg` with an ad-hoc signature. Releases run the same script with a Developer ID identity and an App Store Connect API key, which sign and notarize the image; the top of the script lists the variables that do the same locally.

`main.go` embeds `frontend/dist`, which is gitignored, so on a fresh clone plain `go build ./...` and `go test ./...` fail with `pattern all:frontend/dist: no matching files found` until the frontend has been built once:

```sh
cd frontend && bun install && bun run build
```

`wails dev` and `wails build` do this for you.

The frontend also runs standalone in a browser — `src/lib/api.ts` uses the Wails bindings when `window.go` exists and an in-memory store (`src/lib/inMemoryApi.ts`, seeded from `src/lib/mock.ts`) otherwise:

```sh
cd frontend
bun install
bun run dev    # browser-only, no Go
```

Three behaviours differ silently in that mode: board runs are simulated by `src/lib/inMemoryRun.ts` with fabricated responses, test requests return a canned response instead of real HTTP, and transform scripts run through `new Function` in the page rather than the goja sandbox.

Regenerating the bindings in `frontend/wailsjs/` uses `wails generate module` — note that it compiles and briefly runs `main()`, which touches the real app data directory.

## Tests and checks

```sh
go test ./...                          # engine, store, share, shell
go test ./core -run TestName           # a single Go test

cd frontend
bun run test                           # Vitest, run once
bun run test src/lib/graph.test.ts     # a single test file
bun run test:watch
bun run check                          # svelte-check (the only type check)
```

There is no Makefile and no linter config beyond `gofmt`. [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the checks on every pull request and push to `main`: `gofmt`, `go vet` and `go test -race` for the Go code, `bun run check` and `bun run test` for the app frontend, the same plus a production build for the website, and actionlint over the workflow files. Everything runs on Linux; the macOS and Windows builds are only compiled, by the release workflow.

## Where data lives

Everything sits under `os.UserConfigDir()/cascade` — `~/Library/Application Support/cascade` on macOS, `~/.config/cascade` on Linux, `%AppData%\cascade` on Windows. There is no override for this path.

```
projects.json                             index of projects
projects/<id>/project.json                project metadata + defaults
              environments.json
              credentials.json            credential metadata only
              sources/ boards/ collections/    one <id>.json per item
```

Secret values never enter those files. They go to the OS keychain under service `cascade`, account `<projectID>/<credentialName>`. Where no keychain is available Cascade falls back to an encrypted `secrets.enc` in the same directory — but its key file sits right next to it, so treat that fallback as obfuscation against a casual read, not as protection from anyone who can read the data directory. Exports carry credential names and kinds only.

Deleting that directory (plus the keychain entries) resets the app; the next launch re-seeds the Default project.

## Website

[`web/`](web/) holds the website, published to <https://nft.github.io/cascade/>: the home page with a runnable replica of the canvas, features, downloads, the changelog and the user docs. It is a SvelteKit app prerendered to static HTML, independent of the app and sharing no code with it. [web/README.md](web/README.md) covers it.

```sh
cd web
bun install
bun run dev    # site only, no Go
```

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) type-checks, tests, builds and deploys it on pushes to `main` that touch `web/**` or `CHANGELOG.md`, and again after each release so the download buttons point at the new files.

## Releasing

1. Move the `[Unreleased]` entries in [CHANGELOG.md](CHANGELOG.md) under a new `## [x.y.z] - YYYY-MM-DD` heading.
2. Set `info.productVersion` in [`wails.json`](wails.json) to the same version.
3. Raise the `toolchain` line in `go.mod` to the newest Go 1.26 patch listed on <https://go.dev/dl/>, so the builds carry its security fixes: `go mod edit -toolchain=go1.26.N`.
4. Commit, then push a matching tag: `git tag vx.y.z && git push origin vx.y.z`.

[`.github/workflows/release.yml`](.github/workflows/release.yml) refuses a tag that disagrees with `wails.json` or has no changelog section, and builds nothing until CI passes on the tagged commit. Then it builds all three platforms, publishes the release with checksums and the changelog section as notes, and rebuilds the website.

The macOS build is signed and notarized, so a release also fails without these repository secrets: `MACOS_CERTIFICATE`, a Developer ID Application certificate with its private key as a base64-encoded `.p12`; `MACOS_CERTIFICATE_PASSWORD`, that file's password; and an App Store Connect API key with the Developer role, split into `NOTARY_KEY` (the `.p8` file, base64-encoded), `NOTARY_KEY_ID` and `NOTARY_ISSUER_ID`.

## License

[MIT](LICENSE). The engine, the app and the `.cascade.json` format are all covered by it.
