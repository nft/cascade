// The keyboard shortcuts the app answers to, for the Settings › Shortcuts
// reference. Keep in step with keyboard.ts and the canvas's deleteKey.

const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)

export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl'

export interface Shortcut {
  keys: string[]
  label: string
}

export interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Workspace',
    shortcuts: [
      { keys: [MOD_KEY, 'B'], label: 'Show or hide the sidebar panel' },
      { keys: [MOD_KEY, ','], label: 'Open settings' },
      { keys: ['Esc'], label: 'Close a menu, drop the active tool, or clear the selection' },
    ],
  },
  {
    title: 'Canvas',
    shortcuts: [
      { keys: ['V'], label: 'Select tool' },
      { keys: ['X'], label: 'Scissors tool: click an edge, or drag across edges, to cut' },
      { keys: ['Backspace'], label: 'Delete the selected nodes and edges' },
      { keys: [MOD_KEY, 'C'], label: 'Copy the selected nodes' },
      { keys: [MOD_KEY, 'V'], label: 'Paste nodes at the canvas center' },
    ],
  },
]
