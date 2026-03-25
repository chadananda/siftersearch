<script>
  import { onMount } from 'svelte';
  import { admin } from '../../lib/api.js';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';

  const auth = getAuthState();

  let overview = $state(null);
  let bottlenecks = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let authReady = $state(false);
  let selectedLanguage = $state('');
  let activeTab = $state('overview');

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
      const [overviewData, bottleneckData] = await Promise.all([
        admin.getLibraryOverview(),
        admin.getLibraryBottlenecks({ language: selectedLanguage || undefined })
      ]);
      overview = overviewData;
      bottlenecks = bottleneckData;
    } catch (err) {
      error = err.message || 'Failed to load library data';
    } finally {
      loading = false;
    }
  }

  async function filterByLanguage() {
    const data = await admin.getLibraryBottlenecks({ language: selectedLanguage || undefined });
    bottlenecks = data;
  }

  function formatNumber(n) {
    if (n == null) return '0';
    return Number(n).toLocaleString();
  }

  function pipelinePercent(lang) {
    const total = lang.paragraph_count || 0;
    if (total === 0) return { embedded: 0, synced: 0, pending: 0 };
    return {
      embedded: Math.round(((total - (lang.pending_embedding || 0)) / total) * 100),
      synced: Math.round(((lang.synced || 0) / total) * 100),
      pending: Math.round(((lang.pending_embedding || 0) / total) * 100)
    };
  }
</script>

