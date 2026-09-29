<script lang="ts">
  import Icon from '$components/ui/Icon.svelte'
  import { NODE_KINDS } from '$content/features'

  // The six node kinds, drawn like nodes on the app's canvas.
</script>

<div class="rounded-3xl border border-white/8 bg-app-canvas bg-dots p-4 [--dot:var(--color-app-dot)] sm:p-8">
  <ul class="grid gap-3 sm:grid-cols-2">
    {#each NODE_KINDS as kind (kind.name)}
      <li class="rounded-xl border border-zinc-700 bg-app-surface p-4 shadow-card">
        <p class="flex items-center gap-2.5 text-sm font-semibold text-zinc-100">
          <span class="grid size-7 place-items-center rounded-lg bg-coral-500/12">
            <Icon name={kind.icon} size={17} class="text-coral-400" />
          </span>
          {kind.name}
        </p>
        <p class="mt-2.5 text-sm leading-relaxed text-pretty text-zinc-400">{kind.body}</p>
      </li>
    {/each}
  </ul>
</div>
