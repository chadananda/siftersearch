<script>
  export let padding = true;
  export let hover = false;
</script>

<div 
  class="bg-surface-2 rounded-lg border border-subtle shadow-sm {padding ? 'p-6' : ''} {hover ? 'transition-shadow hover:shadow-md' : ''}"
>
  <slot />
</div>
