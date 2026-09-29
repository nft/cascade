<script lang="ts">
  import CopyButton from './CopyButton.svelte'

  // Shell commands, one per line; comments (#) render dimmed and are copied too.
  let { lines, label }: { lines: readonly string[]; label?: string } = $props()

  const COMMENT_PREFIX = '#'
  const DEFAULT_LABEL = 'shell'
</script>

<figure class="overflow-hidden rounded-2xl border border-white/8 bg-well shadow-card">
  <figcaption class="flex items-center justify-between gap-4 border-b border-white/6 py-1.5 pr-2 pl-4">
    <span class="font-mono text-xs text-fg-subtle">{label ?? DEFAULT_LABEL}</span>
    <CopyButton text={lines.join('\n')} label="Copy commands" />
  </figcaption>
  <pre class="overflow-x-auto p-4 font-mono text-[0.84rem] leading-7"><code
      >{#each lines as line, index (index)}<span class="block"
          >{#if line.startsWith(COMMENT_PREFIX)}<span class="text-fg-faint">{line}</span>{:else}<span
              class="text-coral-400 select-none">$ </span
            ><span class="text-fg">{line}</span>{/if}</span
        >{/each}</code
    ></pre>
</figure>
