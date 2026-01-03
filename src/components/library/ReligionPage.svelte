<script>
  /**
   * ReligionPage Component
   *
   * Displays a religion overview page with:
   * - Religion name, description, symbol
   * - List of collections with document counts
   * - All documents organized by collection
   * - Proper SEO-friendly links
   */

  import { onMount } from 'svelte';
  import { authenticatedFetch } from '../../lib/api.js';

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';

  let { religionSlug = '' } = $props();

  // State
  let religion = $state(null);
  let collections = $state([]);
  let documents = $state([]);
  let loading = $state(true);
  let error = $state(null);

  // Group documents by collection
  let documentsByCollection = $derived(() => {
    const grouped = {};
    for (const doc of documents) {
      const coll = doc.collection || 'Uncategorized';
      if (!grouped[coll]) grouped[coll] = [];
      grouped[coll].push(doc);
    }
    return grouped;
  });

  onMount(async () => {
    await loadReligion();
  });

  async function loadReligion() {
    if (!religionSlug) {
      error = 'Invalid religion path';
      loading = false;
      return;
    }

    loading = true;
    error = null;

    try {
      const res = await authenticatedFetch(`${API_BASE}/api/library/by-slug/${religionSlug}`);

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Religion not found');
        }
        throw new Error('Failed to load religion');
      }

      const data = await res.json();
      religion = data.node;
      collections = data.node?.children || [];
      documents = data.documents || [];

      // Update page title dynamically
      if (religion?.name) {
        document.title = `${religion.name} - SifterSearch Library`;
        // Update meta description
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && religion.description) {
          metaDesc.setAttribute('content', religion.description);
        }
      }
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
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

  function getCollectionUrl(collSlug) {
    return `/library/${religionSlug}/${collSlug}`;
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
    const collSlug = slugifyPath(doc.collection);
    return `/library/${religionSlug}/${collSlug}/${docSlug}`;
  }
</script>

<div class="religion-page">
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
  {:else if religion}
    <!-- Breadcrumb -->
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/library">Library</a>
      <span class="sep">/</span>
      <span class="current">{religion.name}</span>
    </nav>

    <!-- Header -->
    <header class="religion-header">
      {#if religion.symbol}
        <div class="religion-symbol">{religion.symbol}</div>
      {/if}
      <div class="header-content">
        <h1>{religion.name}</h1>
        {#if religion.description}
          <p class="description">{religion.description}</p>
        {/if}
        <div class="stats">
          <span class="stat">
            <strong>{religion.document_count}</strong> documents
          </span>
          <span class="stat">
            <strong>{collections.length}</strong> collections
          </span>
        </div>
      </div>
    </header>

    <!-- Overview (if exists) -->
    {#if religion.overview}
      <section class="overview">
        <p>{religion.overview}</p>
      </section>
    {/if}

    <!-- Collections Grid -->
    <section class="collections-section">
      <h2>Collections</h2>
      <div class="collections-grid">
        {#each collections as coll}
          <a href={getCollectionUrl(coll.slug)} class="collection-card">
            <h3>{coll.name}</h3>
            {#if coll.description}
              <p class="coll-description">{coll.description}</p>
            {/if}
            <span class="doc-count">{coll.document_count} documents</span>
          </a>
        {/each}
      </div>
    </section>

    <!-- Documents by Collection -->
    <section class="documents-section">
      <h2>All Documents</h2>
      {#each collections as coll}
        {@const collDocs = documentsByCollection()[coll.name] || []}
        {#if collDocs.length > 0}
          <div class="collection-group">
            <h3>
              <a href={getCollectionUrl(coll.slug)}>{coll.name}</a>
              <span class="count">({collDocs.length})</span>
            </h3>
            <ul class="document-list">
              {#each collDocs as doc}
                <li>
                  <a href={getDocumentUrl(doc)} class="doc-link">
                    <span class="doc-title">{doc.title}</span>
                    {#if doc.author}
                      <span class="doc-author">by {doc.author}</span>
                    {/if}
                    {#if doc.language && doc.language !== 'en'}
                      <span class="doc-lang">{doc.language.toUpperCase()}</span>
                    {/if}
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      {/each}

      <!-- Uncategorized documents -->
      {#if documentsByCollection()['Uncategorized']?.length > 0}
        {@const uncategorized = documentsByCollection()['Uncategorized']}
        <div class="collection-group">
          <h3>Other Documents <span class="count">({uncategorized.length})</span></h3>
          <ul class="document-list">
            {#each uncategorized as doc}
              <li>
                <a href={getDocumentUrl(doc)} class="doc-link">
                  <span class="doc-title">{doc.title}</span>
                  {#if doc.author}
                    <span class="doc-author">by {doc.author}</span>
                  {/if}
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .religion-page {
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
  .religion-header {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--border-default);
  }

  .religion-symbol {
    font-size: 3rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .header-content h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
    color: var(--text-primary);
  }

  .description {
    margin: 0 0 1rem 0;
    color: var(--text-secondary);
    line-height: 1.6;
    max-width: 60ch;
  }

  .stats {
    display: flex;
    gap: 1.5rem;
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

  /* Collections Grid */
  .collections-section {
    margin-bottom: 3rem;
  }

  .collections-section h2 {
    font-size: 1.25rem;
    color: var(--text-primary);
    margin: 0 0 1rem 0;
  }

  .collections-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }

  .collection-card {
    display: block;
    padding: 1.25rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    text-decoration: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .collection-card:hover {
    border-color: var(--accent-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .collection-card h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .coll-description {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .doc-count {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  /* Documents Section */
  .documents-section h2 {
    font-size: 1.25rem;
    color: var(--text-primary);
    margin: 0 0 1.5rem 0;
  }

  .collection-group {
    margin-bottom: 2rem;
  }

  .collection-group h3 {
    font-size: 1rem;
    color: var(--text-primary);
    margin: 0 0 0.75rem 0;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .collection-group h3 a {
    color: var(--accent-primary);
    text-decoration: none;
  }

  .collection-group h3 a:hover {
    text-decoration: underline;
  }

  .collection-group h3 .count {
    font-weight: normal;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .document-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }

  .doc-link {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    text-decoration: none;
    border-radius: 0.375rem;
    transition: background 0.15s;
  }

  .doc-link:hover {
    background: var(--surface-1);
  }

  .doc-title {
    color: var(--text-primary);
    flex: 1;
    min-width: 0;
  }

  .doc-author {
    font-size: 0.875rem;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .doc-lang {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    background: var(--accent-primary);
    color: white;
    border-radius: 0.25rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .religion-header {
      flex-direction: column;
      gap: 1rem;
    }

    .religion-symbol {
      font-size: 2.5rem;
    }

    .header-content h1 {
      font-size: 1.5rem;
    }

    .stats {
      flex-direction: column;
      gap: 0.5rem;
    }

    .collections-grid {
      grid-template-columns: 1fr;
    }

    .doc-link {
      flex-wrap: wrap;
    }

    .doc-author {
      width: 100%;
      padding-left: 0;
    }
  }
</style>
