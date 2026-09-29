<script lang="ts">
  import WindowFrame from '$components/ui/WindowFrame.svelte'
  import { setDemoRunner } from '$demo/context'
  import { DemoRunner } from '$demo/runner.svelte'
  import { SITE } from '$lib/config/site'
  import { onceVisible, prefersReducedMotion } from '$lib/motion/reveal'
  import DemoCanvas from './DemoCanvas.svelte'
  import DemoLogs from './DemoLogs.svelte'
  import DemoTopBar from './DemoTopBar.svelte'

  // A working replica of the app: the first run plays once the window is
  // mostly on screen, unless the visitor prefers reduced motion.
  const AUTOPLAY_THRESHOLD = 0.4

  let { class: cls = '' }: { class?: string } = $props()

  const runner = new DemoRunner()
  setDemoRunner(runner)
  $effect(() => () => runner.stop())

  function autoplay() {
    if (!prefersReducedMotion()) void runner.run()
  }

  const announcement = $derived(
    runner.running ? 'Running the board.' : runner.runs > 0 ? `Run finished: ${runner.logs.length} requests.` : '',
  )
</script>

<figure class={cls} {@attach onceVisible(autoplay, AUTOPLAY_THRESHOLD)}>
  <p class="sr-only" aria-live="polite">{announcement}</p>
  <WindowFrame title={SITE.name}>
    <DemoTopBar />
    <DemoCanvas />
    <DemoLogs />
  </WindowFrame>
  <figcaption class="mt-4 text-center text-sm text-fg-subtle">
    A working replica of the canvas. Press Run to play it again; nothing leaves this page.
  </figcaption>
</figure>
