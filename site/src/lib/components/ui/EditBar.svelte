<script>
  export let item = null;
  export let onSave = () => {};
  export let onClose = () => {};

  let isDirty = false;
  let editedItem = item ? { ...item } : null;
</script>

<aside class="fixed right-0 top-16 bottom-0 w-80 border-l shadow-lg transform transition-transform duration-200 ease-in-out {item ? 'translate-x-0' : 'translate-x-full'} z-40">
  {#if item}
    <div class="h-full flex flex-col">
      <!-- Header -->
      <div class="px-4 py-3 border-b flex justify-between items-center">
        <h2 class="text-lg font-medium">Edit {item.type || 'Item'}</h2>
        <button
          on:click={onClose}
          class="p-2 rounded-lg hover:bg-tertiary"
          aria-label="Close edit panel"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-4">
        <div class="space-y-4">
          {#if editedItem}
            {#each Object.entries(editedItem) as [key, value]}
              {#if key !== 'id' && key !== 'type'}
                <div class="space-y-1">
                  <label for={key} class="block text-sm font-medium">
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </label>
                  <input
                    type="text"
                    id={key}
                    bind:value={editedItem[key]}
                    on:input={() => isDirty = true}
                    class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary"
                  />
                </div>
              {/if}
            {/each}
          {/if}
        </div>
      </div>

      <!-- Footer -->
      <div class="px-4 py-3 border-t">
        <div class="flex justify-end space-x-3">
          <button
            on:click={onClose}
            class="px-4 py-2 rounded-lg border hover:bg-tertiary"
          >
            Cancel
          </button>
          <button
            on:click={() => onSave(editedItem)}
            disabled={!isDirty}
            class="px-4 py-2 rounded-lg text-white disabled:opacity-50"
            class:bg-primary={isDirty}
            class:hover:brightness-110={isDirty}
            class:bg-gray-400={!isDirty}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  {/if}
</aside>

<style>
  aside {
    background-color: var(--bg-primary);
    border-color: var(--border-color);
  }

  input {
    color: var(--text-primary);
    background-color: var(--bg-primary);
    border-color: var(--border-color);
  }

  input:focus {
    border-color: var(--color-primary);
    outline: none;
  }

  button {
    color: var(--text-primary);
    border-color: var(--border-color);
  }

  button:hover {
    background-color: var(--bg-tertiary);
  }

  label {
    color: var(--text-secondary);
  }
</style>
