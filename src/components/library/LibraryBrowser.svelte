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

  // Props for SSR initial state (passed from Astro pages)
  let {
    initialView = null,        // 'documents' | 'recent' - from SSR route
    initialReligion = null,    // Religion filter from SSR route
    initialCollection = null,  // Collection filter from SSR route
    initialRecentType = null,  // 'all' | 'added' | 'modified' | 'pending'
    initialRecentDays = null   // Number of days for recent filter
  } = $props();

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  const auth = getAuthState();

  /**
   * Generate a URL-safe slug from a string (for religion/collection paths)
   */
  function slugifyPath(str) {
    if (!str) return '';
    const diacritics = {
      'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'ā': 'a',
      'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e', 'ē': 'e',
      'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i', 'ī': 'i',
      'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'ō': 'o',
      'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u', 'ū': 'u',
      'ñ': 'n', 'ç': 'c'
    };
    return str
      .toLowerCase()
      .split('').map(c => diacritics[c] || c).join('')
      .replace(/[''`']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');
  }

  /**
   * Generate a document slug from title + language
   */
  function generateDocSlug(doc) {
    let base = doc.title;
    if (!base && doc.filename) {
      base = doc.filename.replace(/\.[^.]+$/, '');
    }
    if (!base) return '';
    const slug = slugifyPath(base);
    if (doc.language && doc.language !== 'en') {
      return `${slug}_${doc.language}`;
    }
    return slug;
  }

  /**
   * Get the semantic URL for a document
   */
  function getDocumentUrl(doc) {
    // Prefer stored slug, fall back to generated slug
    const docSlug = doc.slug || generateDocSlug(doc);
    if (!docSlug || !doc.religion || !doc.collection) {
      return `/library/view?doc=${doc.id}`;
    }
    return `/library/${slugifyPath(doc.religion)}/${slugifyPath(doc.collection)}/${docSlug}`;
  }

  /**
   * Format file size in human-readable form
   */
  function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

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
  let expandedPendingPath = $state(null); // Track which pending doc is expanded
  let expandedRecentId = $state(null); // Track which recent doc is expanded
  let pendingPreview = $state(null); // Frontmatter preview data
  let previewLoading = $state(false);

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

  async function togglePendingPreview(filePath) {
    if (expandedPendingPath === filePath) {
      // Collapse
      expandedPendingPath = null;
      pendingPreview = null;
      return;
    }

    // Expand and fetch preview
    expandedPendingPath = filePath;
    previewLoading = true;
    pendingPreview = null;

    try {
      const res = await authenticatedFetch(`${API_BASE}/api/library/pending/preview?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) throw new Error('Failed to load preview');
      pendingPreview = await res.json();
    } catch (err) {
      pendingPreview = { error: err.message };
    } finally {
      previewLoading = false;
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
    viewMode = 'documents';
    fetchDocuments(true);
    // URL will be updated by the $effect
  }

  // URL routing helpers
  let urlSyncEnabled = false; // Prevent URL updates during initial load

  /**
   * Parse URL params and props to set initial state
   * Props from SSR take precedence over URL params
   */
  function parseUrlParams() {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);

    // Props from SSR take precedence
    if (initialView === 'recent') {
      viewMode = 'recent';
      recentType = initialRecentType || 'all';
      recentDays = initialRecentDays || 30;
    } else if (initialView === 'documents' || initialReligion) {
      viewMode = 'documents';
      if (initialReligion) filters.religion = initialReligion;
      if (initialCollection) filters.collection = initialCollection;
    } else {
      // Fall back to URL params (for /library with query strings)
      const view = params.get('view');
      if (view === 'recent') {
        viewMode = 'recent';
        const type = params.get('type');
        if (type && ['all', 'added', 'modified', 'pending'].includes(type)) {
          recentType = type;
        }
        const days = params.get('days');
        if (days && !isNaN(parseInt(days))) {
          recentDays = parseInt(days);
        }
      } else {
        viewMode = 'documents';
        // Check for religion/collection filters from URL
        const religion = params.get('religion');
        const collection = params.get('collection');
        if (religion) filters.religion = religion;
        if (collection) filters.collection = collection;
      }
    }
  }

  /**
   * Update URL to reflect current state (without reloading)
   */
  function updateUrl() {
    if (!urlSyncEnabled || typeof window === 'undefined') return;

    const params = new URLSearchParams();

    if (viewMode === 'recent') {
      params.set('view', 'recent');
      if (recentType !== 'all') {
        params.set('type', recentType);
      }
      if (recentDays !== 30) {
        params.set('days', recentDays.toString());
      }
    } else {
      // Documents view
      if (filters.religion) {
        params.set('religion', filters.religion);
      }
      if (filters.collection) {
        params.set('collection', filters.collection);
      }
    }

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;

    // Only update if URL actually changed
    if (window.location.pathname + window.location.search !== newUrl) {
      window.history.replaceState({}, '', newUrl);
    }
  }

  onMount(() => {
    // Parse URL params first to set initial state
    parseUrlParams();
    fetchTree();
    fetchStats();

    // Load appropriate view based on URL params
    if (viewMode === 'recent') {
      fetchRecent(true);
    } else {
      fetchDocuments(true);
    }

    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && documents.length < totalDocuments) {
          currentOffset += LIMIT;
          fetchDocuments(false);
        }
      },
      { rootMargin: '200px' }
    );

    // Enable URL sync after initial load
    setTimeout(() => { urlSyncEnabled = true; }, 100);

    return () => observer?.disconnect();
  });

  // Sync URL when filters or view mode changes
  $effect(() => {
    // Track these dependencies
    const _viewMode = viewMode;
    const _recentType = recentType;
    const _recentDays = recentDays;
    const _religion = filters.religion;
    const _collection = filters.collection;

    updateUrl();
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
                {@const filename = doc.file_path?.split('/').pop()?.replace('.md', '') || 'Unknown'}
                {@const isExpanded = expandedPendingPath === doc.file_path}
                <div class="bg-surface-1 rounded-lg border border-border overflow-hidden">
                  <!-- Clickable header (using div with role=button to avoid nested buttons) -->
                  <div
                    class="w-full p-4 text-left hover:bg-surface-2/50 transition-colors cursor-pointer"
                    role="button"
                    tabindex="0"
                    onclick={() => togglePendingPreview(doc.file_path)}
                    onkeydown={(e) => e.key === 'Enter' && togglePendingPreview(doc.file_path)}
                  >
                    <div class="flex items-start gap-3">
                      <!-- Expand/collapse icon -->
                      <svg class="w-4 h-4 mt-1 text-muted flex-shrink-0 transition-transform {isExpanded ? 'rotate-90' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                      <div class="flex-1 min-w-0">
                        <!-- Frontmatter title + author -->
                        <div class="text-base font-medium text-primary mb-0.5">{doc.title || filename}</div>
                        {#if doc.author}
                          <div class="text-sm text-secondary mb-1">by {doc.author}</div>
                        {/if}
                        <!-- Filepath -->
                        <div class="font-mono text-xs text-muted/70 mb-2 break-all">{doc.file_path}</div>
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full
                                       {doc.status === 'new' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}">
                            {doc.status === 'new' ? 'New' : 'Modified'}
                          </span>
                          {#if doc.religion}
                            <span class="px-1.5 py-0.5 text-xs bg-surface-2 rounded text-muted">{doc.religion}</span>
                          {/if}
                          {#if doc.collection}
                            <span class="px-1.5 py-0.5 text-xs bg-surface-2 rounded text-muted">{doc.collection}</span>
                          {/if}
                          {#if doc.size_bytes}
                            <span class="text-xs text-muted">{formatFileSize(doc.size_bytes)}</span>
                          {/if}
                          <span class="text-xs text-info font-medium">
                            {doc.hours_remaining}h until auto-ingest
                          </span>
                        </div>
                      </div>
                      <div class="flex-shrink-0 flex items-center gap-2" onclick={(e) => e.stopPropagation()}>
                        {#if doc.id}
                          <a
                            href="/admin/edit?id={doc.id}"
                            class="px-3 py-1.5 text-sm font-medium text-secondary border border-border rounded-lg hover:bg-surface-2 hover:text-primary"
                            title="Edit document"
                          >
                            Edit
                          </a>
                        {/if}
                        <button
                          class="px-3 py-1.5 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
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
                    </div>
                  </div>

                  <!-- Expandable frontmatter preview -->
                  {#if isExpanded}
                    <div class="border-t border-border bg-surface-0 p-4">
                      {#if previewLoading}
                        <div class="flex items-center gap-2 text-muted">
                          <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
                          Loading frontmatter...
                        </div>
                      {:else if pendingPreview?.error}
                        <div class="text-error text-sm">{pendingPreview.error}</div>
                      {:else if pendingPreview?.frontmatter}
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <!-- Frontmatter -->
                          <div>
                            <h4 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Frontmatter</h4>
                            <div class="bg-surface-2 rounded-lg p-3 font-mono text-xs space-y-1 max-h-64 overflow-auto">
                              {#each Object.entries(pendingPreview.frontmatter) as [key, value]}
                                <div class="flex gap-2">
                                  <span class="text-accent font-medium">{key}:</span>
                                  <span class="text-primary break-all">{typeof value === 'object' ? JSON.stringify(value) : value}</span>
                                </div>
                              {/each}
                            </div>
                          </div>
                          <!-- Content preview -->
                          <div>
                            <h4 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Content Preview</h4>
                            <div class="bg-surface-2 rounded-lg p-3 text-xs text-secondary max-h-64 overflow-auto whitespace-pre-wrap">
                              {pendingPreview.preview || '(empty)'}
                            </div>
                          </div>
                        </div>
                        <!-- Edit link for new files -->
                        {#if !doc.id}
                          <div class="mt-3 pt-3 border-t border-border">
                            <p class="text-xs text-muted mb-2">To edit this file, ingest it first or edit the source file directly:</p>
                            <code class="text-xs font-mono bg-surface-2 px-2 py-1 rounded text-primary">{doc.file_path}</code>
                          </div>
                        {/if}
                      {/if}
                    </div>
                  {/if}
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
              {@const isExpanded = expandedRecentId === doc.id}
              <div class="bg-surface-1 rounded-lg border border-border overflow-hidden">
                <!-- Clickable header -->
                <div
                  class="w-full p-4 text-left hover:bg-surface-2/50 transition-colors cursor-pointer"
                  role="button"
                  tabindex="0"
                  onclick={() => expandedRecentId = isExpanded ? null : doc.id}
                  onkeydown={(e) => e.key === 'Enter' && (expandedRecentId = isExpanded ? null : doc.id)}
                >
                  <div class="flex items-start gap-3">
                    <!-- Expand/collapse icon -->
                    <svg class="w-4 h-4 mt-1 text-muted flex-shrink-0 transition-transform {isExpanded ? 'rotate-90' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    <div class="flex-1 min-w-0">
                      <!-- Title -->
                      <div class="text-base font-medium text-primary mb-0.5">{doc.title || 'Untitled'}</div>
                      {#if doc.author}
                        <div class="text-sm text-secondary mb-1">by {doc.author}</div>
                      {/if}
                      <!-- Filepath -->
                      {#if doc.file_path}
                        <div class="font-mono text-xs text-muted/70 mb-2 break-all">{doc.file_path}</div>
                      {/if}
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full
                                     {doc.activity_type === 'added' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}">
                          {doc.activity_type === 'added' ? 'Added' : 'Modified'}
                        </span>
                        {#if doc.religion}
                          <span class="px-1.5 py-0.5 text-xs bg-surface-2 rounded text-muted">{doc.religion}</span>
                        {/if}
                        {#if doc.collection}
                          <span class="px-1.5 py-0.5 text-xs bg-surface-2 rounded text-muted">{doc.collection}</span>
                        {/if}
                        <span class="text-xs text-muted">
                          {new Date(doc.activity_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <div class="flex-shrink-0 flex items-center gap-2" onclick={(e) => e.stopPropagation()}>
                      <a
                        href={getDocumentUrl(doc)}
                        class="px-3 py-1.5 text-sm font-medium text-secondary border border-border rounded-lg hover:bg-surface-2 hover:text-primary"
                        title="View document"
                      >
                        View
                      </a>
                      {#if isAdmin}
                        <a
                          href="/admin/edit?id={doc.id}"
                          class="px-3 py-1.5 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover"
                          title="Edit document"
                        >
                          Edit
                        </a>
                      {/if}
                    </div>
                  </div>
                </div>

                <!-- Expandable preview -->
                {#if isExpanded}
                  <div class="border-t border-border bg-surface-0 p-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <!-- Metadata -->
                      <div>
                        <h4 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Metadata</h4>
                        <div class="bg-surface-2 rounded-lg p-3 font-mono text-xs space-y-1 max-h-64 overflow-auto">
                          {#if doc.title}
                            <div class="flex gap-2">
                              <span class="text-accent font-medium">title:</span>
                              <span class="text-primary break-all">{doc.title}</span>
                            </div>
                          {/if}
                          {#if doc.author}
                            <div class="flex gap-2">
                              <span class="text-accent font-medium">author:</span>
                              <span class="text-primary break-all">{doc.author}</span>
                            </div>
                          {/if}
                          {#if doc.language}
                            <div class="flex gap-2">
                              <span class="text-accent font-medium">language:</span>
                              <span class="text-primary">{doc.language}</span>
                            </div>
                          {/if}
                          {#if doc.year}
                            <div class="flex gap-2">
                              <span class="text-accent font-medium">year:</span>
                              <span class="text-primary">{doc.year}</span>
                            </div>
                          {/if}
                          {#if doc.religion}
                            <div class="flex gap-2">
                              <span class="text-accent font-medium">religion:</span>
                              <span class="text-primary">{doc.religion}</span>
                            </div>
                          {/if}
                          {#if doc.collection}
                            <div class="flex gap-2">
                              <span class="text-accent font-medium">collection:</span>
                              <span class="text-primary">{doc.collection}</span>
                            </div>
                          {/if}
                          {#if doc.description}
                            <div class="flex gap-2">
                              <span class="text-accent font-medium">description:</span>
                              <span class="text-primary break-all">{doc.description}</span>
                            </div>
                          {/if}
                          {#if doc.paragraph_count}
                            <div class="flex gap-2">
                              <span class="text-accent font-medium">paragraphs:</span>
                              <span class="text-primary">{doc.paragraph_count}</span>
                            </div>
                          {/if}
                        </div>
                      </div>
                      <!-- Content preview -->
                      <div>
                        <h4 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Content Preview</h4>
                        <div class="bg-surface-2 rounded-lg p-3 text-xs text-secondary max-h-64 overflow-auto whitespace-pre-wrap">
                          {#if doc.previewParagraphs?.length > 0}
                            {doc.previewParagraphs.map(p => p.t).join('\n\n')}
                          {:else}
                            (no preview available)
                          {/if}
                        </div>
                      </div>
                    </div>
                  </div>
                {/if}
              </div>
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
