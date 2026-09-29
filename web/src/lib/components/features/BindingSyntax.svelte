<script lang="ts">
  import Inline from '$components/ui/Inline.svelte'
  import { BINDING_EXAMPLES, BINDING_SYNTAX } from '$content/features'
</script>

<div class="rounded-3xl border border-white/8 bg-surface p-6 shadow-card sm:p-8">
  <h3 class="text-xl font-semibold tracking-tight text-fg">{BINDING_SYNTAX.title}</h3>
  <p class="mt-2 max-w-3xl leading-relaxed text-pretty text-fg-muted">{BINDING_SYNTAX.lead}</p>

  <table class="mt-6 w-full text-left">
    <thead class="max-sm:sr-only">
      <tr class="text-xs font-semibold tracking-wider text-fg-subtle uppercase">
        <th scope="col" class="pb-3 font-semibold">{BINDING_SYNTAX.syntaxLabel}</th>
        <th scope="col" class="pb-3 font-semibold">{BINDING_SYNTAX.meaningLabel}</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-white/6 border-t border-white/6">
      {#each BINDING_EXAMPLES as example (example.syntax)}
        <tr class="grid gap-1.5 py-4 sm:table-row sm:py-0">
          <td class="font-mono text-[0.85rem] text-coral-300 sm:w-72 sm:py-3.5 sm:pr-8 sm:align-top">
            {example.syntax}
          </td>
          <td class="text-[0.95rem] leading-relaxed text-pretty text-fg-muted sm:py-3.5">
            <Inline text={example.meaning} />
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
