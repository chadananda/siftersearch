<script>
  import { onMount } from 'svelte';
  import { admin } from '../../lib/api.js';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';

  const auth = getAuthState();

  let traffic = $state(null);
  let pages = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let authReady = $state(false);
  let days = $state(7);

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
      const [trafficData, pagesData] = await Promise.all([
        admin.getSEOTraffic({ days }),
        admin.getSEOPages({ days })
      ]);

      if (trafficData.error) {
        error = trafficData.error;
      } else {
        traffic = trafficData;
        pages = pagesData;
      }
    } catch (err) {
      error = err.message || 'Failed to load SEO data';
    } finally {
      loading = false;
    }
  }

  function changeDays(newDays) {
    days = newDays;
    loadData();
  }

  function formatNumber(n) {
    if (n == null) return '0';
    return Number(n).toLocaleString();
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return val.toFixed(1) + ' ' + units[i];
  }

  function totalRequests() {
    return traffic?.daily?.reduce((sum, d) => sum + (d.sum?.requests || 0), 0) || 0;
  }

  function totalPageViews() {
    return traffic?.daily?.reduce((sum, d) => sum + (d.sum?.pageViews || 0), 0) || 0;
  }

  function totalUniques() {
    return traffic?.daily?.reduce((sum, d) => sum + (d.uniq?.uniques || 0), 0) || 0;
  }

  function totalBytes() {
    return traffic?.daily?.reduce((sum, d) => sum + (d.sum?.bytes || 0), 0) || 0;
  }

  function cacheRate() {
    const totalReq = totalRequests();
    const cached = traffic?.daily?.reduce((sum, d) => sum + (d.sum?.cachedRequests || 0), 0) || 0;
    return totalReq > 0 ? Math.round((cached / totalReq) * 100) : 0;
  }
</script>

{#if loading}
  <div class="loading">Loading SEO analytics...</div>
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
      <h1>Analytics</h1>
      <div class="time-filters">
        <button class="time-btn" class:active={days === 1} onclick={() => changeDays(1)}>Today</button>
        <button class="time-btn" class:active={days === 7} onclick={() => changeDays(7)}>7 days</button>
        <button class="time-btn" class:active={days === 30} onclick={() => changeDays(30)}>30 days</button>
      </div>
    </div>

    <!-- Summary Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{formatNumber(totalRequests())}</span>
          <span class="stat-label">Total Requests</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{formatNumber(totalPageViews())}</span>
          <span class="stat-label">Page Views</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{formatNumber(totalUniques())}</span>
          <span class="stat-label">Unique Visitors</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{formatBytes(totalBytes())}</span>
          <span class="stat-label">Bandwidth</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{cacheRate()}%</span>
          <span class="stat-label">Cache Rate</span>
        </div>
      </div>
    </div>

    <!-- Daily Traffic Chart -->
    <section class="card">
      <h2>Daily Traffic</h2>
      <div class="daily-chart">
        {#each traffic?.daily || [] as day}
          {@const maxReq = Math.max(...(traffic?.daily || []).map(d => d.sum?.requests || 0), 1)}
          <div class="chart-bar-row">
            <span class="chart-label">{day.dimensions?.date || ''}</span>
            <div class="chart-bar-bg">
              <div class="chart-bar-fill" style="width: {((day.sum?.requests || 0) / maxReq) * 100}%"></div>
            </div>
            <div class="chart-values">
              <span>{formatNumber(day.sum?.requests)} req</span>
              <span class="text-muted">{formatNumber(day.sum?.pageViews)} views</span>
              <span class="text-accent">{formatNumber(day.uniq?.uniques)} unique</span>
            </div>
          </div>
        {:else}
          <p class="empty">No traffic data</p>
        {/each}
      </div>
    </section>

    <div class="two-col">
      <!-- Top Pages -->
      <section class="card">
        <h2>Top Pages</h2>
        <div class="rank-list">
          {#each pages?.topPages || [] as item, i}
            <div class="rank-item">
              <span class="rank-num">#{i + 1}</span>
              <span class="rank-path">{item.dimensions?.clientRequestPath || '-'}</span>
              <span class="rank-count">{formatNumber(item.count)}</span>
            </div>
          {:else}
            <p class="empty">No page data</p>
          {/each}
        </div>
      </section>

      <!-- Top Referrers -->
      <section class="card">
        <h2>Top Referrers</h2>
        <div class="rank-list">
          {#each pages?.topReferrers || [] as item, i}
            <div class="rank-item">
              <span class="rank-num">#{i + 1}</span>
              <span class="rank-path">{item.dimensions?.clientRefererHost || 'Direct'}</span>
              <span class="rank-count">{formatNumber(item.count)}</span>
            </div>
          {:else}
            <p class="empty">No referrer data</p>
          {/each}
        </div>
      </section>
    </div>

    <!-- Countries -->
    <section class="card">
      <h2>Traffic by Country</h2>
      <div class="country-grid">
        {#each traffic?.countries || [] as item}
          <div class="country-item">
            <span class="country-name">{item.dimensions?.clientCountryName || 'Unknown'}</span>
            <span class="country-count">{formatNumber(item.count)}</span>
          </div>
        {:else}
          <p class="empty">No country data</p>
        {/each}
      </div>
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

  .two-col {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
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

  .chart-values {
    display: flex;
    gap: 0.75rem;
    font-size: 0.75rem;
    white-space: nowrap;
    min-width: 200px;
  }

  .text-muted { color: var(--text-muted); }
  .text-accent { color: var(--accent-primary); }

  .rank-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .rank-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .rank-item:last-child { border-bottom: none; }

  .rank-num {
    font-weight: 600;
    color: var(--text-muted);
    width: 30px;
    font-size: 0.8rem;
  }

  .rank-path {
    flex: 1;
    font-size: 0.875rem;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rank-count {
    font-weight: 500;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .country-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.5rem;
  }

  .country-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--surface-0);
    border: 1px solid var(--border-subtle);
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  .country-name {
    color: var(--text-primary);
    font-weight: 500;
  }

  .country-count {
    color: var(--text-secondary);
    font-size: 0.8rem;
  }

  .empty {
    color: var(--text-muted);
    font-size: 0.875rem;
    text-align: center;
    padding: 2rem;
  }
</style>
