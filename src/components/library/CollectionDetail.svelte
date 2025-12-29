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

<div class="p-4 max-w-[900px] mx-auto">
  {#if loading && !node}
    <div class="flex flex-col items-center justify-center gap-4 py-12 text-muted text-center">
      <svg class="w-12 h-12 animate-spin" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
      </svg>
      <span>Loading collection...</span>
    </div>
  {:else if error}
    <div class="flex flex-col items-center justify-center gap-4 py-12 text-error text-center">
      <svg class="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>{error}</span>
      <button class="px-4 py-2 text-sm text-accent border border-accent rounded-lg hover:bg-accent/10" onclick={() => { error = null; fetchCollection(true); }}>Retry</button>
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
      <section class="mt-6 mb-6 p-5 bg-surface-1 border border-border rounded-xl">
        <h2 class="m-0 mb-3 text-base font-semibold text-primary">About this Collection</h2>
        <div class="text-[0.9375rem] text-secondary leading-relaxed prose prose-sm">
          {@html overviewHtml}
        </div>
      </section>
    {/if}

    <!-- Search within collection -->
    <div class="mt-6 mb-6">
      <div class="flex items-center gap-2 relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          class="flex-1 py-2.5 pl-10 pr-9 text-sm border border-border rounded-lg bg-surface-0 text-primary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          placeholder="Search within {node.name}..."
          bind:value={searchQuery}
          onkeydown={(e) => e.key === 'Enter' && handleSearch()}
        />
        {#if searchQuery}
          <button class="absolute right-[5.5rem] top-1/2 -translate-y-1/2 p-1 bg-transparent border-none cursor-pointer text-muted hover:text-primary rounded" onclick={() => { searchQuery = ''; handleSearch(); }}>
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        {/if}
        <button class="py-2.5 px-4 text-sm font-medium text-white bg-accent border-none rounded-lg cursor-pointer hover:bg-accent-hover transition-colors" onclick={handleSearch}>
          Search
        </button>
      </div>
    </div>

    <!-- Documents section -->
    <section class="bg-surface-1 border border-border rounded-xl overflow-hidden">
      <div class="flex items-center justify-between p-4 border-b border-border bg-surface-1">
        <h2 class="m-0 text-base font-semibold text-primary">Documents</h2>
        <span class="text-[0.8125rem] text-muted">
          {#if searchQuery}
            {totalDocuments.toLocaleString()} {totalDocuments === 1 ? 'result' : 'results'}
          {:else}
            {totalDocuments.toLocaleString()} {totalDocuments === 1 ? 'document' : 'documents'}
          {/if}
        </span>
      </div>

      {#if loading}
        <div class="flex flex-col items-center justify-center gap-4 py-8 text-muted">
          <svg class="w-8 h-8 animate-spin" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
          </svg>
        </div>
      {:else if documents.length === 0}
        <div class="flex flex-col items-center justify-center gap-4 py-12 text-muted text-center">
          <svg class="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
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
            <button class="px-4 py-2 text-sm text-accent border border-accent rounded-lg hover:bg-accent/10" onclick={() => { searchQuery = ''; handleSearch(); }}>Clear search</button>
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
          <div bind:this={scrollSentinel} class="flex justify-center items-center py-8 min-h-[60px]">
            {#if loadingMore}
              <svg class="w-6 h-6 text-muted animate-spin" viewBox="0 0 24 24">
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
  /* Prose styles for rendered markdown */
  .prose :global(p) {
    margin: 0 0 0.75rem;
  }
  .prose :global(p:last-child) {
    margin-bottom: 0;
  }
</style>
