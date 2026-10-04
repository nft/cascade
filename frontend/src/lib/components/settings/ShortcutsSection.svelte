<script lang="ts">
  import { SHORTCUT_GROUPS } from '../../shortcuts'
  import { FIELD_LABEL } from '../ui/classes'
</script>

<section class="space-y-4" aria-label="Keyboard shortcuts">
  {#each SHORTCUT_GROUPS as group (group.title)}
    <div>
      <h3 class={FIELD_LABEL}>{group.title}</h3>
      <dl class="mt-2 space-y-1.5">
        {#each group.shortcuts as shortcut (shortcut.label)}
          <div class="flex items-center justify-between gap-4">
            <dt class="text-xs text-zinc-300">{shortcut.label}</dt>
            <dd class="flex shrink-0 items-center gap-1">
              {#each shortcut.keys as key (key)}
                <kbd
                  class="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300"
                >
                  {key}
                </kbd>
              {/each}
            </dd>
          </div>
        {/each}
      </dl>
    </div>
  {/each}
</section>
