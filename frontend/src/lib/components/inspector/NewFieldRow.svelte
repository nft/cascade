<script lang="ts">
  import { sectionKey, type RequestSectionId } from '../../request'
  import type { RequestEditorTarget } from '../../requestEditor'
  import { nodeIdByKey, parseFieldInput } from '../../refs'
  import { app } from '../../state.svelte'
  import Input from '../ui/Input.svelte'

  // The trailing ghost row: always-present empty key/value pair
  // replacing the old "name + Add" control. Typing a name commits a real
  // field; the row then resets to empty for the next one.
  let {
    target,
    section,
    keyPlaceholder,
  }: {
    target: RequestEditorTarget
    section: RequestSectionId
    keyPlaceholder: string
  } = $props()

  let rowEl = $state<HTMLDivElement | null>(null)
  let name = $state('')
  let value = $state('')

  function commit() {
    const trimmed = name.trim()
    if (trimmed === '') return
    const key = sectionKey(section, trimmed, target.path)
    if (target.fields.some((f) => f.key === key)) return
    target.setField(
      target.nodeId
        ? parseFieldInput(key, value, nodeIdByKey(app.nodes), new Set(app.nodes.map((n) => n.id)))
        : { key, source: 'literal', value },
    )
    name = ''
    value = ''
  }

  // Commit when focus leaves the row entirely — tabbing from the name to the
  // value input must not commit a half-typed pair.
  function onFocusout(event: FocusEvent) {
    if (rowEl && event.relatedTarget instanceof Node && rowEl.contains(event.relatedTarget)) return
    commit()
  }

  function onEnter(event: KeyboardEvent) {
    if (event.key === 'Enter') commit()
  }
</script>

<div bind:this={rowEl} class="flex items-center gap-1" onfocusout={onFocusout}>
  <Input
    size="xs"
    mono
    surface="raised"
    class="w-2/5 shrink-0"
    placeholder={keyPlaceholder}
    aria-label="New field name"
    bind:value={name}
    onkeydown={onEnter}
  />
  <Input
    size="xs"
    mono
    surface="raised"
    class="min-w-0 flex-1"
    placeholder="value"
    aria-label="New field value"
    bind:value
    onkeydown={onEnter}
  />
</div>
