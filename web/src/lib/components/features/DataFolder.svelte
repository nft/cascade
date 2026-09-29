<script lang="ts">
  import Icon from '$components/ui/Icon.svelte'
  import { DATA_DIRS } from '$content/app'
  import { DATA_FOLDER } from '$content/features'
  import { PLATFORM_IDS, PLATFORMS } from '$lib/release/platforms'
</script>

<figure class="overflow-hidden rounded-3xl border border-white/8 bg-well shadow-card">
  <ul class="px-5 py-6 font-mono text-[0.8rem] leading-7 sm:px-8">
    <li class="flex items-center gap-2 text-fg">
      <Icon name="folder_open" size={17} class="text-coral-400" />
      {DATA_FOLDER.root}/
    </li>
    {#each DATA_FOLDER.entries as entry (entry.name)}
      <li
        class="flex min-w-0 items-center gap-2 pl-[calc(var(--depth)*--spacing(5))] max-sm:flex-wrap"
        style:--depth={entry.depth + 1}
      >
        <Icon
          name={entry.folder ? 'folder' : 'description'}
          size={16}
          class="shrink-0 {entry.folder ? 'text-coral-300/80' : 'text-fg-subtle'}"
        />
        <span class="shrink-0 text-fg">{entry.name}{entry.folder ? '/' : ''}</span>
        {#if entry.note}
          <!-- On phones the note drops under the name, lined up with it. -->
          <span class="truncate text-fg-faint max-sm:-mt-1 max-sm:basis-full max-sm:pl-6 max-sm:leading-5 sm:ml-2"
            ># {entry.note}</span
          >
        {/if}
      </li>
    {/each}
  </ul>
  <figcaption class="border-t border-white/6 px-5 py-4 sm:px-8">
    <p class="text-xs font-semibold tracking-wider text-fg-subtle uppercase">{DATA_FOLDER.caption}</p>
    <dl class="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
      {#each PLATFORM_IDS as id (id)}
        <dt class="text-fg-muted">{PLATFORMS[id].name}</dt>
        <dd class="mb-2 font-mono text-[0.8rem] break-all text-fg sm:mb-0">{DATA_DIRS[id]}</dd>
      {/each}
    </dl>
  </figcaption>
</figure>
