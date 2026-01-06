<script>
  /**
   * AIUsageDashboard Component
   * Displays AI usage statistics and cost tracking for admins
   */
  import { onMount } from 'svelte';
  import { admin } from '../../lib/api.js';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';

  const auth = getAuthState();

  let summary = $state(null);
  let recentCalls = $state([]);
  let filters = $state({ models: [], callers: [] });
  let loading = $state(true);
  let authReady = $state(false);
  let error = $state(null);

  // Filter state
  let filterModel = $state('');
  let filterCaller = $state('');
  let filterSuccess = $state('');
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
      const [summaryData, recentData, filtersData] = await Promise.all([
        admin.getAIUsageSummary(),
        admin.getAIUsageRecent({ limit: pageSize }),
        admin.getAIUsageFilters()
      ]);
      summary = summaryData;
      recentCalls = recentData.calls || [];
      filters = filtersData;
    } catch (err) {
      error = err.message || 'Failed to load AI usage data';
    } finally {
      loading = false;
    }
  }

  async function loadRecent() {
    try {
      const options = { limit: pageSize, offset: page * pageSize };
      if (filterModel) options.model = filterModel;
      if (filterCaller) options.caller = filterCaller;
      if (filterSuccess !== '') options.success = filterSuccess;

      const data = await admin.getAIUsageRecent(options);
      recentCalls = data.calls || [];
    } catch (err) {
      console.error('Failed to load recent calls:', err);
    }
  }

  function formatCost(cost) {
    if (cost === undefined || cost === null) return '$0.00';
    return '$' + cost.toFixed(4);
  }

  function formatTokens(n) {
    if (n === undefined || n === null) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  function formatTime(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function handleFilterChange() {
    page = 0;
    loadRecent();
  }
</script>

<div class="dashboard">
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading AI usage data...</p>
    </div>
  {:else if !auth.isAuthenticated || auth.user?.tier !== 'admin'}
    <div class="access-denied">
      <h2>Access Denied</h2>
      <p>You need admin access to view this page.</p>
      <a href="/" class="btn-primary">Go to Home</a>
    </div>
  {:else if error}
    <div class="error-state">
      <h2>Error</h2>
      <p>{error}</p>
      <button onclick={loadData} class="btn-primary">Try Again</button>
    </div>
  {:else}
    <header class="dashboard-header">
      <h1>AI Usage & Costs</h1>
      <p class="subtitle">Monitor API usage and optimize costs</p>
    </header>

    <!-- Summary Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon today">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{formatCost(summary?.today?.cost)}</span>
          <span class="stat-label">Today ({formatTokens(summary?.today?.tokens)} tokens)</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon week">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{formatCost(summary?.week?.cost)}</span>
          <span class="stat-label">This Week ({formatTokens(summary?.week?.tokens)} tokens)</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon month">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{formatCost(summary?.month?.cost)}</span>
          <span class="stat-label">30 Days ({formatTokens(summary?.month?.tokens)} tokens)</span>
        </div>
      </div>

      <div class="stat-card" class:highlight={summary?.failedCalls > 0}>
        <div class="stat-icon failures">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{summary?.failedCalls || 0}</span>
          <span class="stat-label">Failed Calls (7 days)</span>
        </div>
      </div>
    </div>

    <!-- Usage Breakdown -->
    <div class="breakdown-grid">
      <section class="card">
        <h2>By Model</h2>
        <div class="breakdown-list">
          {#each summary?.byModel || [] as item}
            <div class="breakdown-item">
              <div class="breakdown-info">
                <span class="breakdown-name">{item.model}</span>
                <span class="breakdown-calls">{item.calls} calls</span>
              </div>
              <div class="breakdown-stats">
                <span class="breakdown-tokens">{formatTokens(item.tokens)}</span>
                <span class="breakdown-cost">{formatCost(item.cost)}</span>
              </div>
            </div>
          {:else}
            <p class="empty">No usage data yet</p>
          {/each}
        </div>
      </section>

      <section class="card">
        <h2>By Caller</h2>
        <div class="breakdown-list">
          {#each summary?.byCaller || [] as item}
            <div class="breakdown-item">
              <div class="breakdown-info">
                <span class="breakdown-name">{item.caller}</span>
                <span class="breakdown-calls">{item.calls} calls</span>
              </div>
              <div class="breakdown-stats">
                <span class="breakdown-tokens">{formatTokens(item.tokens)}</span>
                <span class="breakdown-cost">{formatCost(item.cost)}</span>
              </div>
            </div>
          {:else}
            <p class="empty">No usage data yet</p>
          {/each}
        </div>
      </section>
    </div>

    <!-- Recent Calls Table -->
    <section class="card">
      <div class="table-header">
        <h2>Recent Calls</h2>
        <div class="filters">
          <select bind:value={filterModel} onchange={handleFilterChange}>
            <option value="">All Models</option>
            {#each filters.models as model}
              <option value={model}>{model}</option>
            {/each}
          </select>
          <select bind:value={filterCaller} onchange={handleFilterChange}>
            <option value="">All Callers</option>
            {#each filters.callers as caller}
              <option value={caller}>{caller}</option>
            {/each}
          </select>
          <select bind:value={filterSuccess} onchange={handleFilterChange}>
            <option value="">All Status</option>
            <option value="1">Success</option>
            <option value="0">Failed</option>
          </select>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Model</th>
              <th>Caller</th>
              <th>Tokens</th>
              <th>Cost</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each recentCalls as call}
              <tr class:error-row={!call.success}>
                <td class="time-cell">
                  <span class="time">{formatTime(call.timestamp)}</span>
                  <span class="date">{formatDate(call.timestamp)}</span>
                </td>
                <td>
                  <span class="model-badge">{call.model}</span>
                </td>
                <td>{call.caller || '-'}</td>
                <td>{formatTokens(call.total_tokens)}</td>
                <td>{formatCost(call.estimated_cost_usd)}</td>
                <td>
                  {#if call.success}
                    <span class="status-badge success">OK</span>
                  {:else}
                    <span class="status-badge error" title={call.error_message}>FAIL</span>
                  {/if}
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="6" class="empty-row">No calls recorded yet</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if recentCalls.length >= pageSize}
        <div class="pagination">
          <button onclick={() => { page = Math.max(0, page - 1); loadRecent(); }} disabled={page === 0}>
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button onclick={() => { page++; loadRecent(); }}>
            Next
          </button>
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .dashboard {
    max-width: 1200px;
  }

  .loading, .access-denied, .error-state {
    text-align: center;
    padding: 3rem 1rem;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .dashboard-header {
    margin-bottom: 2rem;
  }

  .dashboard-header h1 {
    margin: 0;
    font-size: 1.75rem;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0.5rem 0 0;
    color: var(--text-secondary);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.25rem;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .stat-card.highlight {
    border-color: var(--error);
  }

  .stat-icon {
    width: 48px;
    height: 48px;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .stat-icon svg {
    width: 24px;
    height: 24px;
  }

  .stat-icon.today {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }

  .stat-icon.week {
    background: color-mix(in srgb, var(--info) 15%, transparent);
    color: var(--info);
  }

  .stat-icon.month {
    background: color-mix(in srgb, var(--accent-tertiary) 15%, transparent);
    color: var(--accent-tertiary);
  }

  .stat-icon.failures {
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    color: var(--warning);
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

  .stat-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .breakdown-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .card {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.5rem;
  }

  .card h2 {
    margin: 0 0 1rem;
    font-size: 1.125rem;
    color: var(--text-primary);
  }

  .breakdown-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .breakdown-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .breakdown-item:last-child {
    border-bottom: none;
  }

  .breakdown-info {
    display: flex;
    flex-direction: column;
  }

  .breakdown-name {
    font-weight: 500;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .breakdown-calls {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .breakdown-stats {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .breakdown-tokens {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .breakdown-cost {
    font-weight: 600;
    color: var(--text-primary);
  }

  .empty {
    color: var(--text-muted);
    font-size: 0.875rem;
    text-align: center;
    padding: 1rem;
  }

  .table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .filters {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .filters select {
    padding: 0.5rem;
    border: 1px solid var(--border-default);
    border-radius: 0.375rem;
    background: var(--surface-2);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .table-container {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--border-default);
  }

  th {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  td {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .error-row {
    background: color-mix(in srgb, var(--error) 5%, transparent);
  }

  .time-cell {
    display: flex;
    flex-direction: column;
  }

  .time {
    font-weight: 500;
  }

  .date {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .model-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: var(--surface-2);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-family: monospace;
  }

  .status-badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .status-badge.success {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }

  .status-badge.error {
    background: color-mix(in srgb, var(--error) 15%, transparent);
    color: var(--error);
    cursor: help;
  }

  .empty-row {
    text-align: center;
    color: var(--text-muted);
    padding: 2rem !important;
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-default);
  }

  .pagination button {
    padding: 0.5rem 1rem;
    background: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 0.375rem;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .pagination button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pagination button:hover:not(:disabled) {
    background: var(--surface-3);
  }

  .btn-primary {
    display: inline-block;
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    text-decoration: none;
    font-size: 0.875rem;
    cursor: pointer;
  }
</style>
