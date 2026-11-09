<!-- n8n-style flow canvas for one Anís strategy (xyflow + dagre via src/lib/strategy-canvas.js). Fetches the edge-cached public
     /api/v1/anis/strategies by `name` (or takes `strategy`+`steps`), lazy when inside a closed <details>. Node click → popup tabs
     Prompt · Params · Stats · Samples · Feedback. `run` = {path,values} lights a path; `samples`/`feedback` are the hooks for the run trace. -->
<script>
  import { onMount } from 'svelte';
  import { SvelteFlow, Background, Controls, MiniMap } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import StepNode from './StepNode.svelte';
  import EndNode from './EndNode.svelte';
  import { buildFlow } from '../../lib/strategy-canvas.js';
  import { fmt } from '../../lib/anis-docs.js';
  let { name = '', strategy: strategyProp = null, steps: stepsProp = null, run = null, samples = null, feedback = null, height = '460px' } = $props();
  const nodeTypes = { step: StepNode, end: EndNode };
  const API = import.meta.env.PUBLIC_API_URL ?? 'https://api.siftersearch.com';
  let root = $state(), data = $state(null), failed = $state(false), nodes = $state.raw([]), edges = $state.raw([]), picked = $state(null), tab = $state('prompt');
  const TABS = [['prompt', 'Prompt'], ['params', 'Params'], ['stats', 'Stats'], ['samples', 'Samples'], ['feedback', 'Feedback']];
  const strategy = $derived(strategyProp || data?.strategies?.find((s) => s.id === name || s.name === name) || null);
  const steps = $derived(stepsProp || data?.steps || []);
  $effect(() => {
    if (!strategy?.graph) { nodes = []; edges = []; return; }
    const f = buildFlow(strategy.graph, { steps, branches: strategy.branches || [], strategies: data?.strategies || [], run });
    nodes = f.nodes; edges = f.edges;
  });
  const load = async () => {
    if (strategyProp || data) return;
    try { const r = await fetch(`${API}/api/v1/anis/strategies`); if (!r.ok) throw new Error(r.status); data = await r.json(); } catch { failed = true; }
  };
  onMount(() => {
    const d = root?.closest('details');
    if (!d || d.open) return void load();
    const on = () => { if (d.open) { load(); d.removeEventListener('toggle', on); } };
    d.addEventListener('toggle', on);
    return () => d.removeEventListener('toggle', on);
  });
  const pick = ({ node }) => { if (node.type !== 'step') return; picked = node.data; tab = 'prompt'; };
  const edgesOf = (id) => (strategy?.graph?.edges || []).filter((e) => e.from === id);
</script>

