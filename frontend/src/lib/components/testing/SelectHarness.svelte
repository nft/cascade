<script lang="ts">
  // Test harness for ui/Select: binds value/el around a fixed option list.
  import type { ComponentProps } from 'svelte'
  import Select from '../ui/Select.svelte'

  let {
    initial = 'a',
    ...rest
  }: { initial?: string } & Omit<ComponentProps<typeof Select>, 'value' | 'el' | 'children'> = $props()

  // svelte-ignore state_referenced_locally
  let value = $state(initial)
  let el = $state<HTMLSelectElement | null>(null)

  export function getValue() {
    return value
  }
  export function getEl() {
    return el
  }
</script>

<Select bind:value bind:el {...rest}>
  <option value="a">Alpha</option>
  <option value="b">Beta</option>
  <option value="c">Gamma</option>
</Select>
