<script lang="ts">
  import { inlineHtml } from '$lib/text/inline'

  // Trusted site content and CHANGELOG.md only; inlineHtml escapes the rest.
  let { text }: { text: string } = $props()
</script>

{@html inlineHtml(text)}
