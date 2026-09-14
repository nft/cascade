<script lang="ts">
  import {
    FOR_DEFAULT_COUNT,
    FOR_MAX_ITERATIONS,
    FOR_MIN_COUNT,
    FOR_MODES,
    isRunnableNode,
    type ForNode,
  } from '../../model'
  import { ancestorNodes, arrayPaths, nodeSchemaSource } from '../../picker'
    import { app } from '../../state.svelte'
  import Icon from '../Icon.svelte'
  import { FIELD_LABEL } from '../ui/classes'
  import Field from '../ui/Field.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import Input from '../ui/Input.svelte'

  let { node }: { node: ForNode } = $props()

  // Each-mode sources must come from the For's own upstreams: those outputs
  // exist before the loop starts and are constant across iterations (plan 09).
  const ancestors = $derived(ancestorNodes(app.nodes, app.edges, node.id))
  const sourceKey = $derived.by(() => {
    const src = node.data.source
    if (!src) return ''
    const owner = app.nodes.find((n) => n.id === src.nodeId)
    return owner && isRunnableNode(owner) ? owner.data.key : src.nodeId
  })
  // A stored ref can escape the upstream set (edge cut, node deleted) — the
  // engine fails the loop with a named error; flag it while editing.
  const danglingSource = $derived(
    node.data.source !== undefined &&
      !ancestors.some(({ node: a }) => a.id === node.data.source?.nodeId),
  )

  /** Free-text path per ancestor when it has no schema to offer. */
  let freePaths = $state<Record<string, string>>({})

  function setCount(raw: string) {
    const parsed = Number(raw)
    const count = Number.isFinite(parsed) ? Math.round(parsed) : FOR_DEFAULT_COUNT
    app.updateNodeData(node.id, {
      count: Math.min(FOR_MAX_ITERATIONS, Math.max(FOR_MIN_COUNT, count)),
    })
  }

  function setSource(nodeId: string, path: string) {
    app.updateNodeData(node.id, { source: { nodeId, path } })
  }
</script>

<div>
  <div class="flex items-center justify-between">
    <span class={FIELD_LABEL}>Loop</span>
    <div class="flex rounded-md border border-zinc-800 p-0.5">
      {#each FOR_MODES as mode (mode)}
        <button
          class="rounded px-2 py-0.5 text-[10px] {node.data.mode === mode
            ? 'bg-emerald-500/20 text-emerald-200'
            : 'text-zinc-500 hover:text-zinc-300'}"
          onclick={() => app.updateNodeData(node.id, { mode })}
        >
          {mode}
        </button>
      {/each}
    </div>
  </div>

  {#if node.data.mode === 'count'}
    <Field label="Iterations" class="mt-2">
      <Input
        class="mt-1 w-28"
        type="number"
        min={FOR_MIN_COUNT}
        max={FOR_MAX_ITERATIONS}
        mono
        value={node.data.count}
        aria-label="Iteration count"
        onchange={(e) => setCount(e.currentTarget.value)}
      />
    </Field>
    <p class="mt-2 text-[10px] leading-relaxed text-zinc-600">
      Runs the nodes inside the container this many times, sequentially.
      Inside the body, <span class="font-mono">{'{{i}}'}</span> is the iteration index.
    </p>
  {:else}
    <!-- Not a ui/Field: the picker is a tree of buttons, not a single control,
         and a wrapping <label> would misroute their clicks. -->
    <div class="mt-2">
      <span class={FIELD_LABEL}>Array source</span>
      {#if node.data.source}
        <div class="mt-1 flex items-center gap-1">
          <span
            class="min-w-0 flex-1 truncate rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-emerald-300"
            title="{sourceKey}.{node.data.source.path}"
          >
            {sourceKey}.{node.data.source.path}
          </span>
          <IconButton
            icon="close"
            iconSize={13}
            onclick={() => app.updateNodeData(node.id, { source: undefined })}
            title="Clear source"
            label="Clear source"
          />
        </div>
        {#if danglingSource}
          <p class="mt-1.5 flex items-start gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-300">
            <Icon name="warning" size={12} />
            <span>
              <span class="font-mono">{sourceKey}</span> is not an upstream of this loop —
              the run will fail until you reconnect it or pick another source
            </span>
          </p>
        {/if}
      {/if}

      <div
        data-testid="for-source-picker"
        class="mt-1 max-h-72 space-y-2 overflow-y-auto rounded-md border border-emerald-500/30 bg-zinc-950 p-2"
      >
        {#if ancestors.length === 0}
          <p class="px-1 py-2 text-center text-[11px] text-zinc-600">
            Connect an upstream node to the loop to iterate one of its arrays.
          </p>
        {/if}
        {#each ancestors as { node: upstream } (upstream.id)}
          {@const schemaSource = nodeSchemaSource(upstream, app.responses[upstream.id])}
          {@const options = schemaSource ? arrayPaths(schemaSource.schema) : null}
          <section>
            <header class="flex items-center gap-1.5 px-1 pb-1">
              <span class="font-mono text-[11px] font-semibold text-emerald-300">{upstream.data.key}</span>
              <span class="truncate text-[10px] text-zinc-500">{upstream.data.name}</span>
            </header>
            {#if options}
              {#if options.length > 0}
                <div class="flex flex-wrap gap-1 px-1 pb-1">
                  {#each options as opt (opt.path)}
                    <button
                      class="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300 hover:bg-emerald-500/30"
                      onclick={() => setSource(upstream.id, opt.path)}
                      title="Iterate {opt.path}"
                    >
                      {opt.path}
                    </button>
                  {/each}
                </div>
              {:else}
                <p class="px-1 pb-1 text-[10px] text-zinc-600">no array-typed paths in its schema</p>
              {/if}
            {:else}
              <div class="flex items-center gap-1 px-1">
                <Input
                  size="xs"
                  surface="raised"
                  mono
                  class="min-w-0 flex-1"
                  placeholder="body.path.to.array — no schema yet; run the node once"
                  bind:value={freePaths[upstream.id]}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' && (freePaths[upstream.id] ?? '') !== '')
                      setSource(upstream.id, freePaths[upstream.id])
                  }}
                />
                <IconButton
                  icon="keyboard_return"
                  iconSize={13}
                  disabled={(freePaths[upstream.id] ?? '') === ''}
                  onclick={() => setSource(upstream.id, freePaths[upstream.id])}
                  title="Use path as source"
                  label="Use path as source"
                />
              </div>
            {/if}
          </section>
        {/each}
      </div>
    </div>
    <p class="mt-2 text-[10px] leading-relaxed text-zinc-600">
      Runs the body once per element. Inside it, <span class="font-mono">{'{{item}}'}</span>
      (or <span class="font-mono">{'{{item.path}}'}</span>) is the current element and
      <span class="font-mono">{'{{i}}'}</span> the index.
    </p>
  {/if}
</div>