<div bind:this={root} class="relative w-full rounded-lg border border-border bg-surface-0" style="height:{height}">
  {#if failed}<p class="p-4 text-muted">The strategy graph could not be loaded.</p>
  {:else if !strategy?.graph}<p class="p-4 text-muted">{data ? 'This strategy has no graph yet.' : 'Loading the graph…'}</p>
  {:else}
    <SvelteFlow bind:nodes bind:edges {nodeTypes} fitView minZoom={0.2} nodesDraggable={false} nodesConnectable={false} onnodeclick={pick} proOptions={{ hideAttribution: true }}>
      <Background /><Controls showLock={false} />
      {#if nodes.length > 12}<MiniMap />{/if}
    </SvelteFlow>
  {/if}
  {#if picked}
    <aside class="absolute right-0 top-0 bottom-0 w-[min(380px,100%)] overflow-auto border-l border-border bg-surface-1 p-3 text-sm shadow-lg z-10">
      <div class="flex items-center gap-2">
        <h4 class="m-0 font-semibold text-primary">{picked.title}</h4>
        <span class="rounded bg-surface-3 px-1.5 text-xs text-secondary">{picked.kind}</span>
        <button class="ml-auto text-muted hover:text-primary" aria-label="Close" onclick={() => (picked = null)}>&times;</button>
      </div>
      <div class="my-2 flex gap-1 border-b border-border">
        {#each TABS as [k, l]}<button class="px-2 py-1 text-xs {tab === k ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-primary'}" onclick={() => (tab = k)}>{l}</button>{/each}
      </div>
      {#if tab === 'prompt'}
        <p class="text-secondary">{picked.description || 'No description for this step.'}</p>
        {#if picked.kind === 'Jev' || picked.kind === 'LLM'}<p class="text-muted">Runs on the {picked.kind === 'Jev' ? 'fast decision model (Jev)' : 'language model'}. The prompt text is code, not published here.</p>{/if}
        {#if edgesOf(picked.id).length}<p class="mt-2 mb-1 text-muted">Options (exits)</p><ul class="m-0 pl-4 text-secondary">{#each edgesOf(picked.id) as e}<li>{e.on === '*' ? 'then' : e.on} &rarr; {e.to === '$end' ? 'end' : e.to}</li>{/each}</ul>{/if}
      {:else if tab === 'params'}
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-secondary">
          <dt class="text-muted">Node</dt><dd>{picked.id}</dd><dt class="text-muted">Step</dt><dd>{picked.step}</dd><dt class="text-muted">Activity</dt><dd>{picked.activity}</dd>
          {#if picked.tools.length}<dt class="text-muted">Tools</dt><dd>{picked.tools.join(', ')}</dd>{/if}
          {#if picked.template}<dt class="text-muted">Template</dt><dd>{picked.template.id}@{picked.template.version}</dd>{/if}
          {#if picked.reads.length}<dt class="text-muted">Reads</dt><dd>{picked.reads.join(', ')}</dd>{/if}
          {#if picked.writes.length}<dt class="text-muted">Writes</dt><dd>{picked.writes.join(', ')}</dd>{/if}
        </dl>
      {:else if tab === 'stats'}
        {#if picked.live}
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-secondary"><dt class="text-muted">Runs (7 d)</dt><dd>{fmt.n(picked.live.runs)}</dd><dt class="text-muted">p50</dt><dd>{fmt.ms(picked.live.p50_ms)}</dd><dt class="text-muted">Cost</dt><dd>{fmt.usd(picked.live.usd)}</dd></dl>
          <p class="mt-2 text-muted">Errors are not yet measured per step.</p>
        {:else}<p class="text-muted">No runs measured for this step yet.</p>{/if}
      {:else if tab === 'samples'}
        {#if samples?.[picked.id]?.length}<ul class="m-0 pl-4 text-secondary">{#each samples[picked.id] as s}<li>{typeof s === 'string' ? s : JSON.stringify(s)}</li>{/each}</ul>
        {:else}<p class="text-muted">No run trace yet.</p>{/if}
      {:else}
        {#if feedback?.[picked.id]?.length}<ul class="m-0 pl-4 text-secondary">{#each feedback[picked.id] as s}<li>{typeof s === 'string' ? s : JSON.stringify(s)}</li>{/each}</ul>
        {:else}<p class="text-muted">No run trace yet.</p>{/if}
      {/if}
    </aside>
  {/if}
</div>

<style>
  /* xyflow theme variables → the site's semantic tokens (light-dark aware) */
  div :global(.svelte-flow) {
    --xy-background-color: var(--surface-0); --xy-edge-stroke: var(--text-muted); --xy-edge-label-color: var(--text-secondary);
    --xy-edge-label-background-color: var(--surface-1); --xy-controls-button-background-color: var(--surface-1);
    --xy-controls-button-color: var(--text-primary); --xy-controls-button-border-color: var(--border);
    --xy-minimap-background-color: var(--surface-1); --xy-node-background-color: transparent; --xy-node-border: none;
    --xy-handle-background-color: var(--text-muted); --xy-attribution-background-color: transparent;
  }
  div :global(.svelte-flow__node) { padding: 0; border: 0; background: transparent; }
</style>
