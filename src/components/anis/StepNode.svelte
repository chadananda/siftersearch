<!-- xyflow card for one strategy step: title, kind chip, tool, an in row (reads) and an out row (writes). Decision steps are diamond-accented; lit/dim for run overlay. -->
<script>
  import { Handle, Position } from '@xyflow/svelte';
  let { data } = $props();
</script>

<div class="w-[280px] h-[96px] rounded-lg border px-3 py-2 text-left text-xs overflow-hidden cursor-pointer transition-opacity
  {data.decision ? 'border-warning bg-surface-2 border-2' : 'border-border bg-surface-1'} {data.state === 'dim' ? 'opacity-35' : ''} {data.state === 'lit' ? 'ring-2 ring-accent' : ''}">
  <Handle type="target" position={Position.Left} />
  <div class="flex items-center gap-1.5">
    {#if data.entry}<span class="text-accent" title="entry">&#9654;</span>{/if}
    {#if data.decision}<span class="text-warning" title="decision">&#9670;</span>{/if}
    <span class="font-semibold text-primary truncate">{data.title}</span>
    <span class="ml-auto rounded px-1.5 py-0.5 bg-surface-3 text-secondary shrink-0">{data.kind}</span>
  </div>
  <div class="mt-0.5 text-muted truncate">{#if data.hand}hands to <a class="text-accent" href="#strategy-{data.hand.id}" onclick={(e) => e.stopPropagation()}>{data.hand.name}</a>{:else if data.tool}tool: <span class="text-secondary">{data.tool}</span>{:else}{data.step}{/if}</div>
  {#if data.reads.length || data.writes.length}
    {#if data.reads.length}<div class="mt-1 flex items-center gap-1 text-muted overflow-hidden whitespace-nowrap" title={data.reads.join(', ')}>
      <span class="shrink-0">in</span>{#each data.reads.slice(0, 3) as r}<span class="shrink-0 rounded bg-surface-3 px-1">{r}</span>{/each}
    </div>{/if}
    {#if data.writes.length}<div class="mt-0.5 flex items-center gap-1 text-muted overflow-hidden whitespace-nowrap" title={data.writes.join(', ')}>
      <span class="shrink-0">out</span>{#each data.writes.slice(0, 3) as w}<span class="shrink-0 rounded bg-surface-3 px-1 text-secondary">{w}</span>{/each}
    </div>{/if}
  {/if}
  <Handle type="source" position={Position.Right} />
</div>
