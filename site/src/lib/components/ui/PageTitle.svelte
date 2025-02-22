<script>
  export let title = '';
  export let subtitle = '';
</script>

<div class="mb-6">
  <h1 class="text-2xl font-semibold text-text-primary">{title}</h1>
  {#if subtitle}
    <p class="mt-1 text-text-secondary">{subtitle}</p>
  {/if}
</div>
