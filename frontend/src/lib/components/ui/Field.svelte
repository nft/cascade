<script lang="ts">
  import type { Snippet } from 'svelte'
  import { FIELD_LABEL } from './classes'

  // The label>span+control shape matches the previous inline markup, so
  // existing DOM-querying tests are unaffected. The control keeps its own
  // mt-1; helper/error <p>s can follow it inside children.
  let { label, class: cls = '', children }: { label: string; class?: string; children: Snippet } = $props()
</script>

<label class="block {cls}">
  <span class={FIELD_LABEL}>{label}</span>
  {@render children()}
</label>
