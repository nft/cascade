<script lang="ts">
  import type { SchemaTreeNode } from '../../schema'
  import Icon from '../Icon.svelte'
  import SchemaTree from './SchemaTree.svelte'

  // Rows expand two levels by default; deeper branches open on demand.
  const DEFAULT_OPEN_DEPTH = 2

  let {
    node,
    depth = 0,
    onPick,
  }: { node: SchemaTreeNode; depth?: number; onPick: (path: string) => void } = $props()

  // depth is fixed for a row's lifetime (rows are keyed by path), so
  // capturing it once for the initial open state is intended.
  // svelte-ignore state_referenced_locally
  let open = $state(depth < DEFAULT_OPEN_DEPTH)
</script>

<div class="min-w-0" style="--indent:{depth * 12}px">
  <div class="flex items-center gap-0.5 pl-(--indent)">
    {#if node.children.length > 0}
      <button
        class="flex items-center rounded text-zinc-500 hover:text-zinc-200"
        onclick={() => (open = !open)}
        aria-label={open ? 'Collapse' : 'Expand'}
      >
        <Icon name={open ? 'expand_more' : 'chevron_right'} size={14} />
      </button>
    {:else}
      <span class="w-3.5 shrink-0"></span>
    {/if}
    <button
      class="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-violet-500/10"
      onclick={() => onPick(node.path)}
      title="Insert {node.path}"
    >
      <span class="truncate font-mono text-[11px] text-zinc-300">{node.label}</span>
      <span class="ml-auto shrink-0 text-[10px] text-zinc-600">{node.type}</span>
    </button>
  </div>
  {#if open}
    {#each node.children as child (child.path)}
      <SchemaTree node={child} depth={depth + 1} {onPick} />
    {/each}
  {/if}
</div>
