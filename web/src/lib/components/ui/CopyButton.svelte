<script lang="ts">
  import Icon from './Icon.svelte'

  const CONFIRM_MS = 1600

  let { text, label = 'Copy' }: { text: string; label?: string } = $props()

  let copied = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    copied = true
    clearTimeout(timer)
    timer = setTimeout(() => (copied = false), CONFIRM_MS)
  }
</script>

<button
  type="button"
  onclick={copy}
  class="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-fg-subtle transition hover:bg-white/8 hover:text-fg"
  aria-label={copied ? 'Copied' : label}
  title={copied ? 'Copied' : label}
>
  <Icon name={copied ? 'check' : 'content_copy'} size={16} class={copied ? 'text-coral-400' : ''} />
</button>
<span class="sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
