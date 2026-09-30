<script lang="ts">
  import { DELAY_DEFAULT_MS, DELAY_MAX_MS, DELAY_MIN_MS, type DelayNode } from '../../model'
  import { app } from '../../state.svelte'
  import Field from '../ui/Field.svelte'
  import Input from '../ui/Input.svelte'
  import Select from '../ui/Select.svelte'

  let { node }: { node: DelayNode } = $props()

  const MS_PER_SECOND = 1000
  const UNITS = ['ms', 's'] as const
  type Unit = (typeof UNITS)[number]

  // Display-only preference; the stored value is always ms. Starts in
  // seconds when the stored duration reads naturally as whole seconds.
  // svelte-ignore state_referenced_locally
  let unit = $state<Unit>(
    node.data.durationMs >= MS_PER_SECOND && node.data.durationMs % MS_PER_SECOND === 0 ? 's' : 'ms',
  )

  let shown = $derived(unit === 's' ? node.data.durationMs / MS_PER_SECOND : node.data.durationMs)

  function setDuration(raw: string) {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      app.updateNodeData(node.id, { durationMs: DELAY_DEFAULT_MS })
      return
    }
    const ms = Math.round(unit === 's' ? parsed * MS_PER_SECOND : parsed)
    app.updateNodeData(node.id, {
      durationMs: Math.min(DELAY_MAX_MS, Math.max(DELAY_MIN_MS, ms)),
    })
  }
</script>

<div>
  <Field label="Duration">
    <div class="mt-1 flex gap-2">
      <Input
        class="w-24"
        type="number"
        min={unit === 's' ? DELAY_MIN_MS / MS_PER_SECOND : DELAY_MIN_MS}
        max={unit === 's' ? DELAY_MAX_MS / MS_PER_SECOND : DELAY_MAX_MS}
        mono
        value={shown}
        aria-label="Delay duration"
        onchange={(e) => setDuration(e.currentTarget.value)}
      />
      <Select
        surface="raised"
        value={unit}
        aria-label="Duration unit"
        onchange={(e) => (unit = e.currentTarget.value as Unit)}
      >
        {#each UNITS as u (u)}
          <option value={u}>{u}</option>
        {/each}
      </Select>
    </div>
  </Field>

  <!-- Honest limitation: the executor is sequential, so today a
       delay also postpones independent branches ordered after it. -->
  <p class="mt-2 text-[10px] leading-relaxed text-zinc-600">
    Holds this node's downstream for the configured wait, then passes its single upstream's
    output through unchanged. Until parallel branch execution lands, nodes ordered after the
    delay wait too — even on independent branches.
  </p>
</div>
