<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements'
  import { fieldClass, type FieldSize, type FieldSurface, type FieldTone } from './classes'

  // Works bound (bind:value) and uncontrolled (value={x} + oninput via rest):
  // an unbound parent's prop changes still flow down into the bindable.
  // bind:el exposes the element for focus()/select()/setSelectionRange.
  let {
    value = $bindable(),
    el = $bindable(null),
    size = 'md',
    surface = 'base',
    tone = 'default',
    mono = false,
    class: cls = '',
    ...rest
  }: {
    value?: HTMLInputAttributes['value']
    el?: HTMLInputElement | null
    size?: FieldSize
    surface?: FieldSurface
    tone?: FieldTone
    mono?: boolean
    class?: string
  } & Omit<HTMLInputAttributes, 'size' | 'value' | 'class'> = $props()
</script>

<!-- rest is spread first so bindings and the composed class can't be clobbered -->
<input {...rest} bind:this={el} bind:value class="{fieldClass(size, surface, tone, mono)} {cls}" />
