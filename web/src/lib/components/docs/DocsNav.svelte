<script lang="ts">
  import Icon from '$components/ui/Icon.svelte'
  import { DOCS_PAGE, type DocSection } from '$content/docs'

  // A sticky sidebar on wide screens; on phones, a disclosure above the
  // article that closes once a section is picked.
  let { sections, current }: { sections: readonly DocSection[]; current: string | null } = $props()

  let open = $state(false)
</script>

{#snippet links()}
  <ul class="space-y-0.5">
    {#each sections as section (section.id)}
      <li>
        <a
          href="#{section.id}"
          aria-current={current === section.id ? 'location' : undefined}
          onclick={() => (open = false)}
          class="block rounded-lg border-l-2 border-transparent py-1.5 pr-2 pl-3 text-[0.9rem] text-fg-muted transition-colors hover:text-fg aria-[current=location]:border-coral-400 aria-[current=location]:bg-white/4 aria-[current=location]:text-fg"
        >
          {section.title}
        </a>
      </li>
    {/each}
  </ul>
{/snippet}

<nav aria-label={DOCS_PAGE.navLabel} class="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto">
  <details bind:open class="group rounded-2xl border border-white/8 bg-surface lg:hidden">
    <summary
      class="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold text-fg [&::-webkit-details-marker]:hidden"
    >
      {DOCS_PAGE.navLabel}
      <Icon name="arrow_drop_down" size={22} class="text-fg-subtle transition-transform group-open:rotate-180" />
    </summary>
    <div class="border-t border-white/6 p-2">{@render links()}</div>
  </details>

  <div class="hidden lg:block">
    <p class="pl-3 text-xs font-semibold tracking-wider text-fg-subtle uppercase">{DOCS_PAGE.navLabel}</p>
    <div class="mt-4">{@render links()}</div>
  </div>
</nav>
