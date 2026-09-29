<script lang="ts">
  import Container from '$components/ui/Container.svelte'
  import Icon from '$components/ui/Icon.svelte'
  import Inline from '$components/ui/Inline.svelte'
  import SectionHeading from '$components/ui/SectionHeading.svelte'
  import WindowFrame from '$components/ui/WindowFrame.svelte'
  import { SCRIPT, SCRIPT_LINES, SCRIPT_NOTES, type ScriptNoteId } from '$content/home'
  import { reveal } from '$lib/motion/reveal'

  // Hovering or focusing a note lights up the script spans it replaces.
  let active = $state<ScriptNoteId | null>(null)

  const number = (id: ScriptNoteId) => SCRIPT_NOTES.findIndex((note) => note.id === id) + 1

  // Each note's number is shown once, at its first span in the script.
  const firstSpans = new Set(
    SCRIPT_NOTES.map((note) => {
      for (const [line, segments] of SCRIPT_LINES.entries()) {
        const index = segments.findIndex((segment) => segment.note === note.id)
        if (index >= 0) return `${line}:${index}`
      }
      return ''
    }),
  )
</script>

<section class="py-24 sm:py-32">
  <Container class="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
    <div class="lg:order-2 lg:col-span-5" {@attach reveal()}>
      <SectionHeading title={SCRIPT.title}>{SCRIPT.body}</SectionHeading>

      <ol class="mt-10 space-y-2">
        {#each SCRIPT_NOTES as note, index (note.id)}
          <li>
            <button
              type="button"
              class="flex w-full gap-4 rounded-2xl border p-4 text-left transition-colors {active === note.id
                ? 'border-coral-500/40 bg-coral-500/6'
                : 'border-transparent hover:bg-white/3'}"
              aria-pressed={active === note.id}
              onmouseenter={() => (active = note.id)}
              onmouseleave={() => (active = null)}
              onfocus={() => (active = note.id)}
              onblur={() => (active = null)}
            >
              <span
                class="grid size-7 shrink-0 place-items-center rounded-full bg-coral-500/15 font-mono text-xs font-semibold text-coral-300"
                >{index + 1}</span
              >
              <span>
                <span class="flex items-center gap-2 font-semibold text-fg">
                  <Icon name={note.icon} size={18} class="text-fg-subtle" />
                  {note.title}
                </span>
                <span class="mt-1 block text-[0.95rem] leading-relaxed text-fg-muted"><Inline text={note.body} /></span>
              </span>
            </button>
          </li>
        {/each}
      </ol>
    </div>

    <div class="min-w-0 lg:order-1 lg:col-span-7" {@attach reveal(120)}>
      <WindowFrame title={SCRIPT.file}>
        <pre class="overflow-x-auto bg-well px-5 py-6 font-mono text-[0.8rem] leading-7 sm:text-[0.86rem]"><code
            >{#each SCRIPT_LINES as segments, line (line)}<span class="block min-h-7"
                >{#each segments as segment, index (index)}{#if segment.note}<mark
                      class="rounded-sm px-0.5 transition-colors {active === segment.note
                        ? 'bg-coral-500/30 text-coral-100'
                        : 'bg-coral-500/10 text-coral-300'}">{segment.text}</mark
                    >{#if firstSpans.has(`${line}:${index}`)}<sup
                        class="ml-1 font-sans text-[0.65rem] font-bold text-coral-400">{number(segment.note)}</sup
                      >{/if}{:else}<span class="text-fg-muted">{segment.text}</span>{/if}{/each}</span
              >{/each}</code
          ></pre>
      </WindowFrame>
    </div>
  </Container>
</section>
