# Changelog

All notable changes to Cascade are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). The website renders this file as its
patch notes, and the release workflow copies each version's section into the
GitHub release, so write entries for people using the app.

## [Unreleased]

### Added

- In-app updates. Cascade checks GitHub for a newer release at launch, shows its notes in the top bar, and can download, verify and install it; Settings › About has the manual check and the switch.
- A sidebar rail with a resizable, collapsible panel (Cmd/Ctrl+B).
- A Settings dialog (Cmd/Ctrl+,): dark, light or system theme, interface scale, canvas grid, minimap, delete confirmation, the response-capture switch, and a shortcuts reference.
- A pan tool (H) beside the selection tool (V). The arrow drags a selection box; Alt/Option or Space pans while held, and the middle mouse button always does.

## [0.1.0] - 2026-09-29

The first public preview: a desktop canvas for wiring real API calls into a
graph that seeds an environment with connected data.

### Added

- Canvas editor with six node kinds: HTTP request, transform, For loop, mock, delay and note. Connections carry data, each node runs after everything it depends on, and edge labels show what each node hands downstream.
- Bindings between nodes. Fill a field with `{{createUser.body.id}}`, use `res.<path>` for a node's single upstream, `{{i}}` and `{{item}}` inside loops, and `[*]` to collect a field from every element of an array. The picker lists what each upstream returns, inferred from captured responses.
- For loops that repeat their child nodes up to 10,000 times, or once per element of an upstream array, with live progress on the container.
- Transform nodes that reshape data with pick rows or JavaScript, run in an embedded sandbox with no network, file system or timers.
- Mock nodes that emit fixture JSON, and delay nodes that pause the run for up to five minutes.
- Real runs from the Go engine. Run the whole board or one node and everything after it, watch node states change live, and press Stop to cancel requests in flight.
- Logs panel listing every call newest first, with a free-text and status filter and the full request and response. Hovering an entry highlights its node on the canvas.
- Environments with a project default and per-node overrides, and credentials of four kinds: bearer token, basic auth, custom header and query parameter.
- Projects, each with its own environments, credentials and collections of reusable requests, and a Test tab that sends a single request.
- Board sharing through the versioned `.cascade.json` format: export or import a board as a file, copy and paste nodes between projects, and map credentials and environments on the way in.

### Security

- Credential values live in the OS keychain, or an encrypted file where no keychain exists. They never enter project or export files and are redacted from logs, test responses and transport errors.
- Board files keep each node's last response for binding suggestions. A project can leave them out, for boards that talk to sensitive APIs; the inferred schemas are saved either way.
- The macOS build is signed with a Developer ID and notarized by Apple, and the disk image carries its notarization ticket.

### Known limitations

- OpenAPI import is not built yet. The Import schema button is a placeholder and the operation palette comes from a demo catalog.
- Nodes run one at a time in dependency order; independent branches do not run in parallel yet, so a delay holds up every node after it.
- The canvas does not stop you drawing a cycle. A board with one stops saving and cannot run until you cut one of its connections.
- Each project shows a single board, with no way yet to add, rename or switch boards. Importing a board adds a second one, and once the project is reopened only one of the two can be reached.
- There is no undo; board edits save automatically as you make them.
- The Windows build is not code-signed, so SmartScreen warns on first launch.
- The Windows and Linux builds come from CI and have had little testing.

[Unreleased]: https://github.com/nft/cascade/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nft/cascade/releases/tag/v0.1.0
