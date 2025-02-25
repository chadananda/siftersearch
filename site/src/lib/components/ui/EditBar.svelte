<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  const { item, onSave, onClose } = $props();
  
  let isDirty = $state(false);
  let editedItem = $state(item ? { ...item } : null);

  function handleSave() {
    dispatch('save', editedItem);
    onSave(editedItem);
  }

  function handleCancel() {
    dispatch('cancel');
    onClose();
  }

  function handleInput(event) {
    const { name, value } = event.target;
    editedItem[name] = value;
    isDirty = true;
  }
</script>

<aside class="fixed right-0 top-16 bottom-0 w-80 border-l shadow-lg transform transition-transform duration-200 ease-in-out {item ? 'translate-x-0' : 'translate-x-full'} z-40">
  {#if item}
    <div class="h-full flex flex-col bg-surface">
      <div class="px-4 py-3 border-b flex justify-between items-center">
        <h2 class="text-lg font-medium">Edit {item.type || 'Item'}</h2>
        <button
          click={handleCancel}
          class="p-2 rounded-lg hover:bg-tertiary"
          aria-label="Close edit panel"
        >
          <svg class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        <div class="space-y-4">
          {#if editedItem}
            {#each Object.entries(editedItem) as [key, value]}
              {#if key !== 'id' && key !== 'type'}
                <div class="space-y-1">
                  <label for={key} class="block text-sm font-medium text-text-secondary mb-1">{key.charAt(0).toUpperCase() + key.slice(1)}</label>
                  <input
                    type="text"
                    id={key}
                    name={key}
                    value={value}
                    input={handleInput}
                    class="w-full px-3 py-2 rounded-lg bg-surface-2 border border-surface-3 focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                </div>
              {/if}
            {/each}
          {/if}
        </div>
      </div>

      <div class="px-4 py-3 border-t">
        <div class="flex justify-end space-x-3">
          <button
            click={handleCancel}
            class="px-4 py-2 rounded-lg border hover:bg-tertiary"
          >
            Cancel
          </button>
          <button
            click={handleSave}
            disabled={!isDirty}
            class="px-4 py-2 rounded-lg text-white {isDirty ? 'bg-accent hover:bg-accent-hover' : 'bg-accent/50 cursor-not-allowed'}"
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
