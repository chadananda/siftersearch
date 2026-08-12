<script>
  /**
   * AdminDashboard — health + analytics summary (visits, searches, chat, spend)
   * plus users/library at a glance. Deep breakdowns live on /admin/analytics.
   */
  import { onMount } from 'svelte';
  import { admin } from '../../lib/api.js';
  import { getAuthState, initAuth, requireTier } from '../../lib/auth.svelte.js';

  const auth = getAuthState();

  let stats = $state(null);
  let dash = $state(null);
  let loading = $state(true);
  let authReady = $state(false);
  let error = $state(null);

  $effect(() => {
    if (!auth.loading) requireTier(['admin', 'superadmin'], '/');
  });

  onMount(async () => {
    await initAuth();
    authReady = true;
    if (auth.isAuthenticated && (auth.user?.tier === 'admin' || auth.user?.tier === 'superadmin')) {
      await load();
    }
  });

  async function load() {
    loading = true;
    error = null;
    try {
      const [s, d] = await Promise.allSettled([admin.getStats(), admin.getDashboard()]);
      if (s.status === 'fulfilled') stats = s.value;
      if (d.status === 'fulfilled') dash = d.value;
      if (s.status === 'rejected' && d.status === 'rejected') {
        error = d.reason?.message || 'Failed to load dashboard';
      }
    } catch (err) {
      error = err.message || 'Failed to load dashboard';
    } finally {
      loading = false;
    }
  }

  function fmt(n) {
    if (n === undefined || n === null) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }
  function money(n) {
    if (n === undefined || n === null) return '$0';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    if (n >= 1) return '$' + n.toFixed(2);
    return '$' + n.toFixed(3);
  }
  function ago(s) {
    if (s == null) return 'unknown';
    if (s < 90) return `${s}s ago`;
    if (s < 5400) return `${Math.round(s / 60)}m ago`;
    return `${Math.round(s / 3600)}h ago`;
  }

  const health = $derived(dash?.health || null);
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
      <button onclick={load} class="btn-primary">Try Again</button>
    </div>
  {:else}
    <header class="dashboard-header">
      <div>
        <h1>Dashboard</h1>
        <p class="subtitle">Welcome back, {auth.user?.name || auth.user?.email}</p>
      </div>
      {#if health}
        <div class="health-pill health-{health.status}">
          <span class="health-dot"></span>
          {health.status === 'ok' ? 'All systems normal' : health.status === 'warn' ? 'Needs attention' : 'System issue'}
          {#if dash?.age_s != null}<span class="health-age">· {ago(dash.age_s)}</span>{/if}
        </div>
      {/if}
    </header>

    <!-- Current activity — what the pipeline is doing right now -->
    {#if dash?.current_activity && !dash.current_activity.error}
      {@const ca = dash.current_activity}
      <section class="activity-live">
        <div class="live-head">
          <span class="live-dot" class:idle={ca.idle}></span>
          <span class="live-title">{ca.idle ? 'Pipeline idle' : 'Working now'}</span>
          <span class="live-sub">last {ca.window_min}m
            {#if ca.meili_processing}· Meili indexing {fmt(ca.meili_processing)}{/if}
          </span>
        </div>
        {#if ca.idle}
          <p class="live-empty">No AI enrichment running. Ingestion &amp; extraction resume during off-peak (low-billing) hours.</p>
        {:else}
          <div class="live-chips">
            {#each ca.activities as act}
              <div class="live-chip kind-{act.kind}">
                <span class="chip-label">{act.label}</span>
                <span class="chip-calls">{fmt(act.calls)} calls</span>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- Health checks -->
    {#if health?.checks?.length}
      <section class="health-row">
        {#each health.checks as c}
          <div class="check check-{c.ok ? 'ok' : 'bad'}">
            <span class="check-name">{c.key}</span>
            <span class="check-detail">{c.detail}</span>
          </div>
        {/each}
      </section>
    {/if}

    <!-- Top-line analytics -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">
            {#if dash?.visits_available}{fmt(dash.visits.d7_uniques)}{:else}—{/if}
          </span>
          <span class="stat-label">Visitors · 7d</span>
          {#if dash?.visits_available}
            <span class="stat-sub">{fmt(dash.visits.d7_pageViews)} page views</span>
          {:else}
            <span class="stat-sub muted">Cloudflare token needs Analytics:Read</span>
          {/if}
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{fmt(dash?.searches?.d7)}</span>
          <span class="stat-label">Searches · 7d</span>
          <span class="stat-sub">
            {fmt(dash?.searches?.d1)} today{#if dash?.searches?.avg_ms_d7} · {dash.searches.avg_ms_d7}ms avg{/if}
          </span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{fmt(dash?.chat?.d7)}</span>
          <span class="stat-label">Chat turns · 7d</span>
          <span class="stat-sub">
            {fmt(dash?.chat?.users_d7 || dash?.chat?.users_all)} users · {fmt(dash?.chat?.saved)} saved
          </span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{money(dash?.spend?.month)}</span>
          <span class="stat-label">AI spend · 30d</span>
          <span class="stat-sub">
            {money(dash?.spend?.today)} today · {money(dash?.spend?.week)} wk
            {#if dash?.spend?.failed_week} · <span class="warn-text">{dash.spend.failed_week} failed</span>{/if}
          </span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{fmt(dash?.users?.total ?? stats?.users?.total)}</span>
          <span class="stat-label">Users</span>
          {#if (dash?.users?.pending ?? stats?.users?.pending) > 0}
            <a href="/admin/pending" class="stat-sub link">{fmt(dash?.users?.pending ?? stats?.users?.pending)} pending review</a>
          {:else}
            <span class="stat-sub">no pending</span>
          {/if}
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-content">
          <span class="stat-value">{fmt(stats?.search?.paragraphs?.numberOfDocuments)}</span>
          <span class="stat-label">Passages indexed</span>
          <span class="stat-sub">{fmt(stats?.search?.documents?.numberOfDocuments)} documents</span>
        </div>
      </div>
    </div>

    <div class="analytics-cta">
      <a href="/admin/analytics" class="btn-primary">View full analytics →</a>
    </div>

    <!-- Spend by caller today -->
    {#if dash?.spend?.byCallerToday?.length}
      <section class="card">
        <h2>Top AI spend today</h2>
        <div class="caller-list">
          {#each dash.spend.byCallerToday as c}
            <div class="caller-row">
              <span class="caller-name">{c.caller}</span>
              <span class="caller-calls">{fmt(c.calls)} calls</span>
              <span class="caller-cost">{money(c.cost)}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Corpus / library composition -->
    {#if dash?.corpus}
      {@const co = dash.corpus}
      <section class="card">
        <div class="corpus-head">
          <h2>Library</h2>
          <div class="corpus-totals">
            <span><strong>{fmt(co.docs)}</strong> documents</span>
            <span><strong>{fmt(co.paras)}</strong> passages</span>
            <span><strong>{co.traditions}</strong> traditions</span>
          </div>
        </div>
        {#if co.byReligion?.length}
          {@const maxDocs = Math.max(...co.byReligion.map((r) => r.docs))}
          <div class="corpus-rows">
            {#each co.byReligion as r}
              <div class="corpus-row">
                <span class="corpus-name">{r.religion}</span>
                <div class="corpus-bar"><div class="corpus-fill" style="width: {(r.docs / maxDocs) * 100}%"></div></div>
                <span class="corpus-docs">{fmt(r.docs)}</span>
                <span class="corpus-paras">{fmt(r.paras)} ¶</span>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- User Tier Breakdown -->
    <section class="card">
      <h2>User Tiers</h2>
      <div class="tier-grid">
        <div class="tier-item"><span class="tier-count">{stats?.users?.verified || 0}</span><span class="tier-label">Verified</span></div>
        <div class="tier-item"><span class="tier-count">{stats?.users?.approved || 0}</span><span class="tier-label">Approved</span></div>
        <div class="tier-item"><span class="tier-count">{stats?.users?.patron || 0}</span><span class="tier-label">Patron</span></div>
        <div class="tier-item"><span class="tier-count">{stats?.users?.admin || 0}</span><span class="tier-label">Admin</span></div>
        <div class="tier-item danger"><span class="tier-count">{stats?.users?.banned || 0}</span><span class="tier-label">Banned</span></div>
      </div>
    </section>

    <!-- Quick Actions -->
    <section class="card">
      <h2>Quick Actions</h2>
      <div class="actions-grid">
        <a href="/admin/users" class="action-btn">Manage Users</a>
        <a href="/admin/pending" class="action-btn">Approve Users</a>
        <a href="/admin/documents" class="action-btn">Document Queue</a>
        <a href="/admin/analytics" class="action-btn">Analytics</a>
        <a href="/admin/companion" class="action-btn">Companion</a>
      </div>
    </section>
  {/if}
</div>

<style>
  .dashboard { max-width: 1200px; }

  .loading, .access-denied, .error-state { text-align: center; padding: 3rem 1rem; }

  .spinner {
    width: 40px; height: 40px;
    border: 3px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .dashboard-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem;
  }
  .dashboard-header h1 { margin: 0; font-size: 1.75rem; color: var(--text-primary); }
  .subtitle { margin: 0.5rem 0 0; color: var(--text-secondary); }

  .health-pill {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.4rem 0.85rem; border-radius: 2rem;
    font-size: 0.8125rem; font-weight: 500;
    border: 1px solid transparent;
  }
  .health-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
  .health-age { color: var(--text-secondary); font-weight: 400; }
  .health-ok { color: var(--success); background: color-mix(in srgb, var(--success) 12%, transparent); border-color: color-mix(in srgb, var(--success) 30%, transparent); }
  .health-warn { color: var(--warning); background: color-mix(in srgb, var(--warning) 12%, transparent); border-color: color-mix(in srgb, var(--warning) 30%, transparent); }
  .health-down { color: var(--error); background: color-mix(in srgb, var(--error) 12%, transparent); border-color: color-mix(in srgb, var(--error) 30%, transparent); }

  .health-row {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem; margin-bottom: 1.5rem;
  }
  .check {
    display: flex; flex-direction: column; gap: 0.15rem;
    padding: 0.6rem 0.85rem; border-radius: 0.5rem;
    background: var(--surface-1); border-left: 3px solid var(--border-default);
  }
  .check-ok { border-left-color: var(--success); }
  .check-bad { border-left-color: var(--error); }
  .check-name { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); }
  .check-detail { font-size: 0.875rem; color: var(--text-primary); }

  .stats-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem; margin-bottom: 1rem;
  }
  .stat-card {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem; padding: 1.25rem;
  }
  .stat-content { display: flex; flex-direction: column; gap: 0.15rem; }
  .stat-value { font-size: 1.75rem; font-weight: 600; color: var(--text-primary); line-height: 1.1; }
  .stat-label { font-size: 0.875rem; color: var(--text-secondary); }
  .stat-sub { font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem; }
  .stat-sub.muted { color: var(--text-tertiary, var(--text-secondary)); font-style: italic; }
  .stat-sub.link { color: var(--warning); text-decoration: none; }
  .warn-text { color: var(--warning); }

  .analytics-cta { margin: 0.5rem 0 2rem; }

  .caller-list { display: flex; flex-direction: column; gap: 0.4rem; }
  .caller-row {
    display: grid; grid-template-columns: 1fr auto auto; gap: 1rem;
    align-items: center; font-size: 0.875rem;
    padding: 0.3rem 0; border-bottom: 1px solid var(--border-subtle, var(--border-default));
  }
  .caller-name { color: var(--text-primary); font-family: var(--font-mono, monospace); }
  .caller-calls { color: var(--text-secondary); font-size: 0.8125rem; }
  .caller-cost { color: var(--accent-tertiary); font-weight: 600; }

  .card {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.5rem;
  }
  .card h2 { margin: 0 0 1rem; font-size: 1.125rem; color: var(--text-primary); }

  .tier-grid { display: flex; flex-wrap: wrap; gap: 1.5rem; }
  .tier-item { display: flex; flex-direction: column; align-items: center; min-width: 80px; }
  .tier-count { font-size: 1.5rem; font-weight: 600; color: var(--text-primary); }
  .tier-label { font-size: 0.8125rem; color: var(--text-secondary); }
  .tier-item.danger .tier-count { color: var(--error); }

  .actions-grid { display: flex; flex-wrap: wrap; gap: 1rem; }
  .action-btn {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.75rem 1rem; background: var(--surface-2);
    border-radius: 0.5rem; text-decoration: none;
    color: var(--text-primary); font-size: 0.875rem; transition: background 0.2s;
  }
  .action-btn:hover { background: var(--surface-3); }

  .btn-primary {
    display: inline-block; padding: 0.5rem 1rem;
    background: var(--accent-primary); color: white; border: none;
    border-radius: 0.5rem; text-decoration: none; font-size: 0.875rem; cursor: pointer;
  }

  /* Current activity */
  .activity-live {
    background: var(--surface-1); border: 1px solid var(--border-default);
    border-radius: 0.75rem; padding: 1rem 1.25rem; margin-bottom: 1.5rem;
  }
  .live-head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .live-dot {
    width: 10px; height: 10px; border-radius: 50%; background: var(--success);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 60%, transparent);
    animation: pulse 1.8s infinite;
  }
  .live-dot.idle { background: var(--text-secondary); animation: none; box-shadow: none; }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 55%, transparent); }
    70% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--success) 0%, transparent); }
    100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 0%, transparent); }
  }
  .live-title { font-weight: 600; color: var(--text-primary); }
  .live-sub { font-size: 0.75rem; color: var(--text-secondary); }
  .live-empty { margin: 0.6rem 0 0; font-size: 0.875rem; color: var(--text-secondary); }
  .live-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
  .live-chip {
    display: flex; flex-direction: column; gap: 0.1rem;
    padding: 0.4rem 0.75rem; border-radius: 0.5rem;
    background: var(--surface-2); border-left: 3px solid var(--accent-primary);
  }
  .live-chip.kind-enrichment { border-left-color: var(--accent-tertiary); }
  .live-chip.kind-indexing { border-left-color: var(--info); }
  .live-chip.kind-serving { border-left-color: var(--success); }
  .chip-label { font-size: 0.8125rem; color: var(--text-primary); font-weight: 500; }
  .chip-calls { font-size: 0.6875rem; color: var(--text-secondary); }

  /* Corpus */
  .corpus-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .corpus-head h2 { margin: 0; }
  .corpus-totals { display: flex; gap: 1.25rem; font-size: 0.8125rem; color: var(--text-secondary); flex-wrap: wrap; }
  .corpus-totals strong { color: var(--text-primary); font-size: 1rem; }
  .corpus-rows { display: flex; flex-direction: column; gap: 0.4rem; }
  .corpus-row {
    display: grid; grid-template-columns: minmax(90px, 1fr) 3fr auto auto;
    gap: 0.75rem; align-items: center; font-size: 0.8125rem;
  }
  .corpus-name { color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .corpus-bar { height: 8px; background: var(--surface-2); border-radius: 4px; overflow: hidden; }
  .corpus-fill { height: 100%; background: var(--accent-tertiary); border-radius: 4px; }
  .corpus-docs { color: var(--text-primary); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .corpus-paras { color: var(--text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; min-width: 70px; text-align: right; }
</style>
