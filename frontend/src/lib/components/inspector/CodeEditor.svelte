<script lang="ts">
  import { javascript } from '@codemirror/lang-javascript'
  import { json, jsonParseLinter } from '@codemirror/lang-json'
  import { syntaxHighlighting } from '@codemirror/language'
  import { linter } from '@codemirror/lint'
  import { classHighlighter } from '@lezer/highlight'
  import { basicSetup, EditorView } from 'codemirror'
  import { untrack } from 'svelte'

  let {
    value,
    onChange,
    language = 'javascript',
    lint = false,
  }: {
    value: string
    onChange: (value: string) => void
    /** Transform scripts are JS; raw JSON bodies get JSON highlighting. */
    language?: 'javascript' | 'json'
    /**
     * Squiggle JSON parse errors inline (json only). Opt-in:
     * raw bodies also use json mode but may hold {{…}} templates that are
     * not parseable JSON by design.
     */
    lint?: boolean
  } = $props()

  let host = $state<HTMLDivElement | null>(null)
  let view: EditorView | undefined
  /** Last doc text seen by/pushed to the editor — breaks the update loop. */
  let current = ''

  /**
   * Insert at the current selection via a transaction — CodeMirror state is
   * immutable, so native-input selection APIs don't apply here.
   */
  export function insertText(text: string) {
    if (!view) return
    const { from, to } = view.state.selection.main
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      scrollIntoView: true,
    })
    view.focus()
  }

  $effect(() => {
    if (!host) return
    // classHighlighter emits tok-* classes; their colors map to @theme
    // tokens in style.css (the Tailwind conventions' CodeMirror rule).
    view = new EditorView({
      doc: untrack(() => value),
      parent: host,
      extensions: [
        basicSetup,
        language === 'json' ? json() : javascript(),
        ...(lint && language === 'json' ? [linter(jsonParseLinter())] : []),
        syntaxHighlighting(classHighlighter),
        EditorView.theme({}, { dark: true }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          current = update.state.doc.toString()
          onChange(current)
        }),
      ],
    })
    current = untrack(() => value)
    return () => {
      view?.destroy()
      view = undefined
    }
  })

  // External value changes (e.g. selecting another node) replace the doc;
  // editor-originated changes come back equal to `current` and are ignored.
  $effect(() => {
    if (view && value !== current) {
      current = value
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  })
</script>

<div bind:this={host} class="nodrag overflow-hidden rounded-md border border-zinc-800"></div>
