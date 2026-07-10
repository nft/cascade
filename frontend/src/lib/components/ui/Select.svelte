<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLSelectAttributes } from 'svelte/elements'
  import { fieldClass, SELECT_CHEVRON_PAD, type FieldSize, type FieldSurface, type FieldTone } from './classes'

  // children holds the <option>s (or an option-list component like
  // CredentialOptions). select-chevron (style.css @utility) replaces the
  // native control; SELECT_CHEVRON_PAD reserves the gutter.
  let {
    value = $bindable(),
    el = $bindable(null),
    size = 'md',
    surface = 'base',
    tone = 'default',
    mono = false,
    class: cls = '',
    children,
    ...rest
  }: {
    value?: HTMLSelectAttributes['value']
    el?: HTMLSelectElement | null
    size?: FieldSize
    surface?: FieldSurface
    tone?: FieldTone
    mono?: boolean
    class?: string
    children: Snippet
  } & Omit<HTMLSelectAttributes, 'size' | 'value' | 'class'> = $props()
</script>

<select
  {...rest}
  bind:this={el}
  bind:value
  class="select-chevron {fieldClass(size, surface, tone, mono)} {SELECT_CHEVRON_PAD[size]} {cls}"
>
  {@render children()}
</select>
