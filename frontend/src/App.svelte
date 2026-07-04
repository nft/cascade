<script lang="ts">
  import { Greet } from '../wailsjs/go/main/App.js'

  let name = $state('')
  let resultText = $state('Enter a name to test the Go bridge 👇')

  async function greet(): Promise<void> {
    resultText = await Greet(name)
  }
</script>

<main class="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-100">
  <h1 class="text-4xl font-semibold tracking-tight">Cascade</h1>
  <p class="text-sm text-zinc-400">{resultText}</p>
  <div class="flex gap-2">
    <input
      class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
      autocomplete="off"
      bind:value={name}
      type="text"
    />
    <button
      class="cursor-pointer rounded-md bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white"
      onclick={greet}
    >
      Greet
    </button>
  </div>
</main>
