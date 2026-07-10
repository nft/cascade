<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'
  import { BUTTON_BASE, BUTTON_SIZE, BUTTON_VARIANT, type ButtonSize, type ButtonVariant } from './classes'

  // variant is required so no button silently ships with accidental styling.
  let {
    variant,
    size = 'md',
    class: cls = '',
    children,
    ...rest
  }: {
    variant: ButtonVariant
    size?: ButtonSize
    class?: string
    children: Snippet
  } & Omit<HTMLButtonAttributes, 'class'> = $props()
</script>

<button {...rest} class="{BUTTON_BASE} {BUTTON_VARIANT[variant]} {BUTTON_SIZE[size]} {cls}">
  {@render children()}
</button>
