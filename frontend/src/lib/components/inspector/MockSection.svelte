<script lang="ts">
  import { MOCK_DEFAULT_STATUS, type MockNode } from '../../model'
  import { app } from '../../state.svelte'
  import Icon from '../Icon.svelte'
  import Button from '../ui/Button.svelte'
  import Field from '../ui/Field.svelte'
  import Input from '../ui/Input.svelte'
  import { FIELD_LABEL } from '../ui/classes'
  import CodeEditor from './CodeEditor.svelte'

  let { node }: { node: MockNode } = $props()

  // HTTP status codes span 100–599; anything else in the field falls back to
  // the default rather than persisting garbage.
  const STATUS_MIN = 100
  const STATUS_MAX = 599

  let parseError = $derived.by(() => {
    try {
      JSON.parse(node.data.body)
      return null
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  })

  function format() {
    try {
      app.updateNodeData(node.id, { body: JSON.stringify(JSON.parse(node.data.body), null, 2) })
    } catch {
      // Unparseable: nothing to format — the error line below already explains.
    }
  }

  function setStatus(raw: string) {
    const parsed = Number(raw)
    const statusCode =
      Number.isInteger(parsed) && parsed >= STATUS_MIN && parsed <= STATUS_MAX
        ? parsed
        : MOCK_DEFAULT_STATUS
    app.updateNodeData(node.id, { statusCode })
  }
</script>

<div>
  <div class="flex items-center justify-between">
    <span class={FIELD_LABEL}>Mock output</span>
    <Button
      variant="ghost"
      size="xs"
      disabled={parseError !== null}
      onclick={format}
      title="Reformat the JSON body"
    >
      <Icon name="format_align_left" size={13} />
      Format
    </Button>
  </div>

  <div class="mt-1.5">
    <CodeEditor
      language="json"
      lint
      value={node.data.body}
      onChange={(body) => app.updateNodeData(node.id, { body })}
    />
    {#if parseError}
      <p class="mt-1.5 rounded-md border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-[11px] text-rose-400">
        {parseError}
      </p>
    {:else}
      <p class="mt-1 text-[10px] text-zinc-600">
        Emitted as-is when the node runs — {'{{…}}'} templates are not resolved here; use a
        transform to reshape upstream data
      </p>
    {/if}
  </div>

  <Field label="Status code" class="mt-3 w-24">
    <Input
      class="mt-1 w-full"
      type="number"
      min={STATUS_MIN}
      max={STATUS_MAX}
      mono
      value={node.data.statusCode}
      aria-label="Mock status code"
      onchange={(e) => setStatus(e.currentTarget.value)}
    />
  </Field>
</div>
