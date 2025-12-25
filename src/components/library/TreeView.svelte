<script>
  import { createEventDispatcher } from 'svelte';

  let { religions = [], selectedReligion = null, selectedCollection = null } = $props();

  const dispatch = createEventDispatcher();

  // Track expanded religions
  let expandedReligions = $state({});

  function toggleReligion(religionName) {
    expandedReligions = {
      ...expandedReligions,
      [religionName]: !expandedReligions[religionName]
    };
  }

  function selectReligion(religionName) {
    dispatch('select', { religion: religionName, collection: null });
  }

  function selectCollection(religionName, collectionName) {
    dispatch('select', { religion: religionName, collection: collectionName });
  }

  function selectAll() {
    dispatch('select', { religion: null, collection: null });
  }

  // Auto-expand selected religion
  $effect(() => {
    if (selectedReligion && !expandedReligions[selectedReligion]) {
      expandedReligions = { ...expandedReligions, [selectedReligion]: true };
    }
  });
</script>

<div class="tree-view">
  <!-- All documents -->
  <button
    class="tree-item all-docs"
    class:selected={!selectedReligion && !selectedCollection}
    onclick={selectAll}
  >
    <svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
    <span class="tree-label">All Documents</span>
  </button>

  <!-- Religion nodes -->
  {#each religions as religion}
    <div class="tree-node">
      <div class="tree-row">
        <button
          class="tree-expander"
          onclick={() => toggleReligion(religion.name)}
          aria-expanded={expandedReligions[religion.name]}
        >
          <svg class="expander-icon" class:expanded={expandedReligions[religion.name]} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
        <button
          class="tree-item religion"
          class:selected={selectedReligion === religion.name && !selectedCollection}
          onclick={() => selectReligion(religion.name)}
        >
          <svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span class="tree-label">{religion.name}</span>
          <span class="tree-count">{religion.count}</span>
        </button>
      </div>

      <!-- Collections (nested) -->
      {#if expandedReligions[religion.name] && religion.collections?.length > 0}
        <div class="tree-children">
          {#each religion.collections as collection}
            <button
              class="tree-item collection"
              class:selected={selectedReligion === religion.name && selectedCollection === collection.name}
              onclick={() => selectCollection(religion.name, collection.name)}
            >
              <svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <span class="tree-label">{collection.name}</span>
              <span class="tree-count">{collection.count}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .tree-view {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .tree-node {
    margin-bottom: 0.125rem;
  }

  .tree-row {
    display: flex;
    align-items: center;
  }

  .tree-expander {
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: 0.25rem;
    flex-shrink: 0;
  }

  .tree-expander:hover {
    background: var(--hover-overlay);
    color: var(--text-primary);
  }

  .expander-icon {
    width: 0.875rem;
    height: 0.875rem;
    transition: transform 0.15s ease;
  }

  .expander-icon.expanded {
    transform: rotate(90deg);
  }

  .tree-item {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    background: none;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .tree-item:hover {
    background: var(--hover-overlay);
    color: var(--text-primary);
  }

  .tree-item.selected {
    background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
    color: var(--accent-primary);
  }

  .tree-item.all-docs {
    margin-bottom: 0.5rem;
    padding-left: 2rem;
  }

  .tree-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .tree-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tree-count {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted);
    background: var(--surface-2);
    padding: 0.125rem 0.375rem;
    border-radius: 0.75rem;
    min-width: 1.25rem;
    text-align: center;
  }

  .tree-item.selected .tree-count {
    background: var(--accent-primary);
    color: white;
  }

  .tree-children {
    padding-left: 1.5rem;
    margin-top: 0.125rem;
  }

  .tree-item.collection {
    padding-left: 0.5rem;
  }
</style>
