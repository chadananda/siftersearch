<script>
  import { createEventDispatcher } from 'svelte';

  let { religions = [], selectedReligion = null, selectedCollection = null } = $props();

  const dispatch = createEventDispatcher();

  // Accordion: only one religion expanded at a time
  let expandedReligion = $state(null);

  function toggleReligion(religionName) {
    // Accordion behavior: collapse if same, otherwise expand new one
    expandedReligion = expandedReligion === religionName ? null : religionName;
  }

  function selectReligion(religion) {
    dispatch('select', {
      religion: religion.name,
      collection: null,
      node: {
        node_type: 'religion',
        name: religion.name,
        slug: religion.slug
      }
    });
  }

  function selectCollection(religion, collection) {
    dispatch('select', {
      religion: religion.name,
      collection: collection.name,
      node: {
        node_type: 'collection',
        name: collection.name,
        slug: collection.slug,
        religionSlug: religion.slug,
        religionName: religion.name
      }
    });
  }

  // Auto-expand selected religion
  $effect(() => {
    if (selectedReligion && expandedReligion !== selectedReligion) {
      expandedReligion = selectedReligion;
    }
  });
</script>

<div class="tree-view">
  {#each religions as religion}
    <div class="religion-section">
      <!-- Religion bar - full width, clickable -->
      <button
        class="religion-bar"
        class:expanded={expandedReligion === religion.name}
        class:selected={selectedReligion === religion.name && !selectedCollection}
        onclick={() => {
          toggleReligion(religion.name);
          selectReligion(religion);
        }}
      >
        <span class="religion-name">{religion.name}</span>
        <span class="religion-count">{religion.count.toLocaleString()}</span>
      </button>

      <!-- Collections (pills) -->
      {#if expandedReligion === religion.name && religion.collections?.length > 0}
        <div class="collection-list">
          {#each religion.collections as collection}
            <button
              class="collection-pill"
              class:selected={selectedReligion === religion.name && selectedCollection === collection.name}
              onclick={() => selectCollection(religion, collection)}
            >
              <span class="collection-name">{collection.name}</span>
              <span class="collection-count">{collection.count}</span>
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
    padding: 0.5rem 0;
  }

  .religion-section {
    margin-bottom: 0.25rem;
  }

  /* Religion bar - full width, solid background */
  .religion-bar {
    width: 100%;
    padding: 0.625rem 1rem;
    background: var(--surface-2);
    border: none;
    border-left: 3px solid var(--accent-primary);
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    transition: all 0.15s ease;
    text-align: left;
  }

  .religion-bar:hover {
    background: var(--surface-3);
  }

  .religion-bar.expanded {
    background: var(--accent-primary);
    color: white;
    border-left-color: var(--accent-primary);
  }

  .religion-bar.selected:not(.expanded) {
    background: color-mix(in srgb, var(--accent-primary) 20%, var(--surface-2));
  }

  .religion-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .religion-count {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.5rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.15);
    min-width: 2.5rem;
    text-align: center;
  }

  .religion-bar:not(.expanded) .religion-count {
    background: var(--surface-3);
    color: var(--text-muted);
  }

  /* Collection pills */
  .collection-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: var(--surface-1);
    border-left: 3px solid color-mix(in srgb, var(--accent-primary) 30%, transparent);
  }

  .collection-pill {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    background: var(--surface-2);
    border: 1px solid var(--border-subtle);
    border-radius: 1rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .collection-pill:hover {
    background: var(--surface-3);
    color: var(--text-primary);
    border-color: var(--border-default);
  }

  .collection-pill.selected {
    background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
    color: var(--accent-primary);
    border-color: var(--accent-primary);
  }

  .collection-name {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .collection-count {
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.0625rem 0.375rem;
    border-radius: 0.5rem;
    background: var(--surface-3);
    color: var(--text-muted);
  }

  .collection-pill.selected .collection-count {
    background: var(--accent-primary);
    color: white;
  }
</style>
