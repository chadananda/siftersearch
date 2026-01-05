<script>
  /**
   * DocumentQueue Component
   * Admin view for reviewing and approving documents
   */
  import { onMount } from 'svelte';
  import { librarian } from '../../lib/api.js';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';
  import MetadataEditor from '../MetadataEditor.svelte';

  const auth = getAuthState();

  let items = $state([]);
  let stats = $state(null);
  let loading = $state(true);
  let authReady = $state(false);
  let error = $state(null);
  let actionLoading = $state(null);

  // Filters
  let statusFilter = $state('awaiting_review');
  let page = $state(0);
  const limit = 10;

  // Modal state
  let selectedItem = $state(null);
  let showEditor = $state(false);

  // Status options
  const STATUSES = [
    { value: 'pending', label: 'Pending' },
    { value: 'analyzing', label: 'Analyzing' },
    { value: 'awaiting_review', label: 'Awaiting Review' },
    { value: 'approved', label: 'Approved' },
    { value: 'processing', label: 'Processing' },
    { value: 'completed', label: 'Completed' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'failed', label: 'Failed' }
  ];

  onMount(async () => {
    // Initialize auth before loading data (sets access token)
    await initAuth();
    authReady = true;

    // Only load data if authenticated admin
    if (auth.isAuthenticated && ['admin', 'superadmin', 'editor'].includes(auth.user?.tier)) {
      await Promise.all([loadItems(), loadStats()]);
    } else {
      loading = false;
    }
  });

  async function loadItems() {
    loading = true;
    error = null;

    try {
      const data = await librarian.getQueue({
        status: statusFilter || undefined,
        limit,
        offset: page * limit
      });
      items = data.items || [];
    } catch (err) {
      error = err.message || 'Failed to load queue';
    } finally {
      loading = false;
    }
  }

  async function loadStats() {
    try {
      stats = await librarian.getStats();
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  async function analyzeItem(id) {
    actionLoading = id;
    try {
      await librarian.updateQueueItem(id, 'analyze');
      await loadItems();
      await loadStats();
    } catch (err) {
      alert(err.message || 'Analysis failed');
    } finally {
      actionLoading = null;
    }
  }

  async function approveItem(id, metadata = null) {
    actionLoading = id;
    try {
      await librarian.updateQueueItem(id, 'approve', { metadata });
      await loadItems();
      await loadStats();
      showEditor = false;
      selectedItem = null;
    } catch (err) {
      alert(err.message || 'Approval failed');
    } finally {
      actionLoading = null;
    }
  }

  async function rejectItem(id) {
    if (!confirm('Are you sure you want to reject this document?')) return;

    actionLoading = id;
    try {
      await librarian.updateQueueItem(id, 'reject');
      await loadItems();
      await loadStats();
    } catch (err) {
      alert(err.message || 'Rejection failed');
    } finally {
      actionLoading = null;
    }
  }

  async function processItem(id) {
    actionLoading = id;
    try {
      await librarian.updateQueueItem(id, 'process');
      await loadItems();
      await loadStats();
    } catch (err) {
      alert(err.message || 'Processing failed');
    } finally {
      actionLoading = null;
    }
  }

  async function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this queue item?')) return;

    actionLoading = id;
    try {
      await librarian.deleteQueueItem(id);
      await loadItems();
      await loadStats();
    } catch (err) {
      alert(err.message || 'Delete failed');
    } finally {
      actionLoading = null;
    }
  }

  function openEditor(item) {
    selectedItem = item;
    showEditor = true;
  }

  function handleMetadataSave(event) {
    if (selectedItem) {
      approveItem(selectedItem.id, event.detail);
    }
  }

  function handleEditorCancel() {
    showEditor = false;
    selectedItem = null;
  }

  function handleFilterChange() {
    page = 0;
    loadItems();
  }

  function getStatusColor(status) {
    switch (status) {
      case 'pending': return 'pending';
      case 'analyzing': return 'processing';
      case 'awaiting_review': return 'review';
      case 'approved': return 'approved';
      case 'processing': return 'processing';
      case 'completed': return 'success';
      case 'rejected': return 'rejected';
      case 'failed': return 'failed';
      default: return '';
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  let totalPages = $derived(Math.ceil((stats?.queue?.total || 0) / limit));
</script>

<div class="document-queue">
  {#if !authReady}
    <div class="loading">
      <div class="spinner"></div>
      <p>Checking authentication...</p>
    </div>
  {:else if !auth.isAuthenticated || !['admin', 'superadmin', 'editor'].includes(auth.user?.tier)}
    <div class="access-denied">
      <h2>Access Denied</h2>
      <p>You need admin access to view this page.</p>
      <a href="/" class="btn-primary">Go to Home</a>
    </div>
  {:else}
    <header class="page-header">
      <h1>Document Queue</h1>
      <p class="subtitle">Review and approve submitted documents</p>
    </header>

    <!-- Stats Overview -->
    {#if stats?.queue}
      <div class="stats-bar">
        <div class="stat" class:active={statusFilter === 'pending'}>
          <span class="stat-count">{stats.queue.pending || 0}</span>
          <span class="stat-label">Pending</span>
        </div>
        <div class="stat" class:active={statusFilter === 'awaiting_review'}>
          <span class="stat-count">{stats.queue.awaiting_review || 0}</span>
          <span class="stat-label">Awaiting Review</span>
        </div>
        <div class="stat" class:active={statusFilter === 'approved'}>
          <span class="stat-count">{stats.queue.approved || 0}</span>
          <span class="stat-label">Approved</span>
        </div>
        <div class="stat" class:active={statusFilter === 'completed'}>
          <span class="stat-count">{stats.queue.completed || 0}</span>
          <span class="stat-label">Completed</span>
        </div>
        <div class="stat failed" class:active={statusFilter === 'failed'}>
          <span class="stat-count">{stats.queue.failed || 0}</span>
          <span class="stat-label">Failed</span>
        </div>
      </div>
    {/if}

    <!-- Filters -->
    <div class="filters">
      <select bind:value={statusFilter} onchange={handleFilterChange}>
        <option value="">All Statuses</option>
        {#each STATUSES as status}
          <option value={status.value}>{status.label}</option>
        {/each}
      </select>
    </div>

    {#if error}
      <div class="error-message">{error}</div>
    {/if}

    {#if loading}
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading queue...</p>
      </div>
    {:else if items.length === 0}
      <div class="empty-state">
        <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3>No documents in queue</h3>
        <p>Documents will appear here when users submit them.</p>
      </div>
    {:else}
      <div class="queue-list">
        {#each items as item}
          <div class="queue-item">
            <div class="item-header">
              <div class="item-info">
                <span class="item-title">
                  {item.suggested_metadata?.title || item.source_data?.file_name || item.source_data?.url || `Queue #${item.id}`}
                </span>
                <span class="item-type">{item.source_type}</span>
              </div>
              <span class="item-status status-{getStatusColor(item.status)}">
                {item.status.replace('_', ' ')}
              </span>
            </div>

            <div class="item-meta">
              {#if item.suggested_metadata?.author}
                <span>By: {item.suggested_metadata.author}</span>
              {/if}
              <span>Added: {formatDate(item.created_at)}</span>
              {#if item.target_path}
                <span>Path: {item.target_path}</span>
              {/if}
            </div>

            {#if item.error_message}
              <div class="item-error">{item.error_message}</div>
            {/if}

            <div class="item-actions">
              {#if item.status === 'pending'}
                <button
                  onclick={() => analyzeItem(item.id)}
                  class="btn-action analyze"
                  disabled={actionLoading === item.id}
                >
                  {#if actionLoading === item.id}
                    <span class="btn-spinner"></span>
                  {:else}
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Analyze
                  {/if}
                </button>
              {/if}

              {#if item.status === 'awaiting_review'}
                <button
                  onclick={() => openEditor(item)}
                  class="btn-action edit"
                  disabled={actionLoading === item.id}
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Review
                </button>
                <button
                  onclick={() => approveItem(item.id)}
                  class="btn-action approve"
                  disabled={actionLoading === item.id}
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Approve
                </button>
                <button
                  onclick={() => rejectItem(item.id)}
                  class="btn-action reject"
                  disabled={actionLoading === item.id}
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reject
                </button>
              {/if}

              {#if item.status === 'approved'}
                <button
                  onclick={() => processItem(item.id)}
                  class="btn-action process"
                  disabled={actionLoading === item.id}
                >
                  {#if actionLoading === item.id}
                    <span class="btn-spinner"></span>
                  {:else}
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Process
                  {/if}
                </button>
              {/if}

              <button
                onclick={() => deleteItem(item.id)}
                class="btn-action delete"
                disabled={actionLoading === item.id}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        {/each}
      </div>

      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="pagination">
          <button
            onclick={() => { page--; loadItems(); }}
            disabled={page === 0}
            class="btn-secondary btn-small"
          >
            Previous
          </button>
          <span class="page-info">Page {page + 1} of {totalPages}</span>
          <button
            onclick={() => { page++; loadItems(); }}
            disabled={page >= totalPages - 1}
            class="btn-secondary btn-small"
          >
            Next
          </button>
        </div>
      {/if}
    {/if}
  {/if}
</div>

<!-- Metadata Editor Modal -->
{#if showEditor && selectedItem}
  <div class="modal-backdrop" onclick={handleEditorCancel}>
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={handleEditorCancel}>
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <MetadataEditor
        metadata={selectedItem.suggested_metadata || {}}
        analysisResult={selectedItem.analysis_result}
        onsave={handleMetadataSave}
        oncancel={handleEditorCancel}
      />
    </div>
  </div>
{/if}

<style>
  .document-queue {
    max-width: 1000px;
  }

  .access-denied {
    text-align: center;
    padding: 3rem 1rem;
  }

  .page-header {
    margin-bottom: 1.5rem;
  }

  .page-header h1 {
    margin: 0;
    font-size: 1.75rem;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0.5rem 0 0;
    color: var(--text-secondary);
  }

  .stats-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
  }

  .stat {
    flex: 1;
    min-width: 100px;
    text-align: center;
    padding: 0.75rem;
    border-radius: 0.5rem;
    transition: background 0.2s;
  }

  .stat.active {
    background: var(--surface-2);
  }

  .stat-count {
    display: block;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .stat.failed .stat-count {
    color: var(--error);
  }

  .filters {
    margin-bottom: 1.5rem;
  }

  .filters select {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
  }

  .loading {
    text-align: center;
    padding: 2rem;
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

  .error-message {
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--error) 15%, transparent);
    color: var(--error);
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }

  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
  }

  .empty-icon {
    width: 64px;
    height: 64px;
    color: var(--text-muted);
    margin-bottom: 1rem;
  }

  .empty-state h3 {
    margin: 0 0 0.5rem;
    color: var(--text-primary);
  }

  .empty-state p {
    margin: 0;
    color: var(--text-secondary);
  }

  .queue-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .queue-item {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .item-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .item-title {
    font-weight: 500;
    color: var(--text-primary);
    word-break: break-word;
  }

  .item-type {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
  }

  .item-status {
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: capitalize;
    white-space: nowrap;
  }

  .status-pending {
    background: color-mix(in srgb, var(--text-muted) 15%, transparent);
    color: var(--text-secondary);
  }

  .status-processing {
    background: color-mix(in srgb, var(--info) 15%, transparent);
    color: var(--info);
  }

  .status-review {
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    color: var(--warning);
  }

  .status-approved {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }

  .status-success {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }

  .status-rejected, .status-failed {
    background: color-mix(in srgb, var(--error) 15%, transparent);
    color: var(--error);
  }

  .item-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }

  .item-error {
    padding: 0.5rem 0.75rem;
    background: color-mix(in srgb, var(--error) 10%, transparent);
    color: var(--error);
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    margin-bottom: 0.75rem;
  }

  .item-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .btn-action {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }

  .btn-action svg {
    width: 16px;
    height: 16px;
  }

  .btn-action.analyze {
    background: color-mix(in srgb, var(--info) 15%, transparent);
    color: var(--info);
  }

  .btn-action.edit {
    background: var(--surface-2);
    color: var(--text-primary);
  }

  .btn-action.approve {
    background: var(--success);
    color: white;
  }

  .btn-action.reject {
    background: var(--surface-2);
    color: var(--text-secondary);
  }

  .btn-action.reject:hover {
    background: var(--error);
    color: white;
  }

  .btn-action.process {
    background: var(--accent-primary);
    color: white;
  }

  .btn-action.delete {
    background: var(--surface-2);
    color: var(--text-muted);
    padding: 0.5rem;
  }

  .btn-action.delete:hover {
    background: var(--error);
    color: white;
  }

  .btn-action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .page-info {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .btn-primary, .btn-secondary {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }

  .btn-small {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
  }

  .btn-primary {
    background: var(--accent-primary);
    color: white;
  }

  .btn-secondary {
    background: var(--surface-2);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    z-index: 100;
  }

  .modal-content {
    position: relative;
    max-width: 700px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    background: var(--surface-0);
    border-radius: 0.75rem;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: var(--surface-2);
    border-radius: 0.375rem;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
  }

  .modal-close:hover {
    background: var(--surface-3);
    color: var(--text-primary);
  }

  .modal-close svg {
    width: 20px;
    height: 20px;
  }

  @media (max-width: 640px) {
    .stats-bar {
      flex-direction: column;
    }

    .stat {
      min-width: auto;
    }

    .item-header {
      flex-direction: column;
    }
  }
</style>
