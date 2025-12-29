<script>
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import { getAuthState } from '../../lib/auth.svelte.js';
  import CollectionHeader from './CollectionHeader.svelte';
  import DocumentList from './DocumentList.svelte';

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  const auth = getAuthState();

  let {
    religionSlug = '',
    collectionSlug = '',
    onDocumentSelect = null,
    onEdit = null
  } = $props();

  // State
  let node = $state(null);
  let documents = $state([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state(null);
  let searchQuery = $state('');
  let totalDocuments = $state(0);
  let currentOffset = $state(0);
  const LIMIT = 50;

  // Derived
  let isAdmin = $derived(auth.user?.tier === 'admin' || auth.user?.tier === 'superadmin');
  let hasMore = $derived(documents.length < totalDocuments);
  let overviewHtml = $derived(node?.overview ? marked.parse(node.overview) : '');

  // Fetch collection details and documents
  async function fetchCollection(reset = true) {
    if (reset) {
      loading = true;
      currentOffset = 0;
      documents = [];
    } else {
      loadingMore = true;
    }

    try {
      const params = new URLSearchParams();
      params.set('limit', LIMIT.toString());
      params.set('offset', currentOffset.toString());
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(
        `${API_BASE}/api/library/by-slug/${religionSlug}/${collectionSlug}?${params}`
      );

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Collection not found');
        }
        throw new Error('Failed to load collection');
      }

      const data = await res.json();
      node = data.node;
      totalDocuments = data.total_documents;

      if (reset) {
        documents = data.documents || [];
      } else {
        documents = [...documents, ...(data.documents || [])];
      }
    } catch (err) {
      console.error('Collection fetch error:', err);
      error = err.message;
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  // Handle search
  function handleSearch() {
    fetchCollection(true);
  }

  // Load more documents
  function loadMore() {
    if (loadingMore || !hasMore) return;
    currentOffset += LIMIT;
    fetchCollection(false);
  }

  // Handle document selection
  function handleDocumentSelect(event) {
    if (onDocumentSelect) {
      onDocumentSelect(event.detail);
    }
  }

  // Handle edit click
  function handleEdit() {
    if (onEdit) {
      onEdit(node);
    }
  }

  // Refetch when slugs change
  $effect(() => {
    if (religionSlug && collectionSlug) {
      searchQuery = '';
      fetchCollection(true);
    }
  });

  // Setup intersection observer for infinite scroll
  let scrollSentinel = $state(null);
  let observer = $state(null);

  onMount(() => {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && hasMore) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );

    return () => {
      if (observer) observer.disconnect();
    };
  });

  $effect(() => {
    if (scrollSentinel && observer) {
      observer.observe(scrollSentinel);
      return () => observer.unobserve(scrollSentinel);
    }
  });
</script>

