<script lang="ts">
  import { TRANSFORM_MODES, type TransformNode } from '../../model'
  import { app } from '../../state.svelte'
  import { executeTransform } from '../../transform'
  import Icon from '../Icon.svelte'
  import Button from '../ui/Button.svelte'
  import { FIELD_LABEL } from '../ui/classes'
  import CodeEditor from './CodeEditor.svelte'
  import PickRowsSection from './PickRowsSection.svelte'

  let { node }: { node: TransformNode } = $props()

  let testing = $state(false)
  let testResult = $state<string | null>(null)
  let testError = $state<string | null>(null)

  // Switching nodes drops a stale test result.
  $effect(() => {
    void node.id
    testResult = null
    testError = null
  })

  /**
   * Runs the transform against the upstreams' last captured responses
   * (plan 05 capture) and shows the result inline — no state is mutated.
   */
  async function test() {
    testing = true
    testResult = null
    testError = null
    try {
      const exports = Object.fromEntries(
        app.nodes.map((n) => [n.id, 'exports' in n.data ? (n.data.exports ?? []) : []]),
      )
      const body = await executeTransform(node, app.nodes, app.edges, app.responses, exports)
      testResult = JSON.stringify(body, null, 2)
    } catch (err) {
      testError = err instanceof Error ? err.message : String(err)
    } finally {
      testing = false
    }
  }
</script>

<div>
  <div class="flex items-center justify-between">
    <span class={FIELD_LABEL}>Transform</span>
    <div class="flex rounded-md border border-zinc-800 p-0.5">
      {#each TRANSFORM_MODES as mode (mode)}
        <button
          class="rounded px-2 py-0.5 text-[10px] {node.data.mode === mode
            ? 'bg-violet-500/20 text-violet-200'
            : 'text-zinc-500 hover:text-zinc-300'}"
          onclick={() => app.updateNodeData(node.id, { mode })}
        >
          {mode}
        </button>
      {/each}
    </div>
  </div>

  <div class="mt-1.5">
    {#if node.data.mode === 'pick'}
      <PickRowsSection {node} />
    {:else}
      <CodeEditor value={node.data.script} onChange={(script) => app.updateNodeData(node.id, { script })} />
      <p class="mt-1 text-[10px] text-zinc-600">
        res · nodes.&lt;key&gt; · i · _ helpers — return a JSON value
      </p>
    {/if}
  </div>

  <Button
    variant="secondary"
    class="mt-2 w-full"
    disabled={testing}
    onclick={test}
    title="Run this transform against the upstreams' last captured responses"
  >
    <Icon name="science" size={14} />
    {testing ? 'Testing…' : 'Test against last responses'}
  </Button>

  {#if testError}
    <p class="mt-1.5 rounded-md border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-[11px] text-rose-400">
      {testError}
    </p>
  {:else if testResult !== null}
    <pre class="mt-1.5 max-h-48 overflow-auto rounded-md border border-emerald-500/20 bg-zinc-950 p-2 font-mono text-[10px] text-zinc-300">{testResult}</pre>
  {/if}
</div>
