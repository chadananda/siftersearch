<script>
  import { onMount } from 'svelte';
  import { getAuthState } from '../../lib/auth.svelte.js';
  import TreeView from './TreeView.svelte';
  import DocumentList from './DocumentList.svelte';
  import DocumentDetail from './DocumentDetail.svelte';
  import FilterPanel from './FilterPanel.svelte';
  import CollectionDetail from './CollectionDetail.svelte';

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  const auth = getAuthState();

  // State
  let treeData = $state([]);
  let documents = $state([]);
  let selectedDocument = $state(null);
  let selectedNode = $state(null); // Currently selected collection/religion node
  let loading = $state(true);
  let error = $state(null);
  let stats = $state(null);
  let scrollSentinel = $state(null);
  let observer = $state(null);

  // Filters
  let filters = $state({
    search: '',
    religion: null,
    collection: null,
    language: null,
    author: null,
    yearFrom: null,
    yearTo: null,
    status: 'all'
  });

  let showFilters = $state(false);
  let totalDocuments = $state(0);
  let currentOffset = $state(0);
  const LIMIT = 100;

  // Derived
  let isAdmin = $derived(auth.user?.tier === 'admin' || auth.user?.tier === 'superadmin');
  let hasActiveFilters = $derived(
    filters.religion || filters.collection || filters.language ||
    filters.author || filters.yearFrom || filters.yearTo ||
    filters.status !== 'all' || filters.search
  );
  let showCollectionDetail = $derived(
    selectedNode && selectedNode.node_type === 'collection' && selectedNode.religionSlug
  );

  // Fetch tree structure - try library nodes first, fallback to tree endpoint
  async function fetchTree() {
    try {
      // Try the new nodes endpoint first (has slugs for collection pages)
      let res = await fetch(`${API_BASE}/api/library/nodes`);
      if (res.ok) {
        const data = await res.json();
        // Transform nodes to match TreeView expected format
        treeData = (data.nodes || []).map(religion => ({
          name: religion.name,
          slug: religion.slug,
          count: religion.document_count || 0,
          collections: (religion.children || []).map(c => ({
            name: c.name,
            slug: c.slug,
            count: c.document_count || 0,
            religionSlug: religion.slug,
            religionName: religion.name
          }))
        }));
        return;
      }

      // Fallback to legacy tree endpoint (no slugs, no collection pages)
      console.warn('Nodes endpoint unavailable, falling back to tree endpoint');
      res = await fetch(`${API_BASE}/api/library/tree`);
      if (!res.ok) throw new Error('Failed to load library tree');
      const data = await res.json();
      // Transform to match expected format (without slugs)
      treeData = (data.religions || []).map(religion => ({
        name: religion.name,
        slug: null, // No slug available in legacy endpoint
        count: religion.count || 0,
        collections: (religion.collections || []).map(c => ({
          name: c.name,
          slug: null,
          count: c.count || 0,
          religionSlug: null,
          religionName: religion.name
        }))
      }));
    } catch (err) {
      console.error('Tree fetch error:', err);
      error = err.message;
    }
  }

  // Fetch documents
  async function fetchDocuments(reset = false) {
    if (reset) {
      currentOffset = 0;
      documents = [];
    }

    loading = true;
    try {
      const params = new URLSearchParams();
      params.set('limit', LIMIT.toString());
      params.set('offset', currentOffset.toString());

      if (filters.search) params.set('search', filters.search);
      if (filters.religion) params.set('religion', filters.religion);
      if (filters.collection) params.set('collection', filters.collection);
      if (filters.language) params.set('language', filters.language);
      if (filters.author) params.set('author', filters.author);
      if (filters.yearFrom) params.set('yearFrom', filters.yearFrom.toString());
      if (filters.yearTo) params.set('yearTo', filters.yearTo.toString());
      if (filters.status !== 'all') params.set('status', filters.status);

      const res = await fetch(`${API_BASE}/api/library/documents?${params}`);
      if (!res.ok) throw new Error('Failed to load documents');
      const data = await res.json();

      if (reset) {
        documents = data.documents || [];
      } else {
        documents = [...documents, ...(data.documents || [])];
      }
      totalDocuments = data.total || 0;
    } catch (err) {
      console.error('Documents fetch error:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Fetch stats
  async function fetchStats() {
    try {
      const res = await fetch(`${API_BASE}/api/library/stats`);
      if (!res.ok) throw new Error('Failed to load stats');
      stats = await res.json();
    } catch (err) {
      console.error('Stats fetch error:', err);
    }
  }

  // Handle tree selection
  function handleTreeSelect(event) {
    const { religion, collection, node } = event.detail;
    filters = {
      ...filters,
      religion: religion || null,
      collection: collection || null
    };

    // Set selected node for collection detail view
    if (node && node.node_type === 'collection') {
      selectedNode = node;
      selectedDocument = null; // Close any open document detail
    } else {
      selectedNode = null;
      fetchDocuments(true);
    }
  }

  // Handle filter change
  function handleFilterChange() {
    fetchDocuments(true);
  }

  // Handle document select
  function handleDocumentSelect(doc) {
    selectedDocument = doc;
  }

  // Close detail panel
  function closeDetail() {
    selectedDocument = null;
  }

  // Load more documents
  function loadMore() {
    currentOffset += LIMIT;
    fetchDocuments(false);
  }

  // Clear filters
  function clearFilters() {
    filters = {
      search: '',
      religion: null,
      collection: null,
      language: null,
      author: null,
      yearFrom: null,
      yearTo: null,
      status: 'all'
    };
    fetchDocuments(true);
  }

  // Handle document update from detail panel
  function handleDocumentUpdate(event) {
    const updatedDoc = event.detail;
    documents = documents.map(d => d.id === updatedDoc.id ? { ...d, ...updatedDoc } : d);
  }

  // Handle document selection from collection detail
  function handleCollectionDocumentSelect(doc) {
    selectedDocument = doc;
  }

  // Handle collection edit (admin)
  function handleCollectionEdit(node) {
    // TODO: Open collection editor modal
    console.log('Edit collection:', node);
  }

  // Go back from collection detail to document list
  function backToDocumentList() {
    selectedNode = null;
    fetchDocuments(true);
  }

  onMount(() => {
    fetchTree();
    fetchDocuments(true);
    fetchStats();

    // Setup infinite scroll observer
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && documents.length < totalDocuments) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );

    return () => {
      if (observer) observer.disconnect();
    };
  });

  // Watch sentinel element for infinite scroll
  $effect(() => {
    if (scrollSentinel && observer) {
      observer.observe(scrollSentinel);
      return () => observer.unobserve(scrollSentinel);
    }
  });
</script>

<div class="library-browser">
  <!-- Sidebar with tree -->
  <aside class="library-sidebar">
    <div class="sidebar-header">
      <h2 class="sidebar-title">Library</h2>
      {#if stats}
        <div class="stats-badge">
          {stats.totalDocuments.toLocaleString()} documents
        </div>
      {/if}
    </div>
    <TreeView
      religions={treeData}
      selectedReligion={filters.religion}
      selectedCollection={filters.collection}
      on:select={handleTreeSelect}
    />
  </aside>

  <!-- Main content area -->
  <main class="library-main">
    {#if showCollectionDetail}
      <!-- Collection detail view -->
      <CollectionDetail
        religionSlug={selectedNode.religionSlug}
        collectionSlug={selectedNode.slug}
        onDocumentSelect={handleCollectionDocumentSelect}
        onEdit={isAdmin ? handleCollectionEdit : null}
      />
    {:else}
      <!-- Default document list view -->
      <!-- Top bar with search and filters -->
      <div class="library-topbar">
        <div class="search-container">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            class="search-input"
            placeholder="Search documents..."
            bind:value={filters.search}
            onkeydown={(e) => e.key === 'Enter' && handleFilterChange()}
          />
          {#if filters.search}
            <button class="search-clear" onclick={() => { filters.search = ''; handleFilterChange(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          {/if}
        </div>

        <button
          class="filter-toggle"
          class:active={showFilters}
          onclick={() => showFilters = !showFilters}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          Filters
          {#if hasActiveFilters}
            <span class="filter-count">{Object.values(filters).filter(v => v && v !== 'all').length}</span>
          {/if}
        </button>

        {#if hasActiveFilters}
          <button class="clear-filters" onclick={clearFilters}>
            Clear all
          </button>
        {/if}

        <div class="result-count">
          {totalDocuments.toLocaleString()} {totalDocuments === 1 ? 'document' : 'documents'}
        </div>
      </div>

      <!-- Filter panel -->
      {#if showFilters}
        <FilterPanel
          bind:filters
          {stats}
          on:change={handleFilterChange}
        />
      {/if}

      <!-- Document list -->
      <div class="document-container">
        {#if loading && documents.length === 0}
          <div class="loading-state">
            <svg class="spinner" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
            </svg>
            <span>Loading documents...</span>
          </div>
        {:else if error}
          <div class="error-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{error}</span>
            <button onclick={() => { error = null; fetchDocuments(true); }}>Retry</button>
          </div>
        {:else if documents.length === 0}
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            <span>No documents found</span>
            {#if hasActiveFilters}
              <button onclick={clearFilters}>Clear filters</button>
            {/if}
          </div>
        {:else}
          <DocumentList
            {documents}
            selectedId={selectedDocument?.id}
            {isAdmin}
            on:select={(e) => handleDocumentSelect(e.detail)}
          />

          <!-- Infinite scroll sentinel -->
          {#if documents.length < totalDocuments}
            <div bind:this={scrollSentinel} class="scroll-sentinel">
              {#if loading}
                <svg class="spinner" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
                </svg>
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </main>

  <!-- Detail panel (slides in from right) -->
  {#if selectedDocument}
    <DocumentDetail
      document={selectedDocument}
      {isAdmin}
      on:close={closeDetail}
      on:update={handleDocumentUpdate}
    />
  {/if}
</div>

<style>
  .library-browser {
    display: flex;
    height: calc(100vh - 3.5rem);
    background: var(--surface-0);
  }

  /* Sidebar */
  .library-sidebar {
    width: 280px;
    flex-shrink: 0;
    border-right: 1px solid var(--border-default);
    background: var(--surface-1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border-default);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .sidebar-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .stats-badge {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted);
    background: var(--surface-2);
    padding: 0.25rem 0.5rem;
    border-radius: 1rem;
  }

  /* Main content */
  .library-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .library-topbar {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-default);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .search-container {
    flex: 1;
    min-width: 200px;
    max-width: 400px;
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
    width: 100%;
    padding: 0.5rem 2rem 0.5rem 2.25rem;
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
    right: 0.5rem;
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

  .filter-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .filter-toggle:hover {
    background: var(--surface-2);
    color: var(--text-primary);
  }

  .filter-toggle.active {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
  }

  .filter-toggle svg {
    width: 1rem;
    height: 1rem;
  }

  .filter-count {
    background: white;
    color: var(--accent-primary);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: 1rem;
    min-width: 1.25rem;
    text-align: center;
  }

  .clear-filters {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--error);
    background: none;
    border: none;
    cursor: pointer;
    border-radius: 0.5rem;
  }

  .clear-filters:hover {
    background: color-mix(in srgb, var(--error) 10%, transparent);
  }

  .result-count {
    margin-left: auto;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  /* Document container */
  .document-container {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  /* Loading state */
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

  /* Infinite scroll sentinel */
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
    animation: spin 1s linear infinite;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .library-browser {
      flex-direction: column;
      height: auto;
      min-height: calc(100vh - 3.5rem);
    }

    .library-sidebar {
      width: 100%;
      max-height: 40vh;
      border-right: none;
      border-bottom: 1px solid var(--border-default);
    }

    .library-topbar {
      flex-wrap: wrap;
    }

    .search-container {
      width: 100%;
      max-width: none;
    }

    .result-count {
      width: 100%;
      margin-left: 0;
      text-align: center;
    }
  }
</style>