<div class="collection-detail">
  {#if loading && !node}
    <div class="loading-state">
      <svg class="spinner" viewBox="0 0 24 24" width="48" height="48">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
      </svg>
      <span>Loading collection...</span>
    </div>
  {:else if error}
    <div class="error-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>{error}</span>
      <button onclick={() => { error = null; fetchCollection(true); }}>Retry</button>
    </div>
  {:else if node}
    <CollectionHeader
      {node}
      documentCount={totalDocuments}
      {isAdmin}
      onEdit={isAdmin ? handleEdit : null}
    />

    <!-- Overview section (if has content) -->
    {#if overviewHtml}
      <section class="overview-section">
        <h2>About this Collection</h2>
        <div class="overview-content">
          {@html overviewHtml}
        </div>
      </section>
    {/if}

    <!-- Search within collection -->
    <div class="collection-search">
      <div class="search-container">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          class="search-input"
          placeholder="Search within {node.name}..."
          bind:value={searchQuery}
          onkeydown={(e) => e.key === 'Enter' && handleSearch()}
        />
        {#if searchQuery}
          <button class="search-clear" onclick={() => { searchQuery = ''; handleSearch(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        {/if}
        <button class="search-btn" onclick={handleSearch}>
          Search
        </button>
      </div>
    </div>

    <!-- Documents section -->
    <section class="documents-section">
      <div class="section-header">
        <h2>Documents</h2>
        <span class="document-count">
          {#if searchQuery}
            {totalDocuments.toLocaleString()} {totalDocuments === 1 ? 'result' : 'results'}
          {:else}
            {totalDocuments.toLocaleString()} {totalDocuments === 1 ? 'document' : 'documents'}
          {/if}
        </span>
      </div>

      {#if loading}
        <div class="loading-state small">
          <svg class="spinner" viewBox="0 0 24 24" width="32" height="32">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
          </svg>
        </div>
      {:else if documents.length === 0}
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <span>
            {#if searchQuery}
              No documents match your search
            {:else}
              No documents in this collection
            {/if}
          </span>
          {#if searchQuery}
            <button onclick={() => { searchQuery = ''; handleSearch(); }}>Clear search</button>
          {/if}
        </div>
      {:else}
        <DocumentList
          {documents}
          selectedId={null}
          {isAdmin}
          on:select={handleDocumentSelect}
        />

        <!-- Infinite scroll sentinel -->
        {#if hasMore}
          <div bind:this={scrollSentinel} class="scroll-sentinel">
            {#if loadingMore}
              <svg class="spinner" viewBox="0 0 24 24" width="24" height="24">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
              </svg>
            {/if}
          </div>
        {/if}
      {/if}
    </section>
  {/if}
</div>

<style>
  .collection-detail {
    padding: 1rem;
    max-width: 900px;
    margin: 0 auto;
  }

  /* Loading and error states */
  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem;
    color: var(--text-muted);
    text-align: center;
  }

  .loading-state.small {
    padding: 2rem;
  }

  .loading-state svg,
  .error-state svg,
  .empty-state svg {
    width: 3rem;
    height: 3rem;
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .error-state {
    color: var(--error);
  }

  .error-state button,
  .empty-state button {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    color: var(--accent-primary);
    background: none;
    border: 1px solid var(--accent-primary);
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .error-state button:hover,
  .empty-state button:hover {
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  }

  /* Overview section */
  .overview-section {
    margin-top: 1.5rem;
    margin-bottom: 1.5rem;
    padding: 1.25rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
  }

  .overview-section h2 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .overview-content {
    font-size: 0.9375rem;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .overview-content :global(p) {
    margin: 0 0 0.75rem;
  }

  .overview-content :global(p:last-child) {
    margin-bottom: 0;
  }

  /* Search section */
  .collection-search {
    margin-top: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .search-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    position: relative;
  }

  .search-icon {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1rem;
    height: 1rem;
    color: var(--text-muted);
    pointer-events: none;
  }

  .search-input {
    flex: 1;
    padding: 0.625rem 2.25rem 0.625rem 2.5rem;
    font-size: 0.875rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 20%, transparent);
  }

  .search-clear {
    position: absolute;
    right: 5.5rem;
    top: 50%;
    transform: translateY(-50%);
    padding: 0.25rem;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: 0.25rem;
  }

  .search-clear:hover {
    color: var(--text-primary);
    background: var(--hover-overlay);
  }

  .search-clear svg {
    width: 1rem;
    height: 1rem;
  }

  .search-btn {
    padding: 0.625rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: white;
    background: var(--accent-primary);
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .search-btn:hover {
    background: var(--accent-primary-hover);
  }

  /* Documents section */
  .documents-section {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    overflow: hidden;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border-default);
    background: var(--surface-1);
  }

  .section-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .document-count {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  /* Scroll sentinel */
  .scroll-sentinel {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 2rem;
    min-height: 60px;
  }

  .scroll-sentinel .spinner {
    width: 1.5rem;
    height: 1.5rem;
    color: var(--text-muted);
  }

  /* Responsive */
  @media (max-width: 640px) {
    .collection-detail {
      padding: 0.75rem;
    }

    .search-container {
      flex-wrap: wrap;
    }

    .search-input {
      width: 100%;
      padding-right: 2.5rem;
    }

    .search-clear {
      right: 0.75rem;
    }

    .search-btn {
      width: 100%;
      margin-top: 0.5rem;
    }
  }
</style>
