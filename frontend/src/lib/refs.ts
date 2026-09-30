// Node keys and output references. Stored bindings/templates use
// node **IDs** inside refs; the UI renders node **keys** and parses keys back
// to IDs on edit, so renaming a key rewrites nothing stored. `res` (single
// direct upstream) and `i` (fan-out index) are reserved reference roots and
// pass through both directions untouched.
//
// Resolution semantics mirror core/binding on the Go side: accessor paths
// give the explicit prefixes `status` / `headers` / `body` precedence, then
// named exports, then body keys (`res.name` ≡ upstream `body.name`).
import { readableAncestors } from './ancestry'
import type { AppNode, CapturedResponse, FieldRef, NodeExport, NodeField } from './model'

export const REF_RES = 'res'
export const REF_INDEX = 'i'
/** Each-mode loop element ({{item}} / {{item.path}}). */
export const REF_ITEM = 'item'
export const RESERVED_REF_ROOTS: ReadonlySet<string> = new Set([REF_RES, REF_INDEX, REF_ITEM])

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const TEMPLATE_RE = /\{\{\s*([^{}]*?)\s*\}\}/g
const TEMPLATE_OPEN = '{{'
const TEMPLATE_CLOSE = '}}'
/** A whole-field reference: `res`, `res.body.id`, `createUser.orgs[*].id`, `create-user.status`. */
const WHOLE_REF_RE = /^([A-Za-z_][A-Za-z0-9_-]*)((?:\.[^\s.[\]{}]+|\[\d+\]|\[\*\])*)$/

/** Accessor prefixes that always win over body keys and export names. */
const PREFIX_STATUS = 'status'
const PREFIX_HEADERS = 'headers'
const PREFIX_HEADER = 'header'
const PREFIX_BODY = 'body'

const HINT_KEY_CAP = 8

/** Body-access hint for a response whose body exceeded the capture cap. */
const HINT_TRUNCATED = 'the response was too large to capture'

// --- node keys -------------------------------------------------------------

/** `Create User` → `createUser`; strips anything non-alphanumeric. */
export function slugifyKey(name: string): string {
  const words = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    // A leading digit would make an invalid identifier ("2 users" → "users").
    .map((w, idx) => (idx === 0 ? w.replace(/^[0-9]+/, '') : w))
    .filter(Boolean)
  const [first, ...rest] = words
  if (!first) return 'node'
  const slug =
    first[0].toLowerCase() +
    first.slice(1) +
    rest.map((w) => w[0].toUpperCase() + w.slice(1)).join('')
  return isValidKey(slug) ? slug : 'node'
}

