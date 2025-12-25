<script>
  import { createEventDispatcher } from 'svelte';

  let { filters = $bindable(), stats = null } = $props();

  const dispatch = createEventDispatcher();

  // Get unique values from stats
  let religions = $derived(stats?.religionCounts ? Object.keys(stats.religionCounts).sort() : []);
  let collections = $derived(stats?.collectionCounts ? Object.keys(stats.collectionCounts).sort() : []);
  let languages = $derived(stats?.languageCounts ? Object.keys(stats.languageCounts).sort() : []);

  function handleChange() {
    dispatch('change');
  }
</script>

<div class="filter-panel">
  <div class="filter-grid">
    <!-- Religion filter -->
    <div class="filter-group">
      <label class="filter-label">Religion</label>
      <select
        class="filter-select"
        bind:value={filters.religion}
        onchange={handleChange}
      >
        <option value={null}>All religions</option>
        {#each religions as religion}
          <option value={religion}>{religion}</option>
        {/each}
      </select>
    </div>

    <!-- Collection filter -->
    <div class="filter-group">
      <label class="filter-label">Collection</label>
      <select
        class="filter-select"
        bind:value={filters.collection}
        onchange={handleChange}
      >
        <option value={null}>All collections</option>
        {#each collections as collection}
          <option value={collection}>{collection}</option>
        {/each}
      </select>
    </div>

    <!-- Language filter -->
    <div class="filter-group">
      <label class="filter-label">Language</label>
      <select
        class="filter-select"
        bind:value={filters.language}
        onchange={handleChange}
      >
        <option value={null}>All languages</option>
        {#each languages as language}
          <option value={language}>{language}</option>
        {/each}
      </select>
    </div>

    <!-- Author filter -->
    <div class="filter-group">
      <label class="filter-label">Author</label>
      <input
        type="text"
        class="filter-input"
        placeholder="Filter by author..."
        bind:value={filters.author}
        onchange={handleChange}
      />
    </div>

    <!-- Year range -->
    <div class="filter-group year-range">
      <label class="filter-label">Year range</label>
      <div class="year-inputs">
        <input
          type="number"
          class="filter-input year"
          placeholder="From"
          bind:value={filters.yearFrom}
          onchange={handleChange}
        />
        <span class="year-separator">–</span>
        <input
          type="number"
          class="filter-input year"
          placeholder="To"
          bind:value={filters.yearTo}
          onchange={handleChange}
        />
      </div>
    </div>

    <!-- Status filter -->
    <div class="filter-group">
      <label class="filter-label">Status</label>
      <select
        class="filter-select"
        bind:value={filters.status}
        onchange={handleChange}
      >
        <option value="all">All statuses</option>
        <option value="indexed">Indexed</option>
        <option value="processing">Processing</option>
        <option value="unindexed">Not indexed</option>
      </select>
    </div>
  </div>
</div>

<style>
  .filter-panel {
    padding: 1rem;
    background: var(--surface-1);
    border-bottom: 1px solid var(--border-default);
  }

  .filter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 1rem;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .filter-group.year-range {
    min-width: 200px;
  }

  .filter-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .filter-select,
  .filter-input {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
  }

  .filter-select:focus,
  .filter-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 20%, transparent);
  }

  .year-inputs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .filter-input.year {
    width: 80px;
    text-align: center;
  }

  .year-separator {
    color: var(--text-muted);
  }

  @media (max-width: 640px) {
    .filter-grid {
      grid-template-columns: 1fr 1fr;
    }

    .filter-group.year-range {
      grid-column: span 2;
    }
  }
</style>
