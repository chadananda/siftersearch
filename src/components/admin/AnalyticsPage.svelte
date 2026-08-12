<script>
  /**
   * AnalyticsPage — deep analytics. Traffic + sources from Cloudflare (free zone
   * analytics), plus our own search / indexing / AI-spend internals. All data is
   * snapshot-backed via /api/admin/analytics/deep (no heavy live scans).
   */
  import { onMount } from 'svelte';
  import { admin } from '../../lib/api.js';
  import { getAuthState, initAuth, requireTier } from '../../lib/auth.svelte.js';

  const auth = getAuthState();
  let data = $state(null);
  let loading = $state(true);
  let authReady = $state(false);
  let error = $state(null);

  $effect(() => { if (!auth.loading) requireTier(['admin', 'superadmin'], '/'); });

  onMount(async () => {
    await initAuth();
    authReady = true;
    if (auth.isAuthenticated && (auth.user?.tier === 'admin' || auth.user?.tier === 'superadmin')) {
      await load();
    }
  });

  async function load() {
    loading = true; error = null;
    try {
      data = await admin.getDeepAnalytics();
    } catch (err) {
      error = err.message || 'Failed to load analytics';
    } finally {
      loading = false;
    }
  }

  function fmt(n) {
    if (n === undefined || n === null) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return Math.round(n).toString();
  }
  function money(n) {
    if (!n) return '$0';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    if (n >= 1) return '$' + n.toFixed(2);
    return '$' + n.toFixed(4);
  }
  function pct(part, whole) {
    if (!whole) return '0%';
    return Math.round((part / whole) * 100) + '%';
  }

  const cf = $derived(data?.cloudflare || null);
  const cfDaily = $derived(cf && !cf.error ? (cf.daily || []) : []);
  const activity = $derived(data?.activity && !data.activity.error ? data.activity : null);
  const spend = $derived(data?.spend || null);
  const indexing = $derived(data?.indexing || null);

  // Max helpers for bar-chart scaling
  function maxOf(arr, key) { return Math.max(1, ...arr.map((d) => d[key] || 0)); }
  const cfMax = $derived(maxOf(cfDaily, 'pageViews'));
  const seriesMax = $derived(activity?.series ? Math.max(1, ...activity.series.map((d) => (d.searches || 0) + (d.chat || 0))) : 1);
</script>

