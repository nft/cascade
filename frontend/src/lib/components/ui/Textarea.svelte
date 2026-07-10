<script lang="ts">
  import type { HTMLTextareaAttributes } from 'svelte/elements'
  import { fieldClass, type FieldSize, type FieldSurface, type FieldTone } from './classes'

  // Height and resize behavior are layout — pass them via class (h-28 resize-y).
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
    value?: string
    el?: HTMLTextAreaElement | null
    size?: FieldSize
    surface?: FieldSurface
    tone?: FieldTone
    mono?: boolean
    class?: string
  } & Omit<HTMLTextareaAttributes, 'value' | 'class'> = $props()
</script>

<textarea {...rest} bind:this={el} bind:value class="{fieldClass(size, surface, tone, mono)} {cls}"></textarea>
