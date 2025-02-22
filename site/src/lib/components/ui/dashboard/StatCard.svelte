<script>
  export let title = '';
  export let value = '';
  export let change = null;
  export let icon = null;
</script>

<div class="bg-surface-2 rounded-lg p-6 border border-border-subtle">
  <div class="flex items-center justify-between">
    <div>
      <p class="text-sm font-medium text-text-secondary mb-1">{title}</p>
      <p class="text-2xl font-semibold text-text-primary">{value}</p>
      
      {#if change !== null}
        <p class="mt-2 flex items-center text-sm">
          <span class={change >= 0 ? 'text-success' : 'text-error'}>
            {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
          </span>
          <span class="text-text-tertiary ml-2">from last month</span>
        </p>
      {/if}
    </div>
    
    {#if icon}
      <div class="p-3 rounded-lg bg-surface-3">
        <svg class="w-6 h-6 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={icon} />
        </svg>
      </div>
    {/if}
  </div>
</div>

<style>
  .text-text-secondary {
    color: var(--text-text-secondary);
  }

  .text-text-tertiary {
    color: var(--text-text-tertiary);
  }

  .text-text-primary {
    color: var(--text-text-primary);
  }

  .bg-surface-2 {
    background-color: var(--bg-surface-2);
  }

  .bg-surface-3 {
    background-color: var(--bg-surface-3);
  }

  .border-border-subtle {
    border-color: var(--border-border-subtle);
  }

  .text-success {
    color: var(--color-success);
  }

  .text-error {
    color: var(--color-error);
  }
</style>
