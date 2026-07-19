<script lang="ts">
  // Transient bottom-center toast (plan 09 N5): refused edits that need a
  // one-line explanation, not a modal. Auto-dismisses via dialogs.showToast.
  import { dialogs } from '../dialogs.svelte'
  import Icon from './Icon.svelte'
</script>

{#if dialogs.toast}
  <div class="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
    <div
      role="status"
      class="pointer-events-auto flex items-center gap-2 rounded-lg border border-amber-500/30 bg-zinc-900 px-3 py-2 text-xs text-amber-200 shadow-xl"
    >
      <Icon name="warning" size={14} />
      <span>{dialogs.toast}</span>
    </div>
  </div>
{/if}