/** Board-unique key: `createUser`, then `createUser2`, `createUser3`, … */
export function uniqueKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base) && !RESERVED_REF_ROOTS.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}${n}`
    if (!taken.has(candidate)) return candidate
  }
}

export function isValidKey(key: string): boolean {
  return KEY_RE.test(key) && !RESERVED_REF_ROOTS.has(key)
}

function nodeKey(node: AppNode): string | null {
  return 'key' in node.data && typeof node.data.key === 'string' ? node.data.key : null
}

export function keyByNodeId(nodes: readonly AppNode[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const n of nodes) {
    const key = nodeKey(n)
    if (key) map.set(n.id, key)
  }
  return map
}

export function nodeIdByKey(nodes: readonly AppNode[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const n of nodes) {
    const key = nodeKey(n)
    if (key) map.set(key, n.id)
  }
  return map
}

/** Keys already used on the board, optionally ignoring one node (for rename checks). */
export function takenKeys(nodes: readonly AppNode[], exceptNodeId?: string): Set<string> {
  const keys = new Set<string>()
  for (const n of nodes) {
    if (n.id === exceptNodeId) continue
    const key = nodeKey(n)
    if (key) keys.add(key)
  }
  return keys
}

// --- reference strings -----------------------------------------------------

/** Joins an owner and accessor path: an index path takes no dot (`n1[0].id`), mirroring core/binding RefExpr. */
export function joinRefExpr(owner: string, path: string): string {
  if (!path) return owner
  return path.startsWith('[') ? `${owner}${path}` : `${owner}.${path}`
}

/** Splits a reference expression into its owner (up to the first `.` or `[`) and path. */
function splitOwner(expr: string): { owner: string; path: string } {
  const dot = expr.indexOf('.')
  const bracket = expr.indexOf('[')
  const cut = dot < 0 ? bracket : bracket < 0 ? dot : Math.min(dot, bracket)
  if (cut < 0) return { owner: expr, path: '' }
  return { owner: expr.slice(0, cut), path: expr[cut] === '.' ? expr.slice(cut + 1) : expr.slice(cut) }
}

/** Maps one `{{…}}` expression's owner through `map`; res/i pass through. */
function mapExprOwner(expr: string, map: ReadonlyMap<string, string>): string {
  if (RESERVED_REF_ROOTS.has(expr)) return expr
  const { owner, path } = splitOwner(expr)
  if (RESERVED_REF_ROOTS.has(owner)) return expr
  const mapped = map.get(owner)
  if (!mapped) return expr
  return joinRefExpr(mapped, path)
}

/**
 * Maps every token's owner through `map`, splicing only the expression so
 * the rest — spacing inside the braces included — stays as written. Editors
 * commit on every keystroke, so display → stored → display has to be exact:
 * a value that comes back different replaces what the user is typing.
 */
export function mapTemplateOwners(text: string, map: ReadonlyMap<string, string>): string {
  return text.replace(TEMPLATE_RE, (token: string, expr: string) => {
    const mapped = mapExprOwner(expr, map)
    return mapped === expr ? token : token.replace(expr, () => mapped)
  })
}

/** Stored template (`{{<nodeId>.path}}`) → display (`{{<key>.path}}`). */
export function renderTemplate(stored: string, keys: ReadonlyMap<string, string>): string {
  return mapTemplateOwners(stored, keys)
}

/** Display template (`{{<key>.path}}`) → stored (`{{<nodeId>.path}}`). Unknown keys pass through. */
export function parseTemplate(display: string, ids: ReadonlyMap<string, string>): string {
  return mapTemplateOwners(display, ids)
}

/** Canonical stored form of a ref: `res.name`, `create-user.body.id`. */
export function refToStored(ref: FieldRef): string {
  return joinRefExpr(ref.nodeId === '' ? REF_RES : ref.nodeId, ref.path)
}

/** Display form of a ref: the owner rendered as its node key. */
export function refToDisplay(ref: FieldRef, keys: ReadonlyMap<string, string>): string {
  if (ref.nodeId === '') return refToStored(ref)
  return joinRefExpr(keys.get(ref.nodeId) ?? ref.nodeId, ref.path)
}

/** Parses a stored expression (owner = node ID or res) into a FieldRef; null for the scope refs `i` and `item`. */
function exprToRef(expr: string): FieldRef | null {
  if (expr === REF_INDEX) return null
  if (expr === REF_RES) return { nodeId: '', path: '' }
  const { owner, path } = splitOwner(expr)
  if (owner === REF_ITEM) return null
  if (owner === REF_RES) return { nodeId: '', path }
  return { nodeId: owner, path }
}

/** All node references a field makes (stored form). */
export function fieldRefs(field: NodeField): FieldRef[] {
  if (field.source === 'binding') return field.ref ? [field.ref] : []
  if (field.source !== 'template') return []
  const refs: FieldRef[] = []
  for (const match of field.value.matchAll(TEMPLATE_RE)) {
    const ref = exprToRef(match[1])
    if (ref) refs.push(ref)
  }
  return refs
}

// --- field edit round-trip ---------------------------------------------------

/** The text shown in the field editor for a stored field. */
export function fieldDisplayValue(field: NodeField, keys: ReadonlyMap<string, string>): string {
  switch (field.source) {
    case 'literal':
      return field.value
    case 'template':
      return renderTemplate(field.value, keys)
    case 'binding':
      return field.ref ? refToDisplay(field.ref, keys) : field.value
  }
}

/**
 * Parses editor input into the stored field shape. Whole-value references
 * (`res.name`, `createUser.body.id` — owner must be `res` or a known key/ID)
 * become bindings; anything containing `{{…}}` becomes a template with owners
 * mapped to node IDs; the rest is a literal.
 */
export function parseFieldInput(
  key: string,
  input: string,
  ids: ReadonlyMap<string, string>,
  knownNodeIds: ReadonlySet<string>,
): NodeField {
  if (input.includes('{{')) {
    const stored = parseTemplate(input, ids)
    // A field that is exactly one {{node ref}} is the structured-binding
    // case — normalize it so it renders as a chip, not a template.
    const whole = /^\{\{\s*([^{}]*?)\s*\}\}$/.exec(stored)
    if (whole) {
      const ref = exprToRef(whole[1])
      if (ref && (ref.nodeId === '' || knownNodeIds.has(ref.nodeId))) {
        return { key, source: 'binding', value: refToStored(ref), ref }
      }
    }
    return { key, source: 'template', value: stored }
  }
  const match = WHOLE_REF_RE.exec(input)
  if (match) {
    const { owner, path } = splitOwner(input)
    if (owner === REF_RES) {
      const ref: FieldRef = { nodeId: '', path }
      return { key, source: 'binding', value: refToStored(ref), ref }
    }
    if (owner !== REF_INDEX && path !== '') {
      const nodeId = ids.get(owner) ?? (knownNodeIds.has(owner) ? owner : null)
      if (nodeId) {
        const ref: FieldRef = { nodeId, path }
        return { key, source: 'binding', value: refToStored(ref), ref }
      }
    }
  }
  return { key, source: 'literal', value: input }
}

// --- edit-time validation ----------------------------------------------------

/**
 * Mirrors core/binding parseTemplate's scanner. TEMPLATE_RE silently treats an
 * unterminated `{{` as literal text while Go errors on it, so without this
 * check the field reads as fine in the editor and fails the node at run time
 * — the one divergence between the two template parsers, caught at edit time
 * because that is where the user can still fix it.
 */
function templateSyntaxError(template: string): string | null {
  let rest = template
  for (;;) {
    const open = rest.indexOf(TEMPLATE_OPEN)
    if (open < 0) return null
    rest = rest.slice(open + TEMPLATE_OPEN.length)
    const close = rest.indexOf(TEMPLATE_CLOSE)
    if (close < 0) return `unterminated "${TEMPLATE_OPEN}" — close the reference with "${TEMPLATE_CLOSE}"`
    if (rest.slice(0, close).trim() === '')
      return `empty reference "${TEMPLATE_OPEN}${TEMPLATE_CLOSE}" — name a node output`
    rest = rest.slice(close + TEMPLATE_CLOSE.length)
  }
}

/** Direct upstream node ids (sources of edges into `nodeId`). */
export function directUpstreams(edges: readonly { source: string; target: string }[], nodeId: string): string[] {
  const seen = new Set<string>()
  for (const e of edges) {
    if (e.target === nodeId) seen.add(e.source)
  }
  return [...seen]
}

/**
 * A selection export unbinds a field whose upstream it left behind and
 * records what it was bound to (share/export.go). The engine refuses to run
 * it in these words (nodespec danglingFormat, pinned by refs.guard.test.ts).
 */
export function danglingFieldMessage(dangling: NonNullable<NodeField['dangling']>): string {
  return `lost its binding to ${joinRefExpr(dangling.originalKey, dangling.path)} — re-bind it`
}

/**
 * Edit-time referential check for one field (mirrors core/binding
 * ValidateSource): bare `res` needs exactly one direct upstream; qualified
 * refs must point at a node this one may read — an ancestor, or for a loop
 * child an ancestor of its For. Returns a user-facing error message, or null
 * when the field is fine.
 */
export function validateFieldRefs(
  field: NodeField,
  nodeId: string,
  nodes: readonly AppNode[],
  edges: readonly { source: string; target: string }[],
): string | null {
  if (field.dangling) return danglingFieldMessage(field.dangling)
  if (field.source === 'template') {
    const syntax = templateSyntaxError(field.value)
    if (syntax) return syntax
  }
  const refs = fieldRefs(field)
  if (refs.length === 0) return null
  const upstreams = directUpstreams(edges, nodeId)
  const ancestors = readableAncestors(nodes, edges, nodeId)
  const keys = keyByNodeId(nodes)
  for (const ref of refs) {
    if (ref.nodeId === '') {
      if (upstreams.length === 0) return 'res needs an upstream node — connect one first'
      if (upstreams.length > 1)
        return `res is ambiguous with ${upstreams.length} upstream nodes — use {{nodeKey.path}}`
      continue
    }
    if (!nodes.some((n) => n.id === ref.nodeId)) return `unknown node reference "${ref.nodeId}"`
    if (!ancestors.has(ref.nodeId))
      return `"${keys.get(ref.nodeId) ?? ref.nodeId}" is not an upstream ancestor of this node`
  }
  return null
}

// --- resolution (mirrors core/binding, used by the run simulation) -----------

export interface ResolveContext {
  /** Captured responses by node id. */
  outputs: Readonly<Record<string, CapturedResponse | undefined>>
  /** Declared exports by node id. */
  exports: Readonly<Record<string, NodeExport[] | undefined>>
  /** Direct upstream node ids of the resolving node (for res). */
  upstreams: readonly string[]
  /** Fan-out iteration index ({{i}}). */
  index: number
  /** Each-mode loop element ({{item}}); hasItem gates it so a stray {{item}} elsewhere fails with a named error. */
  item?: unknown
  hasItem?: boolean
}

export class ResolveError extends Error {}

export function resolveField(field: NodeField, ctx: ResolveContext): unknown {
  if (field.dangling) throw new ResolveError(`field ${field.key}: ${danglingFieldMessage(field.dangling)}`)
  switch (field.source) {
    case 'literal':
      return field.value
    case 'binding': {
      if (!field.ref) throw new ResolveError(`field ${field.key}: binding has no reference`)
      return resolveRef(field.ref, ctx)
    }
    case 'template':
      return resolveTemplate(field.value, ctx)
  }
}

function resolveRef(ref: FieldRef, ctx: ResolveContext): unknown {
  let nodeId = ref.nodeId
  if (nodeId === '') {
    if (ctx.upstreams.length !== 1)
      throw new ResolveError(`res is ambiguous with ${ctx.upstreams.length} upstream nodes`)
    nodeId = ctx.upstreams[0]
  }
  const out = ctx.outputs[nodeId]
  if (!out) throw new ResolveError(`node "${nodeId}" has not produced an output`)
  return resolveOutputPath(nodeId, out, ctx.exports[nodeId] ?? [], ref.path)
}

function resolveTemplate(stored: string, ctx: ResolveContext): unknown {
  type Part = { text: string } | { expr: string }
  const parts: Part[] = []
  let last = 0
  TEMPLATE_RE.lastIndex = 0
  for (const match of stored.matchAll(TEMPLATE_RE)) {
    if (match.index! > last) parts.push({ text: stored.slice(last, match.index) })
    if (match[1] === '') throw new ResolveError('empty {{}} reference')
    parts.push({ expr: match[1] })
    last = match.index! + match[0].length
  }
  if (last < stored.length) parts.push({ text: stored.slice(last) })
  // A field whose entire value is a single {{…}} keeps the referenced JSON type.
  if (parts.length === 1 && 'expr' in parts[0]) return resolveExpr(parts[0].expr, ctx)
  return parts
    .map((p) => ('text' in p ? p.text : stringify(resolveExpr(p.expr, ctx))))
    .join('')
}

function resolveExpr(expr: string, ctx: ResolveContext): unknown {
  if (expr === REF_INDEX) return ctx.index
  const { owner, path } = splitOwner(expr)
  if (owner === REF_ITEM) {
    if (!ctx.hasItem)
      throw new ResolveError('{{item}} is only available inside an each-mode for loop')
    return path === '' ? ctx.item : resolveValuePath(REF_ITEM, ctx.item, expr, path)
  }
  const ref = exprToRef(expr)
  if (!ref) throw new ResolveError(`unknown reference "${expr}"`)
  return resolveRef(ref, ctx)
}

/**
 * Renders a resolved value as the bytes that go on the wire — a query value,
 * a header value, a raw body, or one interpolated chunk of a template. This
 * is a specified format that must match Go's
 * `binding.Stringify` byte for byte; `core/testdata/binding_vectors.json`
 * pins both sides. `String(v)` on a number already *is* ECMA-262
 * `Number::toString`, which is the rule Go now implements.
 */
export function stringify(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v, sortedKeys)
}

/**
 * JSON.stringify replacer that emits object keys in sorted order — without it
 * JS emits insertion order while Go's json encoder sorts map keys. The default
 * string sort is UTF-16 code-unit order, which agrees with Go's byte-wise sort
 * for every key in the Basic Multilingual Plane.
 */
function sortedKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const source = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(source).sort()) sorted[key] = source[key]
  return sorted
}

function resolveOutputPath(
  nodeId: string,
  out: CapturedResponse,
  exports: readonly NodeExport[],
  path: string,
  allowExports = true,
): unknown {
  let p = path
  // The original canonical paths carry a `response.` root; accessor paths omit it.
  if (p === 'response') p = ''
  else if (p.startsWith('response.')) p = p.slice('response.'.length)
  if (p === '') return bodyOf(out, path)
  const { owner: first, path: rest } = splitOwner(p)
  switch (first) {
    case PREFIX_STATUS:
      if (rest !== '') throw new ResolveError(`"${path}": status has no sub-fields`)
      return out.status
    case PREFIX_HEADERS:
    case PREFIX_HEADER: {
      const headers = out.headers ?? {}
      if (rest === '') return headers
      const found = Object.keys(headers).find((k) => k.toLowerCase() === rest.toLowerCase())
      if (found === undefined)
        throw new ResolveError(`"${path}": ${hintFromKeys('headers are', Object.keys(headers))}`)
      return headers[found]
    }
    case PREFIX_BODY:
      return resolveValuePath(nodeId, bodyOf(out, path), path, rest)
    default: {
      if (allowExports) {
        const exp = exports.find((e) => e.key === first)
        if (exp) {
          // Exports cannot chain: an export's own path resolves without exports.
          const base = resolveOutputPath(nodeId, out, [], exp.path, false)
          return resolveValuePath(nodeId, base, path, rest)
        }
      }
      return resolveValuePath(nodeId, bodyOf(out, path), path, p)
    }
  }
}

/**
 * The captured body, or a named error when the capture was truncated —
 * otherwise the walker reports "value is a JSON null and has no sub-fields"
 * for a response that was merely too big.
 */
function bodyOf(out: CapturedResponse, path: string): unknown {
  // An empty path is the whole-output reference ({{res}}); quoting it would
  // read `"": the response was too large`, so name the problem directly.
  if (out.truncated) {
    throw new ResolveError(path === '' ? HINT_TRUNCATED : `"${path}": ${HINT_TRUNCATED}`)
  }
  return out.body
}

type PathSegment = { key: string } | { index: number } | { wildcard: true }

/** Bracket content of the [*] array-map extension. */
const WILDCARD_SEGMENT = '*'

function parsePathSegments(path: string): PathSegment[] {
  if (path === '') return []
  const segs: PathSegment[] = []
  let rest = path
  let expectKey = true
  while (rest !== '') {
    if (rest[0] === '.') {
      if (expectKey) throw new ResolveError(`empty segment in path "${path}"`)
      rest = rest.slice(1)
      expectKey = true
    } else if (rest[0] === '[') {
      const end = rest.indexOf(']')
      if (end < 0) throw new ResolveError(`unclosed "[" in path "${path}"`)
      if (rest.slice(1, end) === WILDCARD_SEGMENT) {
        segs.push({ wildcard: true })
        rest = rest.slice(end + 1)
        expectKey = false
        continue
      }
      const idx = Number(rest.slice(1, end))
      if (!Number.isInteger(idx) || idx < 0) throw new ResolveError(`invalid index in path "${path}"`)
      segs.push({ index: idx })
      rest = rest.slice(end + 1)
      expectKey = false
    } else {
      const cut = rest.search(/[.[]/)
      const end = cut < 0 ? rest.length : cut
      if (!expectKey) throw new ResolveError(`expected "." or "[" in path "${path}"`)
      segs.push({ key: rest.slice(0, end) })
      rest = rest.slice(end)
      expectKey = false
    }
  }
  if (expectKey) throw new ResolveError(`trailing "." in path "${path}"`)
  return segs
}

function resolveValuePath(nodeId: string, value: unknown, fullPath: string, rest: string): unknown {
  return resolveSegments(nodeId, value, fullPath, parsePathSegments(rest))
}

function resolveSegments(nodeId: string, value: unknown, fullPath: string, segs: PathSegment[]): unknown {
  let current = value
  for (let at = 0; at < segs.length; at++) {
    const seg = segs[at]
    if ('wildcard' in seg) {
      if (!Array.isArray(current))
        throw new ResolveError(`"${fullPath}": [*] needs an array, but the value is a JSON ${jsonTypeName(current)}`)
      // Map the rest of the path over every element; nested [*] recurses,
      // so "a[*].b[*].c" yields nested arrays (mirrors core/binding).
      const tail = segs.slice(at + 1)
      return current.map((elem) => resolveSegments(nodeId, elem, fullPath, tail))
    }
    if (Array.isArray(current)) {
      if (!('index' in seg))
        throw new ResolveError(`"${fullPath}": value is an array of ${current.length} elements; use [index]`)
      if (seg.index >= current.length)
        throw new ResolveError(`"${fullPath}": index ${seg.index} out of range (${current.length} elements)`)
      current = current[seg.index]
    } else if (current !== null && typeof current === 'object') {
      if (!('key' in seg))
        throw new ResolveError(`"${fullPath}": value is an object, not an array`)
      const obj = current as Record<string, unknown>
      if (!(seg.key in obj))
        throw new ResolveError(`"${fullPath}": ${hintFromKeys('available keys are', Object.keys(obj))}`)
      current = obj[seg.key]
    } else {
      throw new ResolveError(`"${fullPath}": value is a JSON ${jsonTypeName(current)} and has no sub-fields`)
    }
  }
  return current
}

function hintFromKeys(label: string, keys: string[]): string {
  if (keys.length === 0) return `${label} (none)`
  const sorted = [...keys].sort()
  const shown = sorted.length > HINT_KEY_CAP ? [...sorted.slice(0, HINT_KEY_CAP), '…'] : sorted
  return `${label} ${shown.join(', ')}`
}

function jsonTypeName(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}
