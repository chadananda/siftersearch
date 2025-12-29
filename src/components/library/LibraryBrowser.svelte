<script>
  import { onMount } from 'svelte';
  import { getAuthState } from '../../lib/auth.svelte.js';
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

  async function fetchTree() {
    try {
      let res = await fetch(`${API_BASE}/api/library/nodes`);
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
      res = await fetch(`${API_BASE}/api/library/tree`);
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

      const res = await fetch(`${API_BASE}/api/library/documents?${params}`);
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
      const res = await fetch(`${API_BASE}/api/library/stats`);
      if (res.ok) stats = await res.json();
    } catch {}
  }

  function handleTreeSelect(event) {
    const { religion, collection, node } = event.detail;
    filters = { ...filters, religion: religion || null, collection: collection || null };

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
        onclick={clearFilters}
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
    <TreeView
      religions={treeData}
      selectedReligion={filters.religion}
      selectedCollection={filters.collection}
      on:select={handleTreeSelect}
    />
  </aside>

  <!-- Main content -->
  <main class="flex-1 flex flex-col overflow-hidden min-w-0">
    {#if showCollectionDetail}
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
