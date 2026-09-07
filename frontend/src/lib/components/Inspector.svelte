<script lang="ts">
  import { isDanglingCredential } from '../credentials'
  import { targetProblem } from '../environments'
  import { isDelayNode, isForNode, isHttpNode, isMockNode, isRunnableNode, isTransformNode } from '../model'
  import { nodeTarget } from '../requestEditor'
  import { app } from '../state.svelte'
  import { methodBadge } from '../ui'
  import CredentialOptions from './CredentialOptions.svelte'
  import EnvironmentOptions from './EnvironmentOptions.svelte'
  import Icon from './Icon.svelte'
  import DelaySection from './inspector/DelaySection.svelte'
  import ForSection from './inspector/ForSection.svelte'
  import MockSection from './inspector/MockSection.svelte'
  import NameKeySection from './inspector/NameKeySection.svelte'
  import OutputsSection from './inspector/OutputsSection.svelte'
  import RequestSection from './inspector/RequestSection.svelte'
  import RequestTargetSection from './inspector/RequestTargetSection.svelte'
  import ResponseSchemaSection from './inspector/ResponseSchemaSection.svelte'
  import TransformSection from './inspector/TransformSection.svelte'
  import Button from './ui/Button.svelte'
  import Field from './ui/Field.svelte'
  import IconButton from './ui/IconButton.svelte'
  import Select from './ui/Select.svelte'

  // http and transform nodes get an inspector; notes edit inline on the card.
  const node = $derived(
    app.selectedNode && isRunnableNode(app.selectedNode) ? app.selectedNode : null,
  )
  const danglingCredential = $derived(
    !!node &&
      isHttpNode(node) &&
      isDanglingCredential(app.credentials, node.data.credential),
  )
  // Said at edit time so the node is not left to fail at run time for a
  // reason only the log explains; W2's engine error remains the backstop.
  const noTarget = $derived(
    node && isHttpNode(node) ? targetProblem(app.environments, node.data) : null,
  )
</script>

{#if node}
  <aside class="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-zinc-800 bg-surface">
    <div class="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
      {#if isHttpNode(node)}
        <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold {methodBadge[node.data.method]}">{node.data.method}</span>
        <span class="truncate font-mono text-[11px] text-zinc-400">{node.data.path}</span>
      {:else if isTransformNode(node)}
        <span class="flex items-center rounded bg-violet-500/15 px-1 py-0.5 text-violet-300">
          <Icon name="function" size={13} />
        </span>
        <span class="truncate font-mono text-[11px] text-zinc-400">transform step</span>
      {:else if isForNode(node)}
        <span class="flex items-center rounded bg-emerald-500/15 px-1 py-0.5 text-emerald-300">
          <Icon name="laps" size={13} />
        </span>
        <span class="truncate font-mono text-[11px] text-zinc-400">for loop</span>
      {:else}
        <span class="truncate font-mono text-[11px] text-zinc-400">{node.type} node</span>
      {/if}
      <IconButton
        icon="close"
        class="ml-auto"
        onclick={() => (app.selectedNodeId = null)}
        title="Close inspector"
        label="Close inspector"
      />
    </div>

    <div class="flex-1 space-y-4 p-3">
      <NameKeySection {node} />

      {#if isHttpNode(node)}
        <RequestTargetSection {node} />

        <div class="grid grid-cols-2 gap-2">
          <Field label="Environment">
            <Select
              surface="raised"
              class="mt-1 w-full"
              value={node.data.environment}
              aria-label="Environment"
              onchange={(e) => app.updateNodeData(node.id, { environment: e.currentTarget.value })}
            >
              <EnvironmentOptions current={node.data.environment} />
            </Select>
          </Field>
          <Field label="Credential">
            <Select
              surface="raised"
              class="mt-1 w-full"
              value={node.data.credential}
              aria-label="Credential"
              onchange={(e) => app.updateNodeData(node.id, { credential: e.currentTarget.value })}
            >
              <CredentialOptions current={node.data.credential} />
            </Select>
          </Field>
        </div>

        {#if noTarget}
          <p class="flex items-start gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-300">
            <Icon name="warning" size={12} />
            <span>{noTarget}</span>
          </p>
        {/if}

        {#if danglingCredential}
          <p class="flex items-start gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-300">
            <Icon name="warning" size={12} />
            <span>
              credential <span class="font-mono">{node.data.credential}</span> no longer exists —
              runs will fail until you pick another one or None
            </span>
          </p>
        {/if}

        <RequestSection target={nodeTarget(node)} />

        <OutputsSection {node} />

        <ResponseSchemaSection {node} />
      {:else if isTransformNode(node)}
        <TransformSection {node} />

        <OutputsSection {node} />
      {:else if isMockNode(node)}
        <MockSection {node} />

        <OutputsSection {node} />
      {:else if isDelayNode(node)}
        <DelaySection {node} />

        <OutputsSection {node} />
      {:else if isForNode(node)}
        <ForSection {node} />

        <OutputsSection {node} />
      {/if}
    </div>

    <div class="mt-auto border-t border-zinc-800 p-3">
      <Button variant="danger" class="w-full" onclick={() => app.removeNodeRequest(node.id)} title="Delete node">
        <Icon name="delete" size={14} />
        Delete node
      </Button>
    </div>
  </aside>
{/if}
