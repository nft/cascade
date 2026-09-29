<script lang="ts">
  import { jsonTokens, type JsonTokenKind } from '$lib/text/jsonTokens'

  // A JSON file excerpt with its name on top. Lines may elide with `…`.
  let { name, lines, class: cls = '' }: { name: string; lines: readonly string[]; class?: string } = $props()

  // JSON punctuation dims so the keys and values read first.
  const TOKEN_CLASS: Record<JsonTokenKind, string> = {
    key: 'text-fg',
    string: 'text-coral-300',
    number: 'text-coral-300',
    elided: 'text-fg-faint',
    plain: 'text-fg-subtle',
  }
</script>

<figure class="min-w-0 bg-well {cls}">
  <figcaption class="border-b border-white/6 px-5 py-2.5 font-mono text-xs text-fg-subtle">{name}</figcaption>
  <pre class="overflow-x-auto px-5 py-5 font-mono text-[0.78rem] leading-6"><code
      >{#each lines as line, index (index)}<span class="block"
          >{#each jsonTokens(line) as token, part (part)}<span class={TOKEN_CLASS[token.kind]}>{token.text}</span
            >{/each}</span
        >{/each}</code
    ></pre>
</figure>
