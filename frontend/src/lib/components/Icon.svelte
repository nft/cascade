<script lang="ts">
  let { name, size = 16, filled = false, class: cls = '' }:
    { name: string; size?: number; filled?: boolean; class?: string } = $props()
</script>

<span
  class="material-symbols-rounded select-none {cls}"
  style="font-size:{size}px; font-variation-settings:'FILL' {filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' {size <= 20 ? 20 : 24}"
  aria-hidden="true"
>{name}</span>
