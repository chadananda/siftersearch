<script>
  /**
   * AdminDashboard Component
   * Overview statistics and quick actions
   */
  import { onMount } from 'svelte';
  import { admin } from '../../lib/api.js';
  import { getAuthState, initAuth, requireTier } from '../../lib/auth.svelte.js';

  const auth = getAuthState();

  let stats = $state(null);
  let loading = $state(true);
  let authReady = $state(false);
  let error = $state(null);

  // Route guard - require admin tier
  $effect(() => {
    if (!auth.loading) {
      requireTier(['admin', 'superadmin'], '/');
    }
  });

  onMount(async () => {
    // Wait for auth to initialize before checking permissions or loading data
    await initAuth();
    authReady = true;

    // Only load stats if user is authenticated admin
    if (auth.isAuthenticated && (auth.user?.tier === 'admin' || auth.user?.tier === 'superadmin')) {
      await loadStats();
    }
  });

  async function loadStats() {
    loading = true;
    error = null;

    try {
      stats = await admin.getStats();
    } catch (err) {
      error = err.message || 'Failed to load statistics';
    } finally {
      loading = false;
    }
  }

  function formatNumber(n) {
    if (n === undefined || n === null) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }
</script>

<div class="dashboard">
  {#if !authReady || loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading dashboard...</p>
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
      <button onclick={loadStats} class="btn-primary">Try Again</button>
    </div>
  {:else}
    <header class="dashboard-header">
      <h1>Dashboard</h1>
      <p class="subtitle">Welcome back, {auth.user?.name || auth.user?.email}</p>
    </header>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon users">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{formatNumber(stats?.users?.total)}</span>
          <span class="stat-label">Total Users</span>
        </div>
      </div>

      <div class="stat-card highlight">
        <div class="stat-icon pending">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{formatNumber(stats?.users?.pending)}</span>
          <span class="stat-label">Pending Approval</span>
        </div>
        {#if stats?.users?.pending > 0}
          <a href="/admin/pending" class="stat-action">Review</a>
        {/if}
      </div>

      <div class="stat-card">
        <div class="stat-icon docs">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{formatNumber(stats?.search?.documents?.numberOfDocuments)}</span>
          <span class="stat-label">Documents</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon passages">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{formatNumber(stats?.search?.paragraphs?.numberOfDocuments)}</span>
          <span class="stat-label">Passages</span>
        </div>
      </div>
    </div>

    <!-- User Tier Breakdown -->
    <section class="card">
      <h2>User Tiers</h2>
      <div class="tier-grid">
        <div class="tier-item">
          <span class="tier-count">{stats?.users?.verified || 0}</span>
          <span class="tier-label">Verified</span>
        </div>
        <div class="tier-item">
          <span class="tier-count">{stats?.users?.approved || 0}</span>
          <span class="tier-label">Approved</span>
        </div>
        <div class="tier-item">
          <span class="tier-count">{stats?.users?.patron || 0}</span>
          <span class="tier-label">Patron</span>
        </div>
        <div class="tier-item">
          <span class="tier-count">{stats?.users?.admin || 0}</span>
          <span class="tier-label">Admin</span>
        </div>
        <div class="tier-item danger">
          <span class="tier-count">{stats?.users?.banned || 0}</span>
          <span class="tier-label">Banned</span>
        </div>
      </div>
    </section>

    <!-- Quick Actions -->
    <section class="card">
      <h2>Quick Actions</h2>
      <div class="actions-grid">
        <a href="/admin/users" class="action-btn">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Manage Users
        </a>
        <a href="/admin/pending" class="action-btn">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Approve Users
        </a>
        <a href="/admin/documents" class="action-btn">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Document Queue
        </a>
        <a href="/admin/failures" class="action-btn">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Rejected Documents
        </a>
      </div>
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
    position: relative;
  }

  .stat-card.highlight {
    border-color: var(--warning);
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

  .stat-icon.users {
    background: color-mix(in srgb, var(--info) 15%, transparent);
    color: var(--info);
  }

  .stat-icon.pending {
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    color: var(--warning);
  }

  .stat-icon.docs {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }

  .stat-icon.passages {
    background: color-mix(in srgb, var(--accent-tertiary) 15%, transparent);
    color: var(--accent-tertiary);
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

  .stat-action {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--warning);
    text-decoration: none;
    padding: 0.25rem 0.5rem;
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    border-radius: 0.25rem;
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

  .tier-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
  }

  .tier-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 80px;
  }

  .tier-count {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .tier-label {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .tier-item.danger .tier-count {
    color: var(--error);
  }

  .actions-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--surface-2);
    border-radius: 0.5rem;
    text-decoration: none;
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .action-btn:hover {
    background: var(--surface-3);
  }

  .action-btn svg {
    width: 20px;
    height: 20px;
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
