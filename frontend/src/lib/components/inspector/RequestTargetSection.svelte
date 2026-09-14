<script lang="ts">
  import { libraryLinkState, updateCollectionRequestFromNode } from '../../library'
  import { HTTP_METHODS, isHttpMethod, type HttpNode } from '../../model'
  import { urlHost } from '../../request'
  import { app } from '../../state.svelte'
  import { methodText } from '../../ui'
  import Icon from '../Icon.svelte'
  import { FIELD_LABEL } from '../ui/classes'
  import IconButton from '../ui/IconButton.svelte'
  import Input from '../ui/Input.svelte'
  import Select from '../ui/Select.svelte'

  let { node }: { node: HttpNode } = $props()

  // Binding-blind divergence hint (plan 08 B3): only shows when the node's
  // shape actually moved away from its library request — a clean or unlinked
  // node renders nothing.
  const linkState = $derived(libraryLinkState(app.collections, node.data))

  // The origin input keeps a local draft so half-typed URLs show a hint
  // without clobbering the stored (always-valid) origin. The draft is an
  // override keyed by node id, so switching nodes falls back to that node's
  // stored origin with no reset effect.
  let draft = $state<{ nodeId: string; value: string; error: string | null; open: boolean } | null>(
    null,
  )

  const forNode = $derived(draft?.nodeId === node.id ? draft : null)
  const originDraft = $derived(forNode ? forNode.value : (node.data.origin ?? ''))
  const originError = $derived(forNode?.error ?? null)
  const showOrigin = $derived((forNode?.open ?? false) || !!node.data.origin || originDraft !== '')

  function commitOrigin(raw: string) {
    draft = { nodeId: node.id, value: raw, error: app.setNodeOrigin(node.id, raw), open: true }
  }

  function toggleOrigin() {
    draft = { nodeId: node.id, value: originDraft, error: originError, open: !showOrigin }
  }

  // Cross-origin credential warning (plan 08 A1): a credential is injected
  // wherever the node points — deliberately — so the protection is making
  // "this secret leaves the environment's host" impossible to miss.
  const envHost = $derived(
    urlHost(app.environments.find((e) => e.name === node.data.environment)?.baseUrl ?? ''),
  )
  const originHost = $derived(node.data.origin ? urlHost(node.data.origin) : null)
  const crossOriginCredential = $derived(
    node.data.credential !== '' && !!originHost && !!envHost && originHost !== envHost,
  )
</script>

<div>
  <span class={FIELD_LABEL}>Request</span>
  <div class="mt-1 flex items-center gap-1.5">
    <Select
      size="dense"
      surface="raised"
      class="shrink-0 font-semibold {methodText[node.data.method]}"
      value={node.data.method}
      aria-label="HTTP method"
      onchange={(e) => {
        const method = e.currentTarget.value
        if (isHttpMethod(method)) app.updateNodeData(node.id, { method })
      }}
    >
      {#each HTTP_METHODS as method (method)}
        <option value={method}>{method}</option>
      {/each}
    </Select>
    <Input
      size="dense"
      surface="raised"
      mono
      class="min-w-0 flex-1"
      value={node.data.path}
      placeholder="/v1/users/{'{id}'}"
      aria-label="Request path"
      oninput={(e) => app.updateNodeData(node.id, { path: e.currentTarget.value })}
    />
    <IconButton
      icon="public"
      tone={showOrigin ? 'info' : 'default'}
      onclick={toggleOrigin}
      title="Origin override — call a different host than the environment"
      label="Toggle origin override"
    />
  </div>

  {#if showOrigin}
    <Input
      size="dense"
      surface="raised"
      mono
      tone={originError ? 'error' : 'default'}
      class="mt-1.5 w-full"
      value={originDraft}
      placeholder="origin override, e.g. https://api.other-service.io"
      aria-label="Origin override"
      oninput={(e) => commitOrigin(e.currentTarget.value)}
    />
    {#if originError}
      <p class="mt-1 text-[10px] text-rose-400">{originError}</p>
    {:else if node.data.origin}
      <p class="mt-1 text-[10px] text-zinc-600">
        overrides the <span class="text-zinc-400">{node.data.environment}</span> base URL for this node
      </p>
    {/if}
  {/if}

  {#if crossOriginCredential}
    <p class="mt-1.5 flex items-start gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-300">
      <Icon name="warning" size={12} />
      <span>
        credential <span class="font-mono">{node.data.credential}</span> will be sent to
        <span class="font-mono">{originHost}</span>, not the <span class="font-mono">{node.data.environment}</span> host
      </span>
    </p>
  {/if}

  {#if linkState === 'diverged'}
    <p class="mt-1.5 flex items-center gap-1 text-[10px] text-zinc-500">
      <Icon name="library_books" size={12} />
      differs from its library request
      <button
        class="ml-auto rounded px-1.5 py-0.5 text-[10px] text-sky-300 hover:bg-zinc-800"
        onclick={() => updateCollectionRequestFromNode(app, node.id)}
        title="Push this node's method, URL and fields back onto the collection request"
      >
        Update library
      </button>
    </p>
  {/if}
</div>
