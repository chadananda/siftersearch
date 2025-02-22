<script>
  export let title = '';
  export let actions = [];
  export let breadcrumbs = [];
</script>

<div class="border-b sticky top-16 z-30">
  <div class="px-6 py-4">
    <!-- Breadcrumbs -->
    {#if breadcrumbs.length > 0}
      <div class="flex items-center space-x-2 text-sm mb-2">
        {#each breadcrumbs as crumb, i}
          {#if i > 0}
            <svg class="w-4 h-4 text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          {/if}
          <a
            href={crumb.href}
            class="hover:text-primary {i === breadcrumbs.length - 1 ? 'text-primary' : 'text-secondary'}"
          >
            {crumb.text}
          </a>
        {/each}
      </div>
    {/if}

    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{title}</h1>
      
      {#if actions.length > 0}
        <div class="flex items-center space-x-3">
          {#each actions as action}
            <button
              on:click={action.onClick}
              class="px-4 py-2 rounded-lg flex items-center space-x-2 {action.primary ? 'bg-primary text-white hover:brightness-110' : 'border hover:bg-tertiary'}"
            >
              {#if action.icon}
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={action.icon} />
                </svg>
              {/if}
              <span>{action.text}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  div {
    background-color: var(--bg-primary);
    border-color: var(--border-color);
  }

  .text-secondary {
    color: var(--text-secondary);
  }

  .text-tertiary {
    color: var(--text-tertiary);
  }

  button {
    transition: all 0.15s ease-in-out;
  }

  button:not(.bg-primary) {
    color: var(--text-primary);
    border-color: var(--border-color);
  }

  button:hover:not(.bg-primary) {
    background-color: var(--bg-tertiary);
  }
</style>
