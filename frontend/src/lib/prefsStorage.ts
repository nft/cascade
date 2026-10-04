// Safe JSON access to the webview's localStorage, for per-machine UI prefs
// (layout, appearance). Project data never goes here.

// Access is wrapped because a webview with storage disabled throws on the
// property itself, not just on reads and writes.
export function readJSON(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    // Quota or disabled storage: the preference simply resets next launch.
  }
}
