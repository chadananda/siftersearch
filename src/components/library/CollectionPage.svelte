<script>
  /**
   * CollectionPage Component
   *
   * Displays a collection page with:
   * - Collection name, description
   * - Parent religion breadcrumb
   * - All documents in the collection with metadata
   * - Search/filter functionality
   * - Proper SEO-friendly links
   */

  import { onMount } from 'svelte';

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';

  let {
    religionSlug = '',
    collectionSlug = ''
  } = $props();

  // State
  let collection = $state(null);
  let parentReligion = $state(null);
  let documents = $state([]);
  let totalDocuments = $state(0);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state(null);
  let searchQuery = $state('');
  let offset = $state(0);

  const LIMIT = 100;

  onMount(async () => {
    await loadCollection();
  });

  async function loadCollection() {
    if (!religionSlug || !collectionSlug) {
      error = 'Invalid collection path';
      loading = false;
      return;
    }

    loading = true;
    error = null;

    try {
      const url = new URL(`${API_BASE}/api/library/by-slug/${religionSlug}/${collectionSlug}`);
      url.searchParams.set('limit', LIMIT.toString());
      url.searchParams.set('offset', '0');
      if (searchQuery) {
        url.searchParams.set('search', searchQuery);
      }

      const res = await fetch(url.toString());

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Collection not found');
        }
        throw new Error('Failed to load collection');
      }

      const data = await res.json();
      collection = data.node;
      parentReligion = data.node?.parent;
      documents = data.documents || [];
      totalDocuments = data.total_documents || 0;
      offset = LIMIT;

      // Update page title dynamically
      if (collection?.name && parentReligion?.name) {
        document.title = `${collection.name} - ${parentReligion.name} - SifterSearch Library`;
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && collection.description) {
          metaDesc.setAttribute('content', collection.description);
        }
      }
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (loadingMore || documents.length >= totalDocuments) return;

    loadingMore = true;

    try {
      const url = new URL(`${API_BASE}/api/library/by-slug/${religionSlug}/${collectionSlug}`);
      url.searchParams.set('limit', LIMIT.toString());
      url.searchParams.set('offset', offset.toString());
      if (searchQuery) {
        url.searchParams.set('search', searchQuery);
      }

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Failed to load more');

      const data = await res.json();
      documents = [...documents, ...(data.documents || [])];
      offset = offset + LIMIT;
    } catch (err) {
      console.error('Failed to load more:', err);
    } finally {
      loadingMore = false;
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    offset = 0;
    documents = [];
    loadCollection();
  }

  function slugifyPath(str) {
    if (!str) return '';
    const diacritics = {
      'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'ā': 'a',
      'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e', 'ē': 'e',
      'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i', 'ī': 'i',
      'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'ō': 'o',
      'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u', 'ū': 'u',
      'ñ': 'n', 'ç': 'c',
      'Á': 'a', 'À': 'a', 'Ä': 'a', 'Â': 'a', 'Ā': 'a',
      'É': 'e', 'È': 'e', 'Ë': 'e', 'Ê': 'e', 'Ē': 'e',
      'Í': 'i', 'Ì': 'i', 'Ï': 'i', 'Î': 'i', 'Ī': 'i',
      'Ó': 'o', 'Ò': 'o', 'Ö': 'o', 'Ô': 'o', 'Ō': 'o',
      'Ú': 'u', 'Ù': 'u', 'Ü': 'u', 'Û': 'u', 'Ū': 'u',
      'Ñ': 'n', 'Ç': 'c'
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
   * Generate a document slug from title/filename + language
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

  function getDocumentUrl(doc) {
    const docSlug = generateDocSlug(doc);
    if (!docSlug) return `/library/view?doc=${doc.id}`;
    return `/library/${religionSlug}/${collectionSlug}/${docSlug}`;
  }

  // Group documents by author
  let documentsByAuthor = $derived(() => {
    const grouped = {};
    for (const doc of documents) {
      const author = doc.author || 'Unknown Author';
      if (!grouped[author]) grouped[author] = [];
      grouped[author].push(doc);
    }
    // Sort authors
    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
  });

  let hasMore = $derived(documents.length < totalDocuments);
</script>

<div class="collection-page">
  {#if loading}
    <div class="loading-state">
      <svg class="spinner" viewBox="0 0 24 24" width="32" height="32">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
      </svg>
      <span>Loading...</span>
    </div>
  {:else if error}
    <div class="error-state">
      <h1>Error</h1>
      <p>{error}</p>
      <a href="/library">Back to Library</a>
    </div>
  {:else if collection}
    <!-- Breadcrumb -->
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/library">Library</a>
      <span class="sep">/</span>
      <a href="/library/{religionSlug}">{parentReligion?.name || 'Religion'}</a>
      <span class="sep">/</span>
      <span class="current">{collection.name}</span>
    </nav>

    <!-- Header -->
    <header class="collection-header">
      <div class="header-content">
        <h1>{collection.name}</h1>
        <div class="parent-info">
          Part of the <a href="/library/{religionSlug}">{parentReligion?.name}</a> tradition
        </div>
        {#if collection.description}
          <p class="description">{collection.description}</p>
        {/if}
        <div class="stats">
          <span class="stat">
            <strong>{totalDocuments}</strong> documents
          </span>
        </div>
      </div>
    </header>

    <!-- Overview (if exists) -->
    {#if collection.overview}
      <section class="overview">
        <p>{collection.overview}</p>
      </section>
    {/if}

    <!-- Search -->
    <form class="search-form" onsubmit={handleSearch}>
      <input
        type="search"
        placeholder="Search documents..."
        bind:value={searchQuery}
        class="search-input"
      />
      <button type="submit" class="search-btn">Search</button>
    </form>

    <!-- Documents List -->
    <section class="documents-section">
      <h2>Documents</h2>

      {#if documents.length === 0}
        <p class="no-results">No documents found.</p>
      {:else}
        <!-- Flat list by title for easier scanning -->
        <div class="document-grid">
          {#each documents as doc}
            <a href={getDocumentUrl(doc)} class="document-card">
              <h3 class="doc-title">{doc.title}</h3>
              {#if doc.author}
                <p class="doc-author">{doc.author}</p>
              {/if}
              <div class="doc-meta">
                {#if doc.language && doc.language !== 'en'}
                  <span class="doc-lang">{doc.language.toUpperCase()}</span>
                {/if}
                {#if doc.year}
                  <span class="doc-year">{doc.year}</span>
                {/if}
                {#if doc.paragraph_count}
                  <span class="doc-paras">{doc.paragraph_count} paragraphs</span>
                {/if}
              </div>
              {#if doc.description}
                <p class="doc-description">{doc.description}</p>
              {/if}
            </a>
          {/each}
        </div>

        <!-- Load More -->
        {#if hasMore}
          <div class="load-more">
            <button
              onclick={loadMore}
              disabled={loadingMore}
              class="load-more-btn"
            >
              {#if loadingMore}
                Loading...
              {:else}
                Load More ({totalDocuments - documents.length} remaining)
              {/if}
            </button>
          </div>
        {/if}

        <!-- Showing count -->
        <p class="showing-count">
          Showing {documents.length} of {totalDocuments} documents
        </p>
      {/if}
    </section>

    <!-- Alternative: By Author View -->
    {#if documentsByAuthor().length > 1}
      <section class="by-author-section">
        <h2>Documents by Author</h2>
        {#each documentsByAuthor() as [author, authorDocs]}
          <div class="author-group">
            <h3>{author} <span class="count">({authorDocs.length})</span></h3>
            <ul class="doc-list">
              {#each authorDocs as doc}
                <li>
                  <a href={getDocumentUrl(doc)}>
                    {doc.title}
                    {#if doc.language && doc.language !== 'en'}
                      <span class="lang-badge">{doc.language.toUpperCase()}</span>
                    {/if}
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </section>
    {/if}
  {/if}
</div>

<style>
  .collection-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1.5rem;
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 50vh;
    gap: 1rem;
    color: var(--text-muted);
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .error-state a {
    color: var(--accent-primary);
    text-decoration: none;
  }

  /* Breadcrumb */
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .breadcrumb a {
    color: var(--accent-primary);
    text-decoration: none;
  }

  .breadcrumb a:hover {
    text-decoration: underline;
  }

  .breadcrumb .sep {
    color: var(--text-muted);
  }

  .breadcrumb .current {
    color: var(--text-primary);
    font-weight: 500;
  }

  /* Header */
  .collection-header {
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--border-default);
  }

  .header-content h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
    color: var(--text-primary);
  }

  .parent-info {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-bottom: 0.75rem;
  }

  .parent-info a {
    color: var(--accent-primary);
    text-decoration: none;
  }

  .parent-info a:hover {
    text-decoration: underline;
  }

  .description {
    margin: 0 0 1rem 0;
    color: var(--text-secondary);
    line-height: 1.6;
    max-width: 60ch;
  }

  .stats {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .stat strong {
    color: var(--text-primary);
  }

  /* Overview */
  .overview {
    background: var(--surface-1);
    padding: 1.5rem;
    border-radius: 0.5rem;
    margin-bottom: 2rem;
  }

  .overview p {
    margin: 0;
    line-height: 1.7;
    color: var(--text-secondary);
  }

  /* Search */
  .search-form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 2rem;
    max-width: 500px;
  }

  .search-input {
    flex: 1;
    padding: 0.625rem 1rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-1);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .search-btn {
    padding: 0.625rem 1.25rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .search-btn:hover {
    background: var(--accent-hover);
  }

  /* Documents Section */
  .documents-section h2 {
    font-size: 1.25rem;
    color: var(--text-primary);
    margin: 0 0 1.5rem 0;
  }

  .no-results {
    color: var(--text-muted);
    text-align: center;
    padding: 2rem;
  }

  .document-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .document-card {
    display: block;
    padding: 1.25rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    text-decoration: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .document-card:hover {
    border-color: var(--accent-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .document-card .doc-title {
    margin: 0 0 0.375rem 0;
    font-size: 1rem;
    color: var(--text-primary);
    font-weight: 500;
  }

  .document-card .doc-author {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .doc-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .doc-lang {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    background: var(--accent-primary);
    color: white;
    border-radius: 0.25rem;
    font-weight: 600;
  }

  .doc-year,
  .doc-paras {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .doc-description {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Load More */
  .load-more {
    display: flex;
    justify-content: center;
    margin: 2rem 0;
  }

  .load-more-btn {
    padding: 0.75rem 2rem;
    background: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .load-more-btn:hover:not(:disabled) {
    background: var(--surface-3);
  }

  .load-more-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .showing-count {
    text-align: center;
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-top: 1rem;
  }

  /* By Author Section */
  .by-author-section {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--border-default);
  }

  .by-author-section h2 {
    font-size: 1.25rem;
    color: var(--text-primary);
    margin: 0 0 1.5rem 0;
  }

  .author-group {
    margin-bottom: 1.5rem;
  }

  .author-group h3 {
    font-size: 1rem;
    color: var(--text-primary);
    margin: 0 0 0.5rem 0;
    padding-bottom: 0.375rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .author-group h3 .count {
    font-weight: normal;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .doc-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .doc-list li {
    padding: 0.375rem 0;
  }

  .doc-list a {
    color: var(--text-primary);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .doc-list a:hover {
    color: var(--accent-primary);
  }

  .lang-badge {
    font-size: 0.5625rem;
    padding: 0.0625rem 0.25rem;
    background: var(--accent-primary);
    color: white;
    border-radius: 0.125rem;
    font-weight: 600;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .header-content h1 {
      font-size: 1.5rem;
    }

    .document-grid {
      grid-template-columns: 1fr;
    }

    .search-form {
      flex-direction: column;
    }
  }
</style>
