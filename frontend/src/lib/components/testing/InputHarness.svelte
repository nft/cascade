<script lang="ts">
  // Test harness for ui/Input: exercises bind:value/bind:el from a real parent
  // (mount() props can't bind), and the unbound branch covers uncontrolled
  // usage (value prop + oninput via rest) including parent prop flow-down.
  import type { ComponentProps } from 'svelte'
  import Input from '../ui/Input.svelte'

  let {
    initial = '',
    bound = true,
    ...rest
  }: { initial?: string; bound?: boolean } & Omit<ComponentProps<typeof Input>, 'value' | 'el'> = $props()

  // svelte-ignore state_referenced_locally
  let value = $state(initial)
  let el = $state<HTMLInputElement | null>(null)

  export function getValue() {
    return value
  }
  export function setValue(v: string) {
    value = v
  }
  export function getEl() {
    return el
  }
</script>

{#if bound}
  <Input bind:value bind:el {...rest} />
{:else}
  <Input {value} bind:el {...rest} />
{/if}
