<script>
  import ReligionIcon from './ReligionIcon.svelte';
  // Props
  let { religion = '' } = $props();

  // State
  let stats = $state(null);
  let loading = $state(false);
  let error = $state(false);

  // Derived: religion-specific stats
  let religionStats = $derived(() => {
    if (!stats || !religion) return null;
    const slug = religion.toLowerCase().replace("'", '').replace(/\s+/g, '-');
    return stats[slug] ?? stats[religion] ?? null;
  });

  // Derived: top 3 entities
  let topEntities = $derived(() => {
    const rs = religionStats();
    if (!rs?.top_entities) return [];
    return rs.top_entities.slice(0, 3);
  });

  $effect(() => {
    if (!religion) return;
    loading = true;
    error = false;
    fetch('/api/graph/stats')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { stats = d; })
      .catch(() => { error = true; })
      .finally(() => { loading = false; });
  });
</script>

<div class="graph-summary">
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Loading…</span>
    </div>
  {:else if error || !religionStats()}
    <div class="empty-state">
      <span class="empty-icon">&#9741;</span>
      <p>Graph data not available</p>
    </div>
  {:else}
    <div class="summary-content">
      <div class="summary-header">
        <div class="summary-title flex items-center gap-1.5">
          <ReligionIcon {religion} size="sm" />
          Knowledge Graph
        </div>
        <div class="entity-count">
          <strong>{religionStats().entity_count ?? 0}</strong>
          <span>entities</span>
        </div>
      </div>
      {#if topEntities().length > 0}
        <div class="top-entities">
          <div class="top-label">Top entities</div>
          <ul>
            {#each topEntities() as entity}
              <li>
                <span class="entity-name">{entity.name ?? entity}</span>
                {#if entity.type}
                  <span class="entity-type">{entity.type}</span>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      <a
        href="/library/graph?religion={encodeURIComponent(religion)}"
        class="explore-link"
      >Explore graph &rarr;</a>
    </div>
  {/if}
</div>

<style>
  .graph-summary {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    padding: 0.875rem 1rem;
    min-height: 4rem;
  }
  .loading-state {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .empty-state {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .empty-icon { font-size: 1rem; opacity: 0.5; }
  .empty-state p { margin: 0; }
  .summary-content { display: flex; flex-direction: column; gap: 0.5rem; }
  .summary-header { display: flex; align-items: baseline; justify-content: space-between; }
  .summary-title { font-size: 0.75rem; font-weight: 600; color: var(--text-primary); }
  .entity-count { display: flex; align-items: baseline; gap: 0.25rem; }
  .entity-count strong { font-size: 1.25rem; color: var(--accent-primary); font-weight: 700; }
  .entity-count span { font-size: 0.7rem; color: var(--text-muted); }
  .top-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .top-entities ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.125rem; }
  .top-entities li { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .entity-name { font-size: 0.78rem; color: var(--text-secondary); }
  .entity-type {
    font-size: 0.65rem;
    color: var(--text-muted);
    background: var(--surface-2);
    padding: 0.0625rem 0.375rem;
    border-radius: 1rem;
  }
  .explore-link {
    display: inline-block;
    font-size: 0.78rem;
    color: var(--accent-primary);
    text-decoration: none;
    font-weight: 500;
    margin-top: 0.125rem;
  }
  .explore-link:hover { text-decoration: underline; }
</style>