{#if loading}
  <div class="loading">Loading library data...</div>
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
      <h1>Library Management</h1>
      <button class="refresh-btn" onclick={loadData}>Refresh</button>
    </div>

    <!-- Summary Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon docs">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{formatNumber(overview?.totalDocuments)}</span>
          <span class="stat-label">Documents</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon paragraphs">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{formatNumber(overview?.embedding?.total)}</span>
          <span class="stat-label">Paragraphs</span>
        </div>
      </div>

      <div class="stat-card" class:warning={overview?.embedding?.missing_embeddings > 0}>
        <div class="stat-icon embedding">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{formatNumber(overview?.embedding?.missing_embeddings)}</span>
          <span class="stat-label">Pending Embeddings</span>
        </div>
      </div>

      <div class="stat-card" class:warning={overview?.dirty?.paragraphs > 0}>
        <div class="stat-icon sync">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value">{formatNumber(overview?.dirty?.paragraphs)}</span>
          <span class="stat-label">Pending Sync ({overview?.dirty?.documents || 0} docs)</span>
        </div>
      </div>

      {#if overview?.unresolvedFailures > 0}
        <div class="stat-card warning">
          <div class="stat-icon failures">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{overview.unresolvedFailures}</span>
            <span class="stat-label">Unresolved Failures</span>
          </div>
        </div>
      {/if}
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab" class:active={activeTab === 'overview'} onclick={() => activeTab = 'overview'}>By Language</button>
      <button class="tab" class:active={activeTab === 'bottlenecks'} onclick={() => activeTab = 'bottlenecks'}>Bottlenecks</button>
      <button class="tab" class:active={activeTab === 'recent'} onclick={() => activeTab = 'recent'}>Recent Documents</button>
    </div>

    {#if activeTab === 'overview'}
      <!-- Pipeline by Language -->
      <section class="card">
        <h2>Pipeline Status by Language</h2>
        <div class="language-grid">
          {#each overview?.byLanguage || [] as lang}
            {@const pct = pipelinePercent(lang)}
            <div class="language-card">
              <div class="language-header">
                <span class="language-name">{lang.language || 'unknown'}</span>
                <span class="language-count">{formatNumber(lang.doc_count)} docs / {formatNumber(lang.paragraph_count)} paragraphs</span>
              </div>
              <div class="pipeline-bar">
                <div class="pipeline-segment synced" style="width: {pct.synced}%" title="Synced: {pct.synced}%"></div>
                <div class="pipeline-segment embedded" style="width: {pct.embedded - pct.synced}%" title="Embedded (pending sync): {pct.embedded - pct.synced}%"></div>
                <div class="pipeline-segment pending" style="width: {pct.pending}%" title="Pending embedding: {pct.pending}%"></div>
              </div>
              <div class="pipeline-legend">
                <span class="legend-item synced">Synced {pct.synced}%</span>
                <span class="legend-item embedded">Embedded {pct.embedded}%</span>
                {#if pct.pending > 0}
                  <span class="legend-item pending">Pending {formatNumber(lang.pending_embedding)}</span>
                {/if}
              </div>
            </div>
          {:else}
            <p class="empty">No documents in library</p>
          {/each}
        </div>
      </section>

    {:else if activeTab === 'bottlenecks'}
      <!-- Bottleneck Detail -->
      <section class="card">
        <div class="table-header">
          <h2>Pipeline Bottlenecks</h2>
          <select bind:value={selectedLanguage} onchange={filterByLanguage}>
            <option value="">All Languages</option>
            {#each overview?.byLanguage || [] as lang}
              <option value={lang.language}>{lang.language}</option>
            {/each}
          </select>
        </div>

        {#if bottlenecks?.pendingEmbedding?.length > 0}
          <h3>Pending Embedding</h3>
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Language</th>
                <th>Pending</th>
              </tr>
            </thead>
            <tbody>
              {#each bottlenecks.pendingEmbedding as doc}
                <tr>
                  <td>
                    <span class="doc-title">{doc.title || doc.file_path}</span>
                    {#if doc.author}<span class="doc-author">{doc.author}</span>{/if}
                  </td>
                  <td>{doc.language}</td>
                  <td class="text-warning">{doc.pending_paragraphs}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}

        {#if bottlenecks?.pendingSync?.length > 0}
          <h3>Pending Sync</h3>
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Language</th>
                <th>Unsynced</th>
              </tr>
            </thead>
            <tbody>
              {#each bottlenecks.pendingSync as doc}
                <tr>
                  <td>
                    <span class="doc-title">{doc.title || 'Untitled'}</span>
                    {#if doc.author}<span class="doc-author">{doc.author}</span>{/if}
                  </td>
                  <td>{doc.language}</td>
                  <td>{doc.unsynced_paragraphs}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}

        {#if bottlenecks?.failures?.length > 0}
          <h3>Unresolved Failures</h3>
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Error</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {#each bottlenecks.failures as fail}
                <tr>
                  <td class="doc-title">{fail.file_name || fail.file_path}</td>
                  <td><span class="badge error">{fail.error_type}</span> {fail.error_message}</td>
                  <td class="text-muted">{new Date(fail.created_at).toLocaleDateString()}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}

        {#if !bottlenecks?.pendingEmbedding?.length && !bottlenecks?.pendingSync?.length && !bottlenecks?.failures?.length}
          <p class="empty">No bottlenecks detected. Pipeline is healthy.</p>
        {/if}
      </section>

    {:else if activeTab === 'recent'}
      <!-- Recent Documents -->
      <section class="card">
        <h2>Recently Updated Documents</h2>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Language</th>
              <th>Collection</th>
              <th>Paragraphs</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {#each overview?.recentDocuments || [] as doc}
              <tr>
                <td class="doc-title">{doc.title || 'Untitled'}</td>
                <td>{doc.author || '-'}</td>
                <td>{doc.language}</td>
                <td>{doc.collection || doc.religion || '-'}</td>
                <td>
                  {doc.paragraph_count}
                  {#if doc.pending_embedding > 0}
                    <span class="badge warning">{doc.pending_embedding} pending</span>
                  {/if}
                </td>
                <td class="text-muted">{new Date(doc.updated_at).toLocaleDateString()}</td>
              </tr>
            {:else}
              <tr><td colspan="6" class="empty">No documents</td></tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}
  </div>
{/if}

<style>
  .dashboard {
    max-width: 1200px;
  }

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

  .refresh-btn {
    padding: 0.5rem 1rem;
    background: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .refresh-btn:hover {
    background: var(--surface-3);
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
    color: var(--text-secondary);
  }

  .access-denied, .error-state {
    text-align: center;
    padding: 3rem;
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
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
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

  .stat-card.warning {
    border-color: var(--warning);
  }

  .stat-icon {
    width: 40px;
    height: 40px;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .stat-icon svg {
    width: 20px;
    height: 20px;
  }

  .stat-icon.docs { background: color-mix(in srgb, var(--accent-primary) 15%, transparent); color: var(--accent-primary); }
  .stat-icon.paragraphs { background: color-mix(in srgb, var(--info) 15%, transparent); color: var(--info); }
  .stat-icon.embedding { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
  .stat-icon.sync { background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); }
  .stat-icon.failures { background: color-mix(in srgb, var(--error) 15%, transparent); color: var(--error); }

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

  .tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--border-default);
    padding-bottom: 0;
  }

  .tab {
    padding: 0.625rem 1rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
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

  .card h3 {
    margin: 1.5rem 0 0.75rem;
    font-size: 1rem;
    color: var(--text-secondary);
  }

  .card h3:first-of-type {
    margin-top: 0;
  }

  .table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .table-header h2 {
    margin: 0;
  }

  .table-header select {
    padding: 0.375rem 0.75rem;
    background: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 0.375rem;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .language-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .language-card {
    padding: 1rem;
    background: var(--surface-0);
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
  }

  .language-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .language-name {
    font-weight: 600;
    color: var(--text-primary);
    text-transform: uppercase;
    font-size: 0.875rem;
  }

  .language-count {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .pipeline-bar {
    height: 8px;
    background: var(--surface-2);
    border-radius: 4px;
    overflow: hidden;
    display: flex;
  }

  .pipeline-segment {
    height: 100%;
    transition: width 0.3s;
  }

  .pipeline-segment.synced { background: var(--success); }
  .pipeline-segment.embedded { background: var(--info); }
  .pipeline-segment.pending { background: var(--warning); }

  .pipeline-legend {
    display: flex;
    gap: 1rem;
    margin-top: 0.5rem;
    font-size: 0.75rem;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--text-muted);
  }

  .legend-item::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .legend-item.synced::before { background: var(--success); }
  .legend-item.embedded::before { background: var(--info); }
  .legend-item.pending::before { background: var(--warning); }

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

  .doc-title {
    font-weight: 500;
    display: block;
  }

  .doc-author {
    font-size: 0.8rem;
    color: var(--text-muted);
    display: block;
  }

  .text-muted { color: var(--text-muted); }
  .text-warning { color: var(--warning); font-weight: 600; }

  .badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .badge.warning {
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    color: var(--warning);
  }

  .badge.error {
    background: color-mix(in srgb, var(--error) 15%, transparent);
    color: var(--error);
  }

  .empty {
    color: var(--text-muted);
    font-size: 0.875rem;
    text-align: center;
    padding: 2rem;
  }
</style>
