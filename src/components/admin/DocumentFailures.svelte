<script>
  /**
   * DocumentFailures Component
   * Admin view for reviewing and managing document ingestion failures
   */
  import { onMount } from 'svelte';
  import { failures } from '../../lib/api.js';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';

  const auth = getAuthState();

  let items = $state([]);
  let summary = $state(null);
  let loading = $state(true);
  let authReady = $state(false);
  let error = $state(null);
  let actionLoading = $state(null);

  // Filters
  let resolvedFilter = $state('0'); // '0' = unresolved, '1' = resolved, 'all' = all
  let page = $state(0);
  const limit = 20;
  let total = $state(0);

  // Selected failure for detail view
  let selectedFailure = $state(null);

  onMount(async () => {
    // Initialize auth before loading data
    await initAuth();
    authReady = true;

    // Only load data if authenticated admin
    if (auth.isAuthenticated && ['admin', 'superadmin', 'editor'].includes(auth.user?.tier)) {
      await Promise.all([loadFailures(), loadSummary()]);
    } else {
      loading = false;
    }
  });

  async function loadFailures() {
    loading = true;
    error = null;

    try {
      const data = await failures.getList({
        resolved: resolvedFilter,
        limit,
        offset: page * limit
      });
      items = data.failures || [];
      total = data.total || 0;
    } catch (err) {
      error = err.message || 'Failed to load failures';
    } finally {
      loading = false;
    }
  }

  async function loadSummary() {
    try {
      summary = await failures.getSummary();
    } catch (err) {
      console.error('Failed to load summary:', err);
    }
  }

  async function handleRetry(id) {
    actionLoading = id;
    try {
      const result = await failures.retry(id);
      if (result.success) {
        alert('Document successfully re-ingested!');
        await loadFailures();
        await loadSummary();
      } else {
        alert(`Retry failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(err.message || 'Retry failed');
    } finally {
      actionLoading = null;
    }
  }

  async function handleResolve(id) {
    actionLoading = id;
    try {
      await failures.resolve(id);
      await loadFailures();
      await loadSummary();
    } catch (err) {
      alert(err.message || 'Failed to resolve');
    } finally {
      actionLoading = null;
    }
  }

  async function handleDismiss(id) {
    if (!confirm('Are you sure you want to dismiss this failure? This will delete it.')) return;

    actionLoading = id;
    try {
      await failures.dismiss(id);
      await loadFailures();
      await loadSummary();
    } catch (err) {
      alert(err.message || 'Failed to dismiss');
    } finally {
      actionLoading = null;
    }
  }

  async function handleFilterChange() {
    page = 0;
    await loadFailures();
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  }

  function truncate(str, maxLen = 50) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }
</script>

{#if !authReady}
  <div class="loading">Loading...</div>
{:else if !auth.isAuthenticated || !['admin', 'superadmin', 'editor'].includes(auth.user?.tier)}
  <div class="error">You must be an admin to view this page.</div>
{:else}
  <div class="failures-container">
    <!-- Summary Stats -->
    {#if summary}
      <div class="summary-box">
        <div class="summary-stat main">
          <span class="stat-value">{summary.totalUnresolved}</span>
          <span class="stat-label">Unresolved Failures</span>
        </div>
        {#if summary.byType && Object.keys(summary.byType).length > 0}
          <div class="summary-types">
            {#each Object.entries(summary.byType) as [type, counts]}
              <div class="type-badge">
                <span class="type-name">{type.replace(/_/g, ' ')}</span>
                <span class="type-count">{counts.unresolved}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Filters -->
    <div class="filters">
      <select bind:value={resolvedFilter} onchange={handleFilterChange}>
        <option value="0">Unresolved</option>
        <option value="1">Resolved</option>
        <option value="all">All</option>
      </select>
    </div>

    <!-- Error display -->
    {#if error}
      <div class="error-banner">{error}</div>
    {/if}

    <!-- Loading state -->
    {#if loading}
      <div class="loading">Loading failures...</div>
    {:else if items.length === 0}
      <div class="empty-state">
        <p>No document failures found.</p>
      </div>
    {:else}
      <!-- Failures list -->
      <div class="failures-list">
        {#each items as failure (failure.id)}
          <div class="failure-card {failure.resolved ? 'resolved' : ''}">
            <div class="failure-header">
              <span class="error-type">{failure.error_type?.replace(/_/g, ' ')}</span>
              <span class="failure-date">{formatDate(failure.created_at)}</span>
            </div>
            <div class="failure-file">
              <strong>{failure.file_name || 'Unknown file'}</strong>
              {#if failure.file_path}
                <span class="file-path">{truncate(failure.file_path, 80)}</span>
              {/if}
            </div>
            <div class="failure-message">{truncate(failure.error_message, 200)}</div>

            {#if failure.details}
              <div class="failure-details">
                {#if failure.details.oversizedCount}
                  <span class="detail-item">
                    <strong>{failure.details.oversizedCount}</strong> oversized paragraphs
                  </span>
                {/if}
                {#if failure.details.paragraphs?.[0]}
                  <span class="detail-item">
                    Longest: <strong>{failure.details.paragraphs[0].length.toLocaleString()}</strong> chars
                  </span>
                {/if}
              </div>
            {/if}

            <div class="failure-actions">
              {#if !failure.resolved}
                <button
                  class="btn btn-primary"
                  onclick={() => handleRetry(failure.id)}
                  disabled={actionLoading === failure.id}
                >
                  {actionLoading === failure.id ? 'Retrying...' : 'Retry'}
                </button>
                <button
                  class="btn btn-secondary"
                  onclick={() => handleResolve(failure.id)}
                  disabled={actionLoading === failure.id}
                >
                  Mark Resolved
                </button>
              {/if}
              <button
                class="btn btn-danger"
                onclick={() => handleDismiss(failure.id)}
                disabled={actionLoading === failure.id}
              >
                Dismiss
              </button>
            </div>
          </div>
        {/each}
      </div>

      <!-- Pagination -->
      {#if total > limit}
        <div class="pagination">
          <button
            onclick={() => { page--; loadFailures(); }}
            disabled={page === 0}
          >
            Previous
          </button>
          <span>Page {page + 1} of {Math.ceil(total / limit)}</span>
          <button
            onclick={() => { page++; loadFailures(); }}
            disabled={(page + 1) * limit >= total}
          >
            Next
          </button>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .failures-container {
    padding: 1rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .summary-box {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .summary-stat.main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .summary-stat .stat-value {
    font-size: 2.5rem;
    font-weight: bold;
    color: var(--error);
  }

  .summary-stat .stat-label {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .summary-types {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .type-badge {
    background: var(--surface-2);
    border-radius: 20px;
    padding: 0.25rem 0.75rem;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .type-name {
    color: var(--text-secondary);
    text-transform: capitalize;
  }

  .type-count {
    background: var(--error);
    color: white;
    border-radius: 10px;
    padding: 0.1rem 0.4rem;
    font-size: 0.75rem;
    font-weight: bold;
  }

  .filters {
    margin-bottom: 1rem;
  }

  .filters select {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface-1);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .loading, .empty-state, .error {
    text-align: center;
    padding: 3rem;
    color: var(--text-secondary);
  }

  .error-banner {
    background: var(--error-bg, rgba(239, 68, 68, 0.1));
    border: 1px solid var(--error);
    color: var(--error);
    padding: 0.75rem 1rem;
    border-radius: 6px;
    margin-bottom: 1rem;
  }

  .failures-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .failure-card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    transition: border-color 0.2s;
  }

  .failure-card:hover {
    border-color: var(--border-hover, var(--accent));
  }

  .failure-card.resolved {
    opacity: 0.6;
  }

  .failure-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .error-type {
    background: var(--error);
    color: white;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .failure-date {
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .failure-file {
    margin-bottom: 0.5rem;
  }

  .failure-file strong {
    color: var(--text-primary);
  }

  .file-path {
    display: block;
    color: var(--text-muted);
    font-size: 0.8rem;
    font-family: monospace;
  }

  .failure-message {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
    line-height: 1.4;
  }

  .failure-details {
    display: flex;
    gap: 1rem;
    margin-bottom: 0.75rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .detail-item strong {
    color: var(--text-primary);
  }

  .failure-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .btn {
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: background 0.2s, opacity 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .btn-secondary {
    background: var(--surface-2);
    color: var(--text-primary);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--surface-3);
  }

  .btn-danger {
    background: transparent;
    color: var(--error);
    border: 1px solid var(--error);
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--error);
    color: white;
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 1.5rem;
    padding: 1rem;
  }

  .pagination button {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface-1);
    color: var(--text-primary);
    cursor: pointer;
  }

  .pagination button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pagination button:hover:not(:disabled) {
    background: var(--surface-2);
  }

  .pagination span {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
</style>
