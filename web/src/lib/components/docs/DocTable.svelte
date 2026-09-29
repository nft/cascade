<script lang="ts">
  import Inline from '$components/ui/Inline.svelte'

  // Cells are inline markdown. On phones each row stacks its cells, led by the
  // first one, and the header row is left to screen readers.
  let { head, rows }: { head: readonly string[]; rows: readonly (readonly string[])[] } = $props()
</script>

<div class="overflow-x-auto rounded-2xl border border-white/8">
  <table class="w-full text-left text-[0.95rem]">
    <thead class="bg-white/3 text-xs font-semibold tracking-wider text-fg-subtle uppercase max-sm:sr-only">
      <tr>
        {#each head as cell (cell)}
          <th scope="col" class="px-4 py-3 font-semibold whitespace-nowrap">{cell}</th>
        {/each}
      </tr>
    </thead>
    <tbody class="divide-y divide-white/6">
      {#each rows as row, index (index)}
        <tr class="grid gap-1 px-4 py-3.5 sm:table-row sm:p-0">
          {#each row as cell, column (column)}
            <td
              class="leading-relaxed text-pretty max-sm:[overflow-wrap:anywhere] sm:px-4 sm:py-3 sm:align-top {column === 0
                ? 'font-medium text-fg'
                : 'text-fg-muted'}"
            >
              <Inline text={cell} />
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
