<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements'
  import Icon from '../Icon.svelte'
  import { ICON_BUTTON_BASE, ICON_BUTTON_TONE, type IconButtonTone } from './classes'

  // label is mandatory (icon-only buttons need an accessible name); pass
  // title via rest when the tooltip should differ from it.
  let {
    icon,
    iconSize = 14,
    label,
    tone = 'default',
    class: cls = '',
    ...rest
  }: {
    icon: string
    iconSize?: number
    label: string
    tone?: IconButtonTone
    class?: string
  } & Omit<HTMLButtonAttributes, 'class' | 'aria-label'> = $props()
</script>

<button {...rest} aria-label={label} class="{ICON_BUTTON_BASE} {ICON_BUTTON_TONE[tone]} {cls}">
  <Icon name={icon} size={iconSize} />
</button>
