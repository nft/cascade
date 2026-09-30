# The Cascade envelope format (`.cascade.json`)

The single share format for Cascade boards: whole-board file exports and
clipboard-copied selections use the same self-identifying JSON envelope and
the same import pipeline. This document specifies version **1** of that
envelope for anyone generating or consuming it outside the app — recipe
repositories, code generators, CI tooling.

Authoritative source: [`share/`](../share/) (exporter, parser, importer) and
[`frontend/src/lib/model.ts`](../frontend/src/lib/model.ts) (node data
shapes). When this document and the code disagree, the code wins — then this
document has a bug.

## Envelope

```jsonc
{
  "cascade": {
    "kind": "board",              // "board" | "selection"
    "formatVersion": 1,
    "app": "cascade/0.1",         // producer, informational only — never gated on
    "board": { /* see Board */ },
    "requires": { /* see Requires */ },
    "collections": [ /* optional, see Collections */ ]
  }
}
```

The root key `cascade` is what makes payloads self-identifying: paste probes
the clipboard, and text that does not parse as JSON with a `cascade` root is
silently ignored, never an error. Everything that *is* an envelope gets loud
failures instead:

- `formatVersion` greater than the reader's supported version → rejected with
  "made with a newer Cascade — update to import it". Producers must write the
  version whose rules they follow; consumers must refuse newer versions
  rather than guess.
- Unknown `kind` → rejected.
- A `cascade` root that is not a valid payload object → rejected as malformed.

`kind` selects the import behavior, not the format: a `board` carries its
identity (`board.id`, `board.name`) and is meant for file import (always
materialized as a **new** board — imports never merge); a `selection` has no
identity (`id` and `name` are empty strings) and is meant for clipboard paste
onto an existing canvas.

## Canonical serialization

Exports are written in one canonical form so they diff cleanly in git:

- two-space indent, LF line endings, one trailing newline;
- envelope, board, node and edge keys in the order shown by this document
  (Go struct order); map-like objects — `layout.positions`, `layout.sizes`
  and each node's `data` with everything inside it — with keys sorted
  lexicographically;
- `requires` lists sorted by name; embedded collection requests sorted by id.

Parse → marshal is byte-stable: the wire form is the canonical form.
Consumers must accept any valid JSON encoding of the same structure;
producers that want reviewable diffs should emit the canonical form.

## Board

The `board` value is Cascade's on-disk board format (graph `formatVersion: 1`
plus a canvas-only `layout` key the engine ignores):

```jsonc
{
  "formatVersion": 1,
  "id": "brd-8fk2…",             // "" for selections
  "name": "Signup chain",        // "" for selections
  "nodes": [
    {
      "id": "n1",                // board-scoped; see "Identifiers" below
      "type": "http",            // "http" | "transform" | "for" | "mock" | "delay" | "note"
      "name": "Create User",
      // "parent": "n3",         // only on nodes inside a for container
      "data": { /* per-type, see below */ }
    }
  ],
  "edges": [
    { "id": "e1", "from": "n1", "to": "n2" }   // target depends on source; id optional
  ],
  "layout": {
    "positions": { "n1": { "x": 0, "y": 0 } }
    // "sizes": { "n3": { "width": 480, "height": 320 } }   // resized for containers only
  }
}
```

Rules:

- The graph must be a DAG — cycles are rejected. Edges mean "`to` depends on
  `from`" and carry the data path for `res` references.
- A selection envelope contains only the selected nodes and the edges *between*
  selected nodes.
- A node inside a `for` container names it in `parent`. The parent must be a
  `for` node, only `http`, `transform`, `mock` and `delay` nodes can be
  children, and no edge may cross a container's boundary. A selection keeps
  `parent` only when the container is selected too.
