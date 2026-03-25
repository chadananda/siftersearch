<script>
  import { onMount } from 'svelte';
  import { admin } from '../../lib/api.js';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';

  const auth = getAuthState();

  let summary = $state(null);
  let changelog = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let authReady = $state(false);
  let days = $state(30);
  let page = $state(0);
  const pageSize = 50;

  onMount(async () => {
    await initAuth();
    authReady = true;
    if (auth.isAuthenticated && auth.user?.tier === 'admin') {
      await loadData();
    } else {
      loading = false;
    }
  });

  async function loadData() {
    loading = true;
    error = null;
    try {
      const [summaryData, changelogData] = await Promise.all([
        admin.getLibraryChangelogSummary(),
        admin.getLibraryChangelog({ days, limit: pageSize, offset: page * pageSize })
      ]);
      summary = summaryData;
      changelog = changelogData;
    } catch (err) {
      error = err.message || 'Failed to load changelog';
    } finally {
      loading = false;
    }
  }

  function changeDays(newDays) {
    days = newDays;
    page = 0;
    loadData();
  }

  function changePage(newPage) {
    page = newPage;
    loadData();
  }

  function changeIcon(type) {
    switch(type) {
      case 'created': return '+';
      case 'updated': return '~';
      case 'deleted': return '-';
      default: return '=';
    }
  }

  function changeColor(type) {
    switch(type) {
      case 'created': return 'var(--success)';
      case 'updated': return 'var(--info)';
      case 'deleted': return 'var(--error)';
      default: return 'var(--text-muted)';
    }
  }
</script>

