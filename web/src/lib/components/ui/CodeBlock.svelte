<script lang="ts">
  import CopyButton from './CopyButton.svelte'

  // A code excerpt that is not a shell session: no prompt, copied verbatim.
  let { lines, label }: { lines: readonly string[]; label: string } = $props()
</script>

<figure class="overflow-hidden rounded-2xl border border-white/8 bg-well shadow-card">
  <figcaption class="flex items-center justify-between gap-4 border-b border-white/6 py-1.5 pr-2 pl-4">
    <span class="font-mono text-xs text-fg-subtle">{label}</span>
    <CopyButton text={lines.join('\n')} label="Copy code" />
  </figcaption>
  <pre class="overflow-x-auto p-4 font-mono text-[0.84rem] leading-7 text-fg"><code
      >{#each lines as line, index (index)}<span class="block min-h-7">{line}</span>{/each}</code
    ></pre>
</figure>