- `layout.positions` carries node coordinates so relative arrangement
  survives the trip, and `layout.sizes` the width and height of `for`
  containers that were resized. The exporter deliberately **never** writes
  `layout.viewport` (pan/zoom is the receiver's) or `layout.responses`
  (captured run data must not leave the machine); importers ignore both if
  present.
- Run state is sanitized on export: every node's `data.status` is `"idle"`
  and `data.note` is absent. Producers should do the same.

### Identifiers

- **Node ids** are board-scoped opaque strings. Stored references (bindings,
  templates) point at node **ids**, never keys, so renaming a key rewrites
  nothing. On *file import* node ids are preserved (a re-export diffs against
  the original only in board identity and mapped names); on *paste* they are
  freshly generated and every reference is rewritten accordingly.
- **Node keys** (`data.key`) are the human-readable, board-unique slugs the
  UI renders references with (`createUser`). Grammar:
  `[A-Za-z_][A-Za-z0-9_]*`, excluding the reserved roots `res`, `i` and
  `item`. On paste, colliding keys are re-slugged (`createUser` →
  `createUser2`) — possible without rewrites precisely because references
  store ids.

### Node data — `http`

```jsonc
{
  "name": "Create User",
  "key": "createUser",
  "method": "POST",              // GET | POST | PUT | PATCH | DELETE | HEAD | OPTIONS
  "path": "/v1/users",           // resolved against the environment's base URL
  "origin": "https://api.x.io",  // optional absolute origin overriding the environment
  "environment": "staging",      // environment NAME; "" = none (needs origin)
  "credential": "staging-admin", // credential NAME; "" = unauthenticated
  "status": "idle",
  "fields": [ /* see Fields */ ],
  "rawBody": { "contentType": "text/xml", "text": "…" },  // optional; overrides body.* fields
  "exports": [ { "key": "userId", "path": "body.id" } ],  // optional named output aliases
  "requestRef": { "collectionId": "col1", "requestId": "req1" },  // optional provenance
  "responseSchema": { /* JSON-schema-ish, optional */ }
}
```

`environment` and `credential` are **names**, resolved in the receiving
project — that is what `requires` and the import mapping step are for.

### Node data — `transform`

```jsonc
{
  "name": "Pick ids",
  "key": "pickIds",
  "status": "idle",
  "mode": "pick",                // "pick" | "script"
  "pick": [ /* field rows; `key` is a dot path in the output body */ ],
  "script": ""                   // mode "script": JS body, must `return` a JSON value
}
```

### Node data — `for`

```jsonc
{
  "name": "Each Item",
  "key": "eachItem",
  "status": "idle",
  "mode": "each",                // "count" | "each"
  "count": 3,                    // mode "count": iterations, 1–10000
  "source": { "nodeId": "n1", "path": "body.items" }   // mode "each": must resolve to an array
}
```

A `for` node runs its children — the nodes whose `parent` is its id — once
per iteration: `count` times, or once per element of the array `source`
resolves to. Inside the loop `{{i}}` is the iteration index and, in each
mode, `{{item}}` the current element. When a selection export cuts `source`
off from its upstream, `source.nodeId` becomes that upstream's key, which
cannot resolve as an id, so the loop fails by name instead of iterating an
unrelated node.

### Node data — `mock`

```jsonc
{
  "name": "Fake user",
  "key": "fakeUser",
  "status": "idle",
  "statusCode": 200,
  "body": "{\"id\": 42}"         // JSON text, parsed when the node runs
}
```

A mock answers with `statusCode` and the parsed `body` without calling
anything, so downstream nodes bind to fixture data like any response.

### Node data — `delay`

```jsonc
{
  "name": "Wait",
  "key": "wait",
  "status": "idle",
  "durationMs": 1000             // 1–300000
}
```

A delay waits `durationMs`, then hands its single upstream's output on
unchanged.

### Node data — `note`

```jsonc
{ "text": "free-form annotation" }
```

Notes never run and have no key, fields, or edges into the graph semantics.

## Fields

Field rows (`data.fields` on http nodes, `data.pick` on transforms) all share
one shape:

```jsonc
{
  "key": "body.userId",          // where the value lands (body./path./query./header. prefix)
  "source": "binding",           // "literal" | "binding" | "template"
  "value": "n1.body.id",         // see below
  "ref": { "nodeId": "n1", "path": "body.id" },   // bindings only
  "dangling": { "originalKey": "createUser", "path": "body.id" }  // selection exports only
}
```

- **literal** — `value` is the text, sent as-is.
- **binding** — `ref` is the canonical reference: `ref.nodeId` is the
  upstream node **id** (`""` means the `res` sugar: "my single direct
  upstream via the edge"), `ref.path` is an accessor path (`body.id`,
  `status`, `headers.Location`, or a named export key; empty = whole body).
  `value` mirrors it textually (`<nodeId>.<path>` or `res.<path>`) and is
  redundant — consumers should trust `ref`.
- **template** — `value` is text with `{{…}}` interpolations whose reference
  heads are node **ids**, `res`, `i` (the loop iteration index) or `item`
  (the current element of an each-mode loop).

### Dangling markers

When a selection is exported, references that reach *outside* the selection
cannot travel. The exporter unbinds them and leaves a `dangling` marker
naming the upstream by **key** (ids are meaningless to the receiver):

- a binding row becomes `source: "literal"`, `value: ""`, no `ref`, plus
  `dangling: {originalKey, path}` — the importing UI shows "was bound to
  createUser.body.id" and the user re-binds;
- a template's external `{{<id>.path}}` tokens are rewritten to
  `{{<key>.path}}` — human-readable and unresolvable on the target board, so
  they surface as invalid instead of silently binding to a stranger.

Importers must carry `dangling` markers through untouched.

## Requires

What the board expects to exist in the receiving project — **names and
mapping hints only, never values**:

```jsonc
{
  "environments": ["local", "staging"],
  "credentials": [
    { "name": "staging-admin", "kind": "bearer" }   // kind is a hint; may be absent
  ],
  "sources": []
}
```

- The exporter derives these from the nodes' `environment`/`credential`
  references. A credential's `kind` (`bearer` | `basic` | `header` | `query`)
  travels only when the exporting project still knows the name.
- **Secrets are structurally excluded**: the exporter has no code path into
  the secret store, and this block carries name + kind, nothing else. A
  conforming producer must never place secret material anywhere in an
  envelope.
- `sources` is reserved for schema-source references (empty until nodes carry
  them); it is present so source-linked nodes will not need a format break.

On import, requires are auto-matched by exact name. Anything unmatched goes
through the mapping wizard — create a placeholder with the required name,
map to an existing entry (which rewrites the imported nodes), or leave
unmapped. Unmapped references degrade to warnings on the affected nodes;
they **never** fail the import.

## Collections

When exported nodes carry a `requestRef` provenance link, the referenced
request definitions are embedded, trimmed to just those requests and
flattened into a synthetic root folder (folder placement does not survive the
trip; the link is by request id):

```jsonc
"collections": [
  {
    "id": "col1",
    "name": "Demo API",
    "root": {
      "id": "root",
      "name": "",
      "requests": [
        { "id": "req1", "name": "Create user", "protocol": "http", "method": "POST", "url": "/v1/users" }
      ]
    }
  }
]
```

Import merges by id: an unknown collection is created as embedded; a known
collection gains only the requests it is missing (a request id already
present anywhere in its tree is reused, not duplicated). Nodes run standalone
regardless — `requestRef` is provenance, not a dependency — so a failed or
skipped merge degrades gracefully.

## Minimal valid envelope

The smallest useful thing a generator can emit — one node, pasteable:

```json
{
  "cascade": {
    "kind": "selection",
    "formatVersion": 1,
    "app": "my-generator/1.0",
    "board": {
      "formatVersion": 1,
      "id": "",
      "name": "",
      "nodes": [
        {
          "id": "n1",
          "type": "http",
          "name": "List users",
          "data": {
            "name": "List users",
            "key": "listUsers",
            "method": "GET",
            "path": "/v1/users",
            "environment": "staging",
            "credential": "",
            "status": "idle",
            "fields": []
          }
        }
      ],
      "edges": [],
      "layout": { "positions": { "n1": { "x": 0, "y": 0 } } }
    },
    "requires": {
      "environments": ["staging"],
      "credentials": [],
      "sources": []
    }
  }
}
```

## Versioning policy

`formatVersion` bumps only on breaking changes; additive fields (new optional
node data keys, new requires entries) do not bump it. Consumers should ignore
unknown fields, and reject only versions newer than they support.