<div class="analytics">
  {#if !authReady || loading}
    <div class="loading"><div class="spinner"></div><p>Loading analytics...</p></div>
  {:else if !auth.isAuthenticated || auth.user?.tier !== 'admin'}
    <div class="access-denied"><h2>Access Denied</h2><a href="/" class="btn">Home</a></div>
  {:else if error}
    <div class="error-state"><h2>Error</h2><p>{error}</p><button onclick={load} class="btn">Retry</button></div>
  {:else}
    <header class="page-header">
      <h1>Analytics</h1>
      {#if data?.generated_at}
        <span class="generated">snapshot {new Date(data.generated_at).toLocaleString()}</span>
      {/if}
    </header>

    <!-- ══ Traffic (Cloudflare) ══ -->
    <section class="card">
      <div class="card-head">
        <h2>Traffic <span class="src-tag">Cloudflare</span></h2>
      </div>
      {#if !cf}
        <p class="empty">No Cloudflare data in the snapshot yet.</p>
      {:else if cf.error}
        <div class="notice">
          <strong>Cloudflare analytics unavailable.</strong>
          <p>{cf.error}</p>
          <p class="hint">The <code>CLOUDFLARE_API_TOKEN</code> needs <em>Analytics → Read</em> permission on the zone. Traffic will populate once the token is scoped.</p>
        </div>
      {:else}
        <div class="chart">
          {#each cfDaily as d}
            <div class="bar-col" title="{d.date}: {fmt(d.pageViews)} views, {fmt(d.uniques)} visitors, {fmt(d.requests)} requests">
              <div class="bar" style="height: {(d.pageViews / cfMax) * 100}%"></div>
              <span class="bar-label">{d.date.slice(5)}</span>
            </div>
          {/each}
        </div>
        <div class="legend">Daily page views (last {cfDaily.length} days)</div>

        {#if cf.topCountries?.length}
          <h3>Top countries</h3>
          <div class="rows">
            {#each cf.topCountries as c}
              <div class="row">
                <span class="row-name">{c.country || 'Unknown'}</span>
                <div class="row-bar"><div class="row-fill" style="width: {pct(c.requests, cf.topCountries[0].requests)}"></div></div>
                <span class="row-val">{fmt(c.requests)}</span>
              </div>
            {/each}
          </div>
          <p class="hint">Referrer-level sources need a paid Cloudflare plan; country + request breakdown is the free-tier signal.</p>
        {/if}
      {/if}
    </section>

    <!-- ══ Search & chat (our own) ══ -->
    <section class="card">
      <div class="card-head"><h2>Search &amp; Chat <span class="src-tag ours">internal</span></h2></div>
      {#if !activity}
        <p class="empty">No search activity recorded yet.</p>
      {:else}
        {@const t = activity.totals || {}}
        <div class="metric-row">
          <div class="metric"><span class="m-val">{fmt(t.searches_d7)}</span><span class="m-lbl">searches · 7d</span></div>
          <div class="metric"><span class="m-val">{fmt(t.chat_d7)}</span><span class="m-lbl">chat turns · 7d</span></div>
          <div class="metric"><span class="m-val">{t.avg_ms_d7 ? Math.round(t.avg_ms_d7) + 'ms' : '—'}</span><span class="m-lbl">avg latency</span></div>
          <div class="metric"><span class="m-val">{pct(t.zero_result_d7, t.searches_d7)}</span><span class="m-lbl">zero-result rate</span></div>
        </div>

        {#if activity.series?.length}
          <div class="chart stacked">
            {#each activity.series as d}
              {@const total = (d.searches || 0) + (d.chat || 0)}
              <div class="bar-col" title="{d.day}: {d.searches} searches, {d.chat} chat">
                <div class="bar-stack" style="height: {(total / seriesMax) * 100}%">
                  <div class="seg seg-chat" style="height: {pct(d.chat, total)}"></div>
                  <div class="seg seg-search" style="height: {pct(d.searches, total)}"></div>
                </div>
                <span class="bar-label">{d.day.slice(5)}</span>
              </div>
            {/each}
          </div>
          <div class="legend">
            <span class="key"><span class="swatch seg-search"></span>searches</span>
            <span class="key"><span class="swatch seg-chat"></span>chat</span>
          </div>
        {/if}

        {#if activity.topQueries?.length}
          <h3>Top queries · 7d</h3>
          <div class="rows">
            {#each activity.topQueries as q}
              <div class="row query">
                <span class="row-name" title={q.query}>{q.query}</span>
                <span class="row-meta">{q.avg_results != null ? Math.round(q.avg_results) + ' results' : ''}</span>
                <span class="row-val">{fmt(q.n)}</span>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </section>

    <!-- ══ AI Spend (our own) ══ -->
    <section class="card">
      <div class="card-head"><h2>AI Spend <span class="src-tag ours">internal</span></h2></div>
      {#if !spend?.combined}
        <p class="empty">No spend data in the snapshot yet.</p>
      {:else}
        {@const c = spend.combined}
        <div class="metric-row">
          <div class="metric"><span class="m-val">{money(c.today_cost)}</span><span class="m-lbl">today</span></div>
          <div class="metric"><span class="m-val">{money(c.week_cost)}</span><span class="m-lbl">7 days</span></div>
          <div class="metric"><span class="m-val">{money(c.month_cost)}</span><span class="m-lbl">30 days</span></div>
          <div class="metric"><span class="m-val">{fmt(c.month_calls)}</span><span class="m-lbl">calls · 30d</span></div>
        </div>

        <div class="two-col">
          <div>
            <h3>By provider · 30d</h3>
            <div class="rows">
              {#each spend.byProvider as p}
                <div class="row">
                  <span class="row-name">{p.provider || 'unknown'}</span>
                  <div class="row-bar"><div class="row-fill" style="width: {pct(p.cost, spend.byProvider[0]?.cost || 1)}"></div></div>
                  <span class="row-val">{money(p.cost)}</span>
                </div>
              {/each}
            </div>
          </div>
          <div>
            <h3>By service · 30d</h3>
            <div class="rows">
              {#each spend.byCaller.slice(0, 12) as p}
                <div class="row">
                  <span class="row-name mono" title={p.caller}>{p.caller || 'unknown'}</span>
                  <div class="row-bar"><div class="row-fill" style="width: {pct(p.cost, spend.byCaller[0]?.cost || 1)}"></div></div>
                  <span class="row-val">{money(p.cost)}</span>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </section>

    <!-- ══ Indexing (our own) ══ -->
    <section class="card">
      <div class="card-head"><h2>Indexing &amp; Corpus <span class="src-tag ours">internal</span></h2></div>
      {#if !indexing}
        <p class="empty">No indexing data in the snapshot yet.</p>
      {:else}
        <div class="metric-row">
          <div class="metric"><span class="m-val">{fmt(indexing.embeddings?.meili_docs)}</span><span class="m-lbl">passages in Meili</span></div>
          <div class="metric"><span class="m-val">{fmt(indexing.embeddings?.db_missing)}</span><span class="m-lbl">missing embeddings</span></div>
          <div class="metric"><span class="m-val">{fmt(indexing.extraction_remaining)}</span><span class="m-lbl">left to extract</span></div>
          <div class="metric"><span class="m-val">{fmt(indexing.content_sync_backlog)}</span><span class="m-lbl">sync backlog</span></div>
        </div>

        {#if indexing.priority_books?.length}
          <h3>Priority books — grounding progress</h3>
          <div class="rows">
            {#each indexing.priority_books.slice(0, 15) as b}
              <div class="row">
                <span class="row-name" title={b.title}>{b.title}</span>
                <div class="row-bar">
                  <div class="row-fill {b.fully_synced ? 'done' : ''}" style="width: {pct(b.synced, b.mentions)}"></div>
                </div>
                <span class="row-val">{fmt(b.synced)}/{fmt(b.mentions)}</span>
              </div>
            {/each}
          </div>
        {/if}

        {#if indexing.meili && !indexing.meili.error}
          <p class="hint">
            Meili queue — enqueued {fmt(indexing.meili.enqueued)}, processing {fmt(indexing.meili.processing)}, failed {fmt(indexing.meili.failed)}.
          </p>
        {/if}
      {/if}
    </section>
  {/if}
</div>

<style>
  .analytics { max-width: 1100px; }
  .loading, .access-denied, .error-state { text-align: center; padding: 3rem 1rem; }
  .spinner {
    width: 40px; height: 40px; border: 3px solid var(--border-default);
    border-top-color: var(--accent-primary); border-radius: 50%;
    animation: spin 1s linear infinite; margin: 0 auto 1rem;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .page-header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
  .page-header h1 { margin: 0; font-size: 1.75rem; color: var(--text-primary); }
  .generated { font-size: 0.75rem; color: var(--text-secondary); }

  .card {
    background: var(--surface-1); border: 1px solid var(--border-default);
    border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.5rem;
  }
  .card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
  .card h2 { margin: 0; font-size: 1.125rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.6rem; }
  .card h3 { margin: 1.5rem 0 0.75rem; font-size: 0.9375rem; color: var(--text-secondary); }
  .src-tag {
    font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.05em;
    padding: 0.15rem 0.5rem; border-radius: 1rem; font-weight: 600;
    background: color-mix(in srgb, var(--info) 15%, transparent); color: var(--info);
  }
  .src-tag.ours { background: color-mix(in srgb, var(--accent-tertiary) 15%, transparent); color: var(--accent-tertiary); }

  .empty { color: var(--text-secondary); font-size: 0.875rem; margin: 0; }
  .notice { background: var(--surface-2); border-radius: 0.5rem; padding: 1rem; }
  .notice p { margin: 0.5rem 0 0; font-size: 0.875rem; color: var(--text-secondary); }
  .hint { font-size: 0.75rem; color: var(--text-secondary); margin: 0.75rem 0 0; }
  code { font-family: var(--font-mono, monospace); background: var(--surface-2); padding: 0.1rem 0.3rem; border-radius: 0.25rem; }

  /* Bar chart */
  .chart { display: flex; align-items: flex-end; gap: 0.35rem; height: 160px; padding-top: 0.5rem; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .bar {
    width: 70%; min-height: 2px; border-radius: 3px 3px 0 0;
    background: var(--accent-primary); transition: opacity 0.2s;
  }
  .bar-col:hover .bar { opacity: 0.75; }
  .bar-label { font-size: 0.625rem; color: var(--text-secondary); margin-top: 0.35rem; white-space: nowrap; }
  .bar-stack { width: 70%; min-height: 2px; display: flex; flex-direction: column; border-radius: 3px 3px 0 0; overflow: hidden; }
  .seg { width: 100%; }
  .seg-search { background: var(--accent-primary); }
  .seg-chat { background: var(--accent-tertiary); }
  .legend { font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem; display: flex; gap: 1rem; }
  .key { display: inline-flex; align-items: center; gap: 0.35rem; }
  .swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }

  /* Metric row */
  .metric-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 1rem; margin-bottom: 0.5rem; }
  .metric { display: flex; flex-direction: column; gap: 0.15rem; }
  .m-val { font-size: 1.5rem; font-weight: 600; color: var(--text-primary); }
  .m-lbl { font-size: 0.75rem; color: var(--text-secondary); }

  /* Rows (top lists / bars) */
  .rows { display: flex; flex-direction: column; gap: 0.4rem; }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) 2fr auto; gap: 0.75rem; align-items: center; font-size: 0.8125rem; }
  .row.query { grid-template-columns: minmax(0, 1fr) auto auto; }
  .row-name { color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-name.mono { font-family: var(--font-mono, monospace); font-size: 0.75rem; }
  .row-meta { font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; }
  .row-bar { height: 8px; background: var(--surface-2); border-radius: 4px; overflow: hidden; }
  .row-fill { height: 100%; background: var(--accent-primary); border-radius: 4px; }
  .row-fill.done { background: var(--success); }
  .row-val { font-variant-numeric: tabular-nums; color: var(--text-secondary); white-space: nowrap; }

  .two-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem; }

  .btn {
    display: inline-block; padding: 0.5rem 1rem; background: var(--accent-primary);
    color: white; border: none; border-radius: 0.5rem; text-decoration: none; font-size: 0.875rem; cursor: pointer;
  }
</style>
