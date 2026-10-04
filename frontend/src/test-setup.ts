// jsdom polyfills needed by @xyflow/svelte in component tests.
if (typeof window !== 'undefined') {
  window.matchMedia ??= ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia

  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// Node 22+ defines its own `localStorage` global as a lazy accessor which,
// without --localstorage-file, yields an inert object (no setItem/getItem)
// and shadows jsdom's. Swap in an in-memory Storage so persistence code is
// testable; the descriptor check avoids touching the accessor, which prints
// a warning per worker.
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
if (!storageDescriptor || 'get' in storageDescriptor) {
  const store = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, String(value)),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true, writable: true })
}
