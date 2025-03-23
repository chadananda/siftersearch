<script>
  // Simplified auth layout that just renders the content
  let { children } = $props();
</script>

<div class="min-h-screen bg-surface">
  {@render children?.()}
</div>