{#if loading}
  <div class="loading">Loading changelog...</div>
{:else if !auth.isAuthenticated || auth.user?.tier !== 'admin'}
  <div class="access-denied">
    <h2>Access Denied</h2>
    <p>Admin access required.</p>
  </div>
{:else if error}
  <div class="error-state">
    <p>{error}</p>
    <button onclick={loadData}>Retry</button>
  </div>
{:else}
  <div class="dashboard">
    <div class="page-header">
      <h1>Library Changelog</h1>
      <div class="time-filters">
        <button class="time-btn" class:active={days === 1} onclick={() => changeDays(1)}>Today</button>
        <button class="time-btn" class:active={days === 7} onclick={() => changeDays(7)}>7 days</button>
        <button class="time-btn" class:active={days === 30} onclick={() => changeDays(30)}>30 days</button>
        <button class="time-btn" class:active={days === 90} onclick={() => changeDays(90)}>90 days</button>
      </div>
    </div>

    <!-- Summary Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value created">{summary?.today?.created || 0}</span>
          <span class="stat-label">Created Today</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value updated">{summary?.today?.updated || 0}</span>
          <span class="stat-label">Updated Today</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{summary?.week?.created || 0} / {summary?.week?.updated || 0}</span>
          <span class="stat-label">Created / Updated This Week</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{summary?.month?.created || 0} / {summary?.month?.updated || 0}</span>
          <span class="stat-label">Created / Updated (30d)</span>
        </div>
      </div>
    </div>

    <!-- By Religion -->
    {#if summary?.byReligion?.length > 0}
      <section class="card">
        <h2>Activity by Religion</h2>
        <div class="religion-grid">
          {#each summary.byReligion as item}
            <div class="religion-item">
              <span class="religion-name">{item.religion || 'Unknown'}</span>
              <span class="religion-stats">
                <span class="created">+{item.created || 0}</span>
                <span class="updated">~{item.updated || 0}</span>
              </span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Timeline -->
    <section class="card">
      <h2>Changes ({changelog?.total || 0} total)</h2>

      {#each changelog?.byDate || [] as day}
        <div class="day-group">
          <div class="day-header">
            <span class="day-date">{new Date(day.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span class="day-summary">
              {#if day.created > 0}<span class="badge created">+{day.created}</span>{/if}
              {#if day.updated > 0}<span class="badge updated">~{day.updated}</span>{/if}
              {#if day.deleted > 0}<span class="badge deleted">-{day.deleted}</span>{/if}
            </span>
          </div>
          <div class="day-items">
            {#each day.items as item}
              <div class="change-item">
                <span class="change-icon" style="color: {changeColor(item.change_type)}">{changeIcon(item.change_type)}</span>
                <div class="change-info">
                  <span class="change-title">{item.title || item.file_path}</span>
                  <span class="change-meta">
                    {item.author || ''} &middot; {item.language} &middot; {item.religion || ''}{item.collection ? ' / ' + item.collection : ''} &middot; {item.paragraph_count} paragraphs
                  </span>
                </div>
                <span class="change-type badge {item.change_type}">{item.change_type}</span>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <p class="empty">No changes in the selected period</p>
      {/each}

      <!-- Pagination -->
      {#if changelog && changelog.total > pageSize}
        <div class="pagination">
          <button disabled={page === 0} onclick={() => changePage(page - 1)}>Previous</button>
          <span class="page-info">Page {page + 1} of {Math.ceil(changelog.total / pageSize)}</span>
          <button disabled={(page + 1) * pageSize >= changelog.total} onclick={() => changePage(page + 1)}>Next</button>
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .dashboard { max-width: 1200px; }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .page-header h1 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--text-primary);
  }

  .time-filters {
    display: flex;
    gap: 0.25rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    padding: 0.25rem;
  }

  .time-btn {
    padding: 0.375rem 0.75rem;
    background: none;
    border: none;
    border-radius: 0.375rem;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.8rem;
  }

  .time-btn:hover { color: var(--text-primary); }
  .time-btn.active {
    background: var(--accent-primary);
    color: white;
  }

  .loading, .access-denied, .error-state {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 200px;
    color: var(--text-secondary);
  }

  .error-state button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    border: none;
    border-radius: 0.5rem;
    color: white;
    cursor: pointer;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .stat-card {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }

  .stat-content {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .stat-value.created { color: var(--success); }
  .stat-value.updated { color: var(--info); }

  .stat-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .card {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .card h2 {
    margin: 0 0 1rem;
    font-size: 1.125rem;
    color: var(--text-primary);
  }

  .religion-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .religion-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    background: var(--surface-0);
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    font-size: 0.875rem;
  }

  .religion-name {
    font-weight: 500;
    color: var(--text-primary);
  }

  .religion-stats {
    display: flex;
    gap: 0.5rem;
    font-size: 0.8rem;
  }

  .created { color: var(--success); }
  .updated { color: var(--info); }

  .day-group {
    margin-bottom: 1.5rem;
  }

  .day-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-subtle);
    margin-bottom: 0.75rem;
  }

  .day-date {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.9rem;
  }

  .day-summary {
    display: flex;
    gap: 0.5rem;
  }

  .badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .badge.created {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }

  .badge.updated {
    background: color-mix(in srgb, var(--info) 15%, transparent);
    color: var(--info);
  }

  .badge.deleted {
    background: color-mix(in srgb, var(--error) 15%, transparent);
    color: var(--error);
  }

  .badge.unchanged {
    background: var(--surface-2);
    color: var(--text-muted);
  }

  .day-items {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .change-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    transition: background 0.15s;
  }

  .change-item:hover {
    background: var(--surface-0);
  }

  .change-icon {
    font-weight: 700;
    font-size: 1rem;
    width: 20px;
    text-align: center;
    flex-shrink: 0;
    font-family: monospace;
  }

  .change-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .change-title {
    font-weight: 500;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .change-meta {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .change-type {
    flex-shrink: 0;
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-subtle);
  }

  .pagination button {
    padding: 0.375rem 0.75rem;
    background: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 0.375rem;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.8rem;
  }

  .pagination button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .page-info {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .empty {
    color: var(--text-muted);
    font-size: 0.875rem;
    text-align: center;
    padding: 2rem;
  }
</style>
