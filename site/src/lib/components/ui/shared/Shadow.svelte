<script>
  const { direction = 'bottom' } = $props();
</script>

<div class="absolute inset-0 pointer-events-none">
  {#if direction === 'bottom'}
    <div class="absolute left-0 right-0 bottom-0 h-2 bg-gradient-to-t from-[var(--shadow-color)] to-transparent backdrop-blur-[1px]" />
  {:else if direction === 'top'}
    <div class="absolute left-0 right-0 top-0 h-2 bg-gradient-to-b from-[var(--shadow-color)] to-transparent backdrop-blur-[1px]" />
  {:else if direction === 'right'}
    <div class="absolute top-0 bottom-0 right-0 w-2 bg-gradient-to-l from-[var(--shadow-color)] to-transparent backdrop-blur-[1px]" />
  {/if}
</div>
