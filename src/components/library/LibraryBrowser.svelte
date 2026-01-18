<script>
  import { onMount } from 'svelte';
  import { getAuthState, requireAuth } from '../../lib/auth.svelte.js';
  import { authenticatedFetch } from '../../lib/api.js';
  import TreeView from './TreeView.svelte';
  import DocumentList from './DocumentList.svelte';
  import FilterPanel from './FilterPanel.svelte';
  import CollectionDetail from './CollectionDetail.svelte';
  import ReligionHeader from './ReligionHeader.svelte';
  import LibraryHeader from './LibraryHeader.svelte';
  import NodeEditModal from './NodeEditModal.svelte';

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  const auth = getAuthState();

  // State
  let treeData = $state([]);
  let documents = $state([]);
  let selectedNode = $state(null);
  let selectedReligionNode = $state(null);  // Full religion node with symbol/description
  let loading = $state(true);
  let error = $state(null);
  let stats = $state(null);
  let scrollSentinel = $state(null);
  let observer = $state(null);
  let showFilters = $state(false);
  let totalDocuments = $state(0);
  let currentOffset = $state(0);
  let editModalOpen = $state(false);
  let editingNode = $state(null);
  const LIMIT = 100;

  // Recent activity view state
  let viewMode = $state('documents'); // 'documents' | 'recent'
  let recentDocuments = $state([]);
  let recentLoading = $state(false);
  let recentTotal = $state(0);
  let recentOffset = $state(0);
  let recentType = $state('all'); // 'all' | 'added' | 'modified' | 'pending'
  let recentDays = $state(30);

  // Pending documents state (admin only)
  let pendingDocuments = $state([]);
  let pendingLoading = $state(false);
  let pendingTotal = $state(0);
  let ingestingPath = $state(null); // Track which document is being ingested

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

  // Derived
  let isAdmin = $derived(auth.user?.tier === 'admin' || auth.user?.tier === 'superadmin');
  let hasActiveFilters = $derived(
    filters.religion || filters.collection || filters.language ||
    filters.author || filters.yearFrom || filters.yearTo ||
    filters.status !== 'all' || filters.search
  );
  let showCollectionDetail = $derived(
    selectedNode?.node_type === 'collection' && selectedNode?.religionSlug
  );
  let showReligionHeader = $derived(
    selectedReligionNode && !showCollectionDetail
  );
  let showLibraryHeader = $derived(
    !showCollectionDetail && !showReligionHeader
  );

  // Debounce timer for search
  let searchDebounceTimer = null;

  // Route guard - redirect to home if not authenticated
  $effect(() => {
    if (!auth.loading && !auth.isAuthenticated) {
      requireAuth('/');
    }
  });

  async function fetchTree() {
    try {
      let res = await authenticatedFetch(`${API_BASE}/api/library/nodes`);
      if (res.ok) {
        const data = await res.json();
        treeData = (data.nodes || []).map(religion => ({
          id: religion.id,
          name: religion.name,
          slug: religion.slug,
          symbol: religion.symbol,
          description: religion.description,
          count: religion.document_count || 0,
          collections: (religion.children || []).map(c => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            description: c.description,
            cover_image_url: c.cover_image_url,
            authority_default: c.authority_default,
            count: c.document_count || 0,
            religionSlug: religion.slug,
            religionName: religion.name
          }))
        }));
        return;
      }
      // Fallback to legacy tree endpoint
      res = await authenticatedFetch(`${API_BASE}/api/library/tree`);
      if (!res.ok) throw new Error('Failed to load library tree');
      const data = await res.json();
      treeData = (data.religions || []).map(religion => ({
        name: religion.name,
        slug: null,
        count: religion.count || 0,
        collections: (religion.collections || []).map(c => ({
          name: c.name, slug: null, count: c.count || 0,
          religionSlug: null, religionName: religion.name
        }))
      }));
    } catch (err) {
      error = err.message;
    }
  }

  async function fetchDocuments(reset = false) {
    if (reset) { currentOffset = 0; documents = []; }
    loading = true;
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: currentOffset });
      if (filters.search) params.set('search', filters.search);
      if (filters.religion) params.set('religion', filters.religion);
      if (filters.collection) params.set('collection', filters.collection);
      if (filters.language) params.set('language', filters.language);
      if (filters.author) params.set('author', filters.author);
      if (filters.yearFrom) params.set('yearFrom', filters.yearFrom);
      if (filters.yearTo) params.set('yearTo', filters.yearTo);
      if (filters.status !== 'all') params.set('status', filters.status);

      const res = await authenticatedFetch(`${API_BASE}/api/library/documents?${params}`);
      if (!res.ok) throw new Error('Failed to load documents');
      const data = await res.json();
      documents = reset ? data.documents || [] : [...documents, ...(data.documents || [])];
      totalDocuments = data.total || 0;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function fetchStats() {
    try {
      const res = await authenticatedFetch(`${API_BASE}/api/library/stats`);
      if (res.ok) stats = await res.json();
    } catch {}
  }

  async function fetchRecentDocuments(reset = false) {
    if (reset) { recentOffset = 0; recentDocuments = []; }
    recentLoading = true;
    try {
      const params = new URLSearchParams({
        type: recentType,
        days: recentDays,
        limit: LIMIT,
        offset: recentOffset
      });
      const res = await authenticatedFetch(`${API_BASE}/api/library/recent?${params}`);
      if (!res.ok) throw new Error('Failed to load recent documents');
      const data = await res.json();
      recentDocuments = reset ? data.documents || [] : [...recentDocuments, ...(data.documents || [])];
      recentTotal = data.total || 0;
    } catch (err) {
      error = err.message;
    } finally {
      recentLoading = false;
    }
  }

  function switchToRecentView() {
    viewMode = 'recent';
    selectedNode = null;
    selectedReligionNode = null;
    if (recentDocuments.length === 0) {
      fetchRecentDocuments(true);
    }
  }

  function switchToDocumentsView() {
    viewMode = 'documents';
  }

  async function fetchPendingDocuments() {
    pendingLoading = true;
    try {
      const res = await authenticatedFetch(`${API_BASE}/api/library/pending`);
      if (!res.ok) throw new Error('Failed to load pending documents');
      const data = await res.json();
      pendingDocuments = data.documents || [];
      pendingTotal = data.total || 0;
    } catch (err) {
      error = err.message;
    } finally {
      pendingLoading = false;
    }
  }

  async function forceIngest(filePath) {
    ingestingPath = filePath;
    try {
      const res = await authenticatedFetch(`${API_BASE}/api/library/pending/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: filePath })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to ingest document');
      }
      // Remove from pending list
      pendingDocuments = pendingDocuments.filter(d => d.file_path !== filePath);
      pendingTotal = pendingDocuments.length;
      // Refresh recent documents to show the newly ingested doc
      if (recentType !== 'pending') {
        fetchRecentDocuments(true);
      }
    } catch (err) {
      error = err.message;
    } finally {
      ingestingPath = null;
    }
  }

  function handleTreeSelect(event) {
    const { religion, collection, node } = event.detail;
    filters = { ...filters, religion: religion || null, collection: collection || null };
    viewMode = 'documents'; // Switch back to documents view when tree node selected

    if (node?.node_type === 'collection') {
      selectedNode = node;
      // Find the religion this collection belongs to
      const religionData = treeData.find(r => r.name === religion);
      selectedReligionNode = religionData || null;
    } else if (node?.node_type === 'religion' || religion) {
      // Religion selected (no collection)
      selectedNode = null;
      // Find full religion data including symbol
      const religionData = treeData.find(r => r.name === religion);
      selectedReligionNode = religionData ? {
        ...religionData,
        node_type: 'religion',
        collectionCount: religionData.collections?.length || 0
      } : null;
      fetchDocuments(true);
    } else {
      // Nothing selected, clear all
      selectedNode = null;
      selectedReligionNode = null;
      fetchDocuments(true);
    }
  }

  function handleEditNode(node) {
    editingNode = node;
    editModalOpen = true;
  }

  function handleSaveNode(updatedNode) {
    // Refresh tree data to get updated symbol/description
    fetchTree();
  }

  function clearFilters() {
    filters = { search: '', religion: null, collection: null, language: null, author: null, yearFrom: null, yearTo: null, status: 'all' };
    selectedNode = null;
    selectedReligionNode = null;
    fetchDocuments(true);
  }

  onMount(() => {
    fetchTree();
    fetchDocuments(true);
    fetchStats();
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && documents.length < totalDocuments) {
          currentOffset += LIMIT;
          fetchDocuments(false);
        }
      },
      { rootMargin: '200px' }
    );
    return () => observer?.disconnect();
  });

  $effect(() => {
    if (scrollSentinel && observer) {
      observer.observe(scrollSentinel);
      return () => observer.unobserve(scrollSentinel);
    }
  });
</script>

<div class="flex h-[calc(100vh-3.5rem)] bg-surface-0">
  <!-- Sidebar -->
  <aside class="w-64 flex-shrink-0 border-r border-border bg-surface-1 flex flex-col overflow-hidden">
    <div class="p-4 border-b border-border flex items-center justify-between gap-2">
      <button
        class="flex items-center gap-2 text-lg font-semibold text-primary hover:text-accent transition-colors cursor-pointer bg-transparent border-none p-0"
        onclick={() => { clearFilters(); switchToDocumentsView(); }}
        title="View all documents"
      >
        <img src="/ocean-noback.svg" alt="" class="w-5 h-5" />
        Library
      </button>
      {#if stats}
        <span class="text-xs font-medium text-muted bg-surface-2 px-2 py-1 rounded-full">
          {stats.totalDocuments.toLocaleString()}
        </span>
      {/if}
    </div>
    <!-- Recent Activity button -->
    <button
      class="mx-4 mt-3 mb-1 flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors
             {viewMode === 'recent' ? 'bg-accent text-white' : 'bg-surface-2 text-secondary hover:bg-surface-3 hover:text-primary'}"
      onclick={switchToRecentView}
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      Recent Activity
    </button>
    <TreeView
      religions={treeData}
      selectedReligion={filters.religion}
      selectedCollection={filters.collection}
      on:select={handleTreeSelect}
    />
  </aside>

  <!-- Main content -->
  <main class="flex-1 flex flex-col overflow-hidden min-w-0">
    {#if viewMode === 'recent'}
      <!-- Recent Activity View -->
      <div class="flex-1 overflow-y-auto p-4">
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-primary mb-2">Recent Activity</h1>
          <p class="text-muted">Track recently added and edited documents in the library</p>
        </div>

        <!-- Recent activity filters -->
        <div class="mb-4 flex items-center gap-3 flex-wrap">
          <div class="flex items-center gap-1 bg-surface-1 rounded-lg p-1">
            <button
              class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                     {recentType === 'all' ? 'bg-accent text-white' : 'text-secondary hover:bg-surface-2'}"
              onclick={() => { recentType = 'all'; fetchRecentDocuments(true); }}
            >All</button>
            <button
              class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                     {recentType === 'added' ? 'bg-success text-white' : 'text-secondary hover:bg-surface-2'}"
              onclick={() => { recentType = 'added'; fetchRecentDocuments(true); }}
            >Added</button>
            <button
              class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                     {recentType === 'modified' ? 'bg-warning text-white' : 'text-secondary hover:bg-surface-2'}"
              onclick={() => { recentType = 'modified'; fetchRecentDocuments(true); }}
            >Modified</button>
            {#if isAdmin}
              <button
                class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                       {recentType === 'pending' ? 'bg-info text-white' : 'text-secondary hover:bg-surface-2'}"
                onclick={() => { recentType = 'pending'; fetchPendingDocuments(); }}
              >Pending</button>
            {/if}
          </div>

          {#if recentType !== 'pending'}
            <select
              class="px-3 py-2 text-sm border border-border rounded-lg bg-surface-0 text-primary"
              bind:value={recentDays}
              onchange={() => fetchRecentDocuments(true)}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
          {/if}

          <span class="ml-auto text-sm text-muted">
            {recentType === 'pending' ? pendingTotal.toLocaleString() : recentTotal.toLocaleString()} documents
          </span>
        </div>

        {#if recentType === 'pending'}
          <!-- Pending documents view (admin only) -->
          {#if pendingLoading}
            <div class="flex flex-col items-center justify-center gap-4 py-12 text-muted">
              <svg class="w-8 h-8 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
              <span>Scanning library for pending files...</span>
            </div>
          {:else if pendingDocuments.length === 0}
            <div class="flex flex-col items-center justify-center gap-4 py-12 text-muted">
              <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>No pending documents - all files have been processed</span>
            </div>
          {:else}
            <div class="mb-3 p-3 bg-info/10 border border-info/30 rounded-lg">
              <p class="text-sm text-info">
                <strong>{pendingDocuments.length}</strong> document{pendingDocuments.length !== 1 ? 's' : ''} within 24-hour cooldown window.
                These files were recently modified and will be automatically ingested once stable.
              </p>
            </div>
            <div class="space-y-2">
              {#each pendingDocuments as doc}
                <div class="flex items-center gap-3 p-4 bg-surface-1 rounded-lg border border-border">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-sm font-medium text-primary truncate">{doc.title}</span>
                      <span class="flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full
                                   {doc.status === 'new' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}">
                        {doc.status === 'new' ? 'New' : 'Modified'}
                      </span>
                    </div>
                    <div class="flex items-center gap-3 text-xs text-muted">
                      {#if doc.author}
                        <span>{doc.author}</span>
                      {/if}
                      {#if doc.religion}
                        <span class="px-1.5 py-0.5 bg-surface-2 rounded">{doc.religion}</span>
                      {/if}
                      <span class="text-info font-medium">
                        {doc.hours_remaining}h until auto-ingest
                      </span>
                    </div>
                  </div>
                  <button
                    class="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                    onclick={() => forceIngest(doc.file_path)}
                    disabled={ingestingPath !== null}
                  >
                    {#if ingestingPath === doc.file_path}
                      <span class="flex items-center gap-1.5">
                        <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
                        Ingesting...
                      </span>
                    {:else}
                      Ingest Now
                    {/if}
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        {:else if recentLoading && recentDocuments.length === 0}
          <div class="flex flex-col items-center justify-center gap-4 py-12 text-muted">
            <svg class="w-8 h-8 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
            <span>Loading recent activity...</span>
          </div>
        {:else if recentDocuments.length === 0}
          <div class="flex flex-col items-center justify-center gap-4 py-12 text-muted">
            <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>No recent activity found</span>
          </div>
        {:else}
          <div class="space-y-2">
            {#each recentDocuments as doc}
              <a
                href="/library/document/{doc.slug}"
                class="block p-4 bg-surface-1 rounded-lg border border-border hover:border-accent hover:bg-surface-2 transition-colors"
              >
                <div class="flex items-start gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-sm font-medium text-primary truncate">{doc.title}</span>
                      <span class="flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full
                                   {doc.activity_type === 'added' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}">
                        {doc.activity_type === 'added' ? 'Added' : 'Modified'}
                      </span>
                    </div>
                    <div class="flex items-center gap-3 text-xs text-muted">
                      {#if doc.author}
                        <span>{doc.author}</span>
                      {/if}
                      {#if doc.religion}
                        <span class="px-1.5 py-0.5 bg-surface-2 rounded">{doc.religion}</span>
                      {/if}
                      <span class="ml-auto">
                        {new Date(doc.activity_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>
              </a>
            {/each}
          </div>
          {#if recentDocuments.length < recentTotal}
            <div class="flex justify-center py-4">
              <button
                class="px-4 py-2 text-sm font-medium text-accent border border-accent rounded-lg hover:bg-accent/10 disabled:opacity-50"
                onclick={() => { recentOffset += LIMIT; fetchRecentDocuments(false); }}
                disabled={recentLoading}
              >
                {recentLoading ? 'Loading...' : 'Load more'}
              </button>
            </div>
          {/if}
        {/if}
      </div>
    {:else if showCollectionDetail}
      <CollectionDetail
        religionSlug={selectedNode.religionSlug}
        collectionSlug={selectedNode.slug}
        onEdit={isAdmin ? () => handleEditNode(selectedNode) : null}
      />
    {:else}
      <!-- Document list -->
      <div class="flex-1 overflow-y-auto p-4">
        {#if showLibraryHeader}
          <LibraryHeader
            totalDocuments={stats?.totalDocuments || totalDocuments}
            totalReligions={treeData.length}
            totalCollections={treeData.reduce((sum, r) => sum + (r.collections?.length || 0), 0)}
          />
        {:else if showReligionHeader}
          <ReligionHeader
            religion={selectedReligionNode}
            documentCount={totalDocuments}
            collectionCount={selectedReligionNode?.collectionCount || 0}
            {isAdmin}
            onEdit={handleEditNode}
          />
        {/if}

        <!-- Search bar -->
        <div class="mb-4 flex items-center gap-3 flex-wrap">
          <div class="flex-1 min-w-[200px] max-w-[400px] relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              class="w-full py-2 pl-9 pr-8 text-sm border border-border rounded-lg bg-surface-0 text-primary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Search by title or author..."
              bind:value={filters.search}
              oninput={() => {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => fetchDocuments(true), 300);
              }}
            />
            {#if filters.search}
              <button class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-primary rounded" onclick={() => { filters.search = ''; fetchDocuments(true); }}>
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            {/if}
          </div>

          <button
            class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border rounded-lg transition-colors
                   {showFilters ? 'bg-accent text-white border-accent' : 'bg-surface-1 text-secondary border-border hover:bg-surface-2'}"
            onclick={() => showFilters = !showFilters}
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            Filters
            {#if hasActiveFilters}
              <span class="bg-white text-accent text-xs font-semibold px-1.5 rounded-full">{Object.values(filters).filter(v => v && v !== 'all').length}</span>
            {/if}
          </button>

          {#if hasActiveFilters}
            <button class="px-3 py-2 text-sm font-medium text-error hover:bg-error/10 rounded-lg" onclick={clearFilters}>Clear all</button>
          {/if}

          <span class="ml-auto text-sm text-muted">{totalDocuments.toLocaleString()} documents</span>
        </div>

        {#if showFilters}
          <div class="mb-4">
            <FilterPanel bind:filters {stats} on:change={() => fetchDocuments(true)} />
          </div>
        {/if}

        {#if loading && documents.length === 0}
          <div class="flex flex-col items-center justify-center gap-4 py-12 text-muted">
            <svg class="w-8 h-8 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
            <span>Loading documents...</span>
          </div>
        {:else if error}
          <div class="flex flex-col items-center justify-center gap-4 py-12 text-error">
            <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>{error}</span>
            <button class="px-4 py-2 text-sm text-accent border border-accent rounded-lg hover:bg-accent/10" onclick={() => { error = null; fetchDocuments(true); }}>Retry</button>
          </div>
        {:else if documents.length === 0}
          <div class="flex flex-col items-center justify-center gap-4 py-12 text-muted">
            <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <span>No documents found</span>
            {#if hasActiveFilters}
              <button class="px-4 py-2 text-sm text-accent border border-accent rounded-lg hover:bg-accent/10" onclick={clearFilters}>Clear filters</button>
            {/if}
          </div>
        {:else}
          <DocumentList {documents} {isAdmin} />
          {#if documents.length < totalDocuments}
            <div bind:this={scrollSentinel} class="flex justify-center py-8">
              {#if loading}
                <svg class="w-6 h-6 text-muted animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </main>
</div>

<!-- Edit Modal -->
<NodeEditModal
  node={editingNode}
  isOpen={editModalOpen}
  onClose={() => { editModalOpen = false; editingNode = null; }}
  onSave={handleSaveNode}
/>
