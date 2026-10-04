<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements'
  import { TOGGLE_THUMB, TOGGLE_THUMB_STATE, TOGGLE_TRACK, TOGGLE_TRACK_STATE } from './classes'

  // Controlled switch: the owner holds the value and reacts in onchange, so
  // an optimistic write that fails can snap the control back.
  let {
    checked,
    label,
    onchange,
    class: cls = '',
    ...rest
  }: {
    checked: boolean
    label: string
    onchange: (checked: boolean) => void
    class?: string
  } & Omit<HTMLButtonAttributes, 'class' | 'aria-label' | 'onchange' | 'onclick' | 'type' | 'role'> = $props()
</script>

<button
  {...rest}
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  class="{TOGGLE_TRACK} {TOGGLE_TRACK_STATE[checked ? 'on' : 'off']} {cls}"
  onclick={() => onchange(!checked)}
>
  <span class="{TOGGLE_THUMB} {TOGGLE_THUMB_STATE[checked ? 'on' : 'off']}"></span>
</button>
