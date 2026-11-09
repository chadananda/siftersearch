<!-- xyflow pill for the shared end of a strategy graph ($end). -->
<script>
  import { Handle, Position } from '@xyflow/svelte';
  let { data } = $props();
</script>

<div class="w-[64px] h-[28px] flex items-center justify-center rounded-full border border-border bg-surface-3 text-xs text-secondary {data.state === 'lit' ? 'ring-2 ring-accent' : ''}">
  <Handle type="target" position={Position.Left} />{data.title}
</div>
