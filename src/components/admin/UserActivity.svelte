<script>
  import { onMount } from 'svelte';
  import { admin } from '../../lib/api.js';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';

  const auth = getAuthState();

  let searches = $state(null);
  let engagement = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let authReady = $state(false);
  let days = $state(7);
  let activeTab = $state('searches');
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
      const [searchData, engagementData] = await Promise.all([
        admin.getActivitySearches({ days, limit: pageSize, offset: page * pageSize }),
        admin.getActivityEngagement()
      ]);
      searches = searchData;
      engagement = engagementData;
    } catch (err) {
      error = err.message || 'Failed to load activity data';
    } finally {
      loading = false;
    }
  }

  function changeDays(newDays) {
    days = newDays;
    page = 0;
    loadData();
  }

  function parseDetails(details) {
    if (!details) return {};
    try { return JSON.parse(details); } catch { return {}; }
  }

  function extractQuery(details) {
    const d = parseDetails(details);
    return d.query || d.q || d.search_query || details || '-';
  }

  function formatNumber(n) {
    if (n == null) return '0';
    return Number(n).toLocaleString();
  }
</script>

{#if loading}
  <div class="loading">Loading activity data...</div>
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
      <h1>User Activity</h1>
      <div class="time-filters">
        <button class="time-btn" class:active={days === 1} onclick={() => changeDays(1)}>Today</button>
        <button class="time-btn" class:active={days === 7} onclick={() => changeDays(7)}>7 days</button>
        <button class="time-btn" class:active={days === 30} onclick={() => changeDays(30)}>30 days</button>
      </div>
    </div>

    <!-- Engagement Summary -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{formatNumber(searches?.summary?.total_searches)}</span>
          <span class="stat-label">Searches ({days}d)</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{formatNumber(searches?.summary?.unique_users)}</span>
          <span class="stat-label">Unique Users ({days}d)</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{formatNumber(engagement?.anonymous?.total)}</span>
          <span class="stat-label">Anonymous Users</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{formatNumber(engagement?.registered?.total)}</span>
          <span class="stat-label">Registered Users</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{formatNumber(engagement?.conversions)}</span>
          <span class="stat-label">Conversions</span>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab" class:active={activeTab === 'searches'} onclick={() => activeTab = 'searches'}>Search Log</button>
      <button class="tab" class:active={activeTab === 'top'} onclick={() => activeTab = 'top'}>Top Queries</button>
      <button class="tab" class:active={activeTab === 'daily'} onclick={() => activeTab = 'daily'}>Daily Trend</button>
      <button class="tab" class:active={activeTab === 'users'} onclick={() => activeTab = 'users'}>Top Users</button>
      <button class="tab" class:active={activeTab === 'anonymous'} onclick={() => activeTab = 'anonymous'}>Anonymous</button>
    </div>

    {#if activeTab === 'searches'}
      <section class="card">
        <h2>Recent Searches ({searches?.total || 0} total)</h2>
        <table>
          <thead>
            <tr>
              <th>Query</th>
              <th>User</th>
              <th>Type</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {#each searches?.searches || [] as s}
              <tr>
                <td class="query-text">{extractQuery(s.details)}</td>
                <td class="text-muted">{s.user_id ? (s.user_id.toString().substring(0, 12) + '...') : 'anon'}</td>
                <td><span class="badge {s.event_type === 'anonymous_search' ? 'anon' : 'auth'}">{s.event_type === 'anonymous_search' ? 'anonymous' : 'registered'}</span></td>
                <td class="text-muted">{new Date(s.created_at).toLocaleString()}</td>
              </tr>
            {:else}
              <tr><td colspan="4" class="empty">No searches recorded</td></tr>
            {/each}
          </tbody>
        </table>

        {#if searches && searches.total > pageSize}
          <div class="pagination">
            <button disabled={page === 0} onclick={() => { page--; loadData(); }}>Previous</button>
            <span class="page-info">Page {page + 1} of {Math.ceil(searches.total / pageSize)}</span>
            <button disabled={(page + 1) * pageSize >= searches.total} onclick={() => { page++; loadData(); }}>Next</button>
          </div>
        {/if}
      </section>

    {:else if activeTab === 'top'}
      <section class="card">
        <h2>Top Queries ({days} days)</h2>
        <div class="top-list">
          {#each searches?.topQueries || [] as q, i}
            <div class="top-item">
              <span class="top-rank">#{i + 1}</span>
              <span class="top-query">{extractQuery(q.details)}</span>
              <span class="top-count">{q.count} searches</span>
            </div>
          {:else}
            <p class="empty">No search data</p>
          {/each}
        </div>
      </section>

    {:else if activeTab === 'daily'}
      <section class="card">
        <h2>Daily Search Volume</h2>
        <div class="daily-chart">
          {#each searches?.byDay || [] as day}
            <div class="chart-bar-row">
              <span class="chart-label">{day.day}</span>
              <div class="chart-bar-bg">
                <div class="chart-bar-fill" style="width: {Math.min(100, (day.searches / Math.max(...(searches?.byDay || []).map(d => d.searches), 1)) * 100)}%"></div>
              </div>
              <span class="chart-value">{day.searches}</span>
            </div>
          {:else}
            <p class="empty">No daily data</p>
          {/each}
        </div>
      </section>

    {:else if activeTab === 'users'}
      <section class="card">
        <h2>Most Active Registered Users</h2>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Tier</th>
              <th>Searches</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {#each engagement?.activeSearchers || [] as user}
              <tr>
                <td>
                  <span class="user-name">{user.name || user.email}</span>
                  {#if user.name}<span class="user-email">{user.email}</span>{/if}
                </td>
                <td><span class="badge tier">{user.tier}</span></td>
                <td class="text-accent">{user.search_count}</td>
                <td class="text-muted">{new Date(user.created_at).toLocaleDateString()}</td>
              </tr>
            {:else}
              <tr><td colspan="4" class="empty">No active users</td></tr>
            {/each}
          </tbody>
        </table>
      </section>

    {:else if activeTab === 'anonymous'}
      <section class="card">
        <h2>Recent Anonymous Users</h2>
        <div class="anon-stats">
          <span>{formatNumber(engagement?.anonymous?.searched)} searched of {formatNumber(engagement?.anonymous?.total)} total</span>
          <span>&middot;</span>
          <span>{formatNumber(engagement?.anonymous?.total_searches)} total searches</span>
          <span>&middot;</span>
          <span>Avg {Number(engagement?.anonymous?.avg_searches || 0).toFixed(1)} per user</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Searches</th>
              <th>Last Query</th>
              <th>Country</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {#each engagement?.recentAnonymous || [] as user}
              <tr>
                <td class="text-muted">{user.id.substring(0, 16)}...</td>
                <td>{user.search_count}</td>
                <td class="query-text">{user.last_search_query || '-'}</td>
                <td>{user.country || '-'}</td>
                <td class="text-muted">{user.last_seen_at ? new Date(user.last_seen_at).toLocaleDateString() : '-'}</td>
              </tr>
            {:else}
              <tr><td colspan="5" class="empty">No anonymous users</td></tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}
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
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .stat-card {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }

  .stat-content { display: flex; flex-direction: column; }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .stat-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--border-default);
  }

  .tab {
    padding: 0.625rem 1rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .tab:hover { color: var(--text-primary); }
  .tab.active {
    color: var(--accent-primary);
    border-bottom-color: var(--accent-primary);
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

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  th {
    text-align: left;
    padding: 0.625rem 0.75rem;
    border-bottom: 1px solid var(--border-default);
    color: var(--text-secondary);
    font-weight: 500;
    font-size: 0.8rem;
  }

  td {
    padding: 0.625rem 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-primary);
  }

  .query-text {
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .text-muted { color: var(--text-muted); }
  .text-accent { color: var(--accent-primary); font-weight: 600; }

  .badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .badge.anon {
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    color: var(--warning);
  }

  .badge.auth {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }

  .badge.tier {
    background: color-mix(in srgb, var(--info) 15%, transparent);
    color: var(--info);
  }

  .user-name { font-weight: 500; display: block; }
  .user-email { font-size: 0.75rem; color: var(--text-muted); display: block; }

  .anon-stats {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .top-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .top-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.625rem 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .top-rank {
    font-weight: 600;
    color: var(--text-muted);
    width: 30px;
    font-size: 0.875rem;
  }

  .top-query {
    flex: 1;
    font-weight: 500;
    color: var(--text-primary);
  }

  .top-count {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .daily-chart {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .chart-bar-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .chart-label {
    width: 90px;
    font-size: 0.8rem;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .chart-bar-bg {
    flex: 1;
    height: 20px;
    background: var(--surface-2);
    border-radius: 4px;
    overflow: hidden;
  }

  .chart-bar-fill {
    height: 100%;
    background: var(--accent-primary);
    border-radius: 4px;
    transition: width 0.3s;
    min-width: 2px;
  }

  .chart-value {
    width: 50px;
    text-align: right;
    font-size: 0.8rem;
    color: var(--text-secondary);
    font-weight: 500;
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
