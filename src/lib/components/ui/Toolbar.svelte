<script>
  let title = $state('');
  let breadcrumbs = $state([]);
  let children = $props();
</script>

<div class="border-b sticky top-16 z-30 bg-surface-3">
  <div class="px-6 py-4">
    <!-- Breadcrumbs -->
    {#if breadcrumbs.length > 0}
      <div class="flex items-center space-x-2 text-sm mb-2">
        {#each breadcrumbs as crumb, i}
          {#if i > 0}
            <svg class="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          {/if}
          <a
            href={crumb.href}
            class="hover:text-accent {i === breadcrumbs.length - 1 ? 'text-primary' : 'text-primary'}"
          >
            {crumb.text}
          </a>
        {/each}
      </div>
    {/if}

    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold text-primary">{title}</h1>
      <div class="flex items-center space-x-3">
        {@render children()}
      </div>
    </div>
  </div>
</div>

<style>
  /* Empty style block */
</style>
