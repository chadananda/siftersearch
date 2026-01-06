<script>
  /**
   * RawSearch Component
   * Fast, as-you-type Meilisearch without AI reranking
   * Focused on raw speed for admin debugging/testing
   */
  import { onMount } from 'svelte';
  import { search, documents } from '../../lib/api.js';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';
  import ReaderModal from '../common/ReaderModal.svelte';

  const auth = getAuthState();

  let query = $state('');
  let results = $state([]);
  let loading = $state(false);
  let authReady = $state(false);
  let error = $state(null);
  let searchTime = $state(null);
  let totalHits = $state(0);

  // Reader modal state
  let readerOpen = $state(false);
  let readerDocument = $state(null);
  let readerParagraphs = $state([]);
  let readerCurrentIndex = $state(0);
  let readerKeyPhrase = $state('');
  let readerLoading = $state(false);

  // Debounce timer
  let debounceTimer = null;

  onMount(async () => {
    await initAuth();
    authReady = true;
  });

  // Debounced search - triggers on every keystroke with delay
  function handleInput() {
    if (debounceTimer) clearTimeout(debounceTimer);

    if (!query.trim()) {
      results = [];
      totalHits = 0;
      searchTime = null;
      return;
    }

    debounceTimer = setTimeout(() => {
      performSearch();
    }, 150); // 150ms debounce for snappy feel
  }

  async function performSearch() {
    if (!query.trim()) return;

    loading = true;
    error = null;
    const startTime = performance.now();

    try {
      // Use keyword-only search for maximum speed (no embedding generation)
      const data = await search.search({
        query: query.trim(),
        limit: 50,
        mode: 'keyword',
        offset: 0
      });

      results = data.results || [];
      totalHits = data.totalHits || results.length;
      searchTime = Math.round(performance.now() - startTime);
    } catch (err) {
      error = err.message || 'Search failed';
      results = [];
    } finally {
      loading = false;
    }
  }

  // Open reader modal for a result
  async function openReader(result) {
    readerLoading = true;
    readerOpen = true;
    readerKeyPhrase = query;

    try {
      // Load document paragraphs
      const docData = await documents.getSegments(result.document_id);
      readerDocument = {
        id: result.document_id,
        title: result.title || 'Untitled',
        author: result.author,
        religion: result.religion,
        collection: result.collection,
        language: result.language
      };
      readerParagraphs = docData.paragraphs || [];
      readerCurrentIndex = result.paragraph_index || 0;
    } catch (err) {
      console.error('Failed to load document:', err);
    } finally {
      readerLoading = false;
    }
  }

  function closeReader() {
    readerOpen = false;
    readerDocument = null;
    readerParagraphs = [];
  }

  // Format score for display
  function formatScore(score) {
    if (!score) return '';
    return score.toFixed(2);
  }

  // Truncate text for display
  function truncate(text, maxLength = 200) {
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  }
</script>

<div class="raw-search">
  {#if !authReady}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading...</p>
    </div>
  {:else if !auth.isAuthenticated || auth.user?.tier !== 'admin'}
    <div class="access-denied">
      <h2>Access Denied</h2>
      <p>You need admin access to view this page.</p>
      <a href="/" class="btn-primary">Go to Home</a>
    </div>
  {:else}
    <header class="page-header">
      <h1>Raw Search</h1>
      <p class="subtitle">Direct Meilisearch - No AI, Maximum Speed</p>
    </header>

    <!-- Search Input -->
    <div class="search-container">
      <div class="search-input-wrapper">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          class="search-input"
          placeholder="Type to search instantly..."
          bind:value={query}
          oninput={handleInput}
          autofocus
        />
        {#if loading}
          <div class="search-spinner"></div>
        {/if}
      </div>

      {#if searchTime !== null}
        <div class="search-stats">
          <span class="stat">{totalHits.toLocaleString()} hits</span>
          <span class="stat">{searchTime}ms</span>
        </div>
      {/if}
    </div>

    <!-- Error -->
    {#if error}
      <div class="error-message">{error}</div>
    {/if}

    <!-- Results -->
    <div class="results-container">
      {#if results.length === 0 && query && !loading}
        <div class="no-results">
          <p>No results found for "{query}"</p>
        </div>
      {:else}
        {#each results as result, i}
          <button
            class="result-card"
            onclick={() => openReader(result)}
          >
            <div class="result-header">
              <span class="result-number">{i + 1}</span>
              <span class="result-score">{formatScore(result.score)}</span>
            </div>
            <div class="result-content">
              <p class="result-text">{truncate(result.text, 300)}</p>
              <div class="result-meta">
                <span class="meta-title">{result.title || 'Untitled'}</span>
                {#if result.author}
                  <span class="meta-author">by {result.author}</span>
                {/if}
                {#if result.collection}
                  <span class="meta-collection">{result.collection}</span>
                {/if}
              </div>
            </div>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<!-- Reader Modal -->
<ReaderModal
  bind:open={readerOpen}
  document={readerDocument}
  paragraphs={readerParagraphs}
  currentIndex={readerCurrentIndex}
  keyPhrase={readerKeyPhrase}
  loading={readerLoading}
  onClose={closeReader}
/>

<style>
  .raw-search {
    max-width: 900px;
    margin: 0 auto;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .page-header h1 {
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.5rem;
  }

  .subtitle {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  /* Search Input */
  .search-container {
    margin-bottom: 1.5rem;
  }

  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 1rem;
    width: 20px;
    height: 20px;
    color: var(--text-muted);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 1rem 3rem 1rem 3rem;
    font-size: 1.125rem;
    border: 2px solid var(--border-default);
    border-radius: 0.75rem;
    background: var(--surface-1);
    color: var(--text-primary);
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px var(--accent-primary-alpha);
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .search-spinner {
    position: absolute;
    right: 1rem;
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .search-stats {
    display: flex;
    gap: 1rem;
    margin-top: 0.75rem;
    padding-left: 0.5rem;
  }

  .stat {
    font-size: 0.8125rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  /* Results */
  .results-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .result-card {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: background 0.15s, border-color 0.15s;
  }

  .result-card:hover {
    background: var(--surface-2);
    border-color: var(--border-subtle);
  }

  .result-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    min-width: 40px;
  }

  .result-number {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .result-score {
    font-size: 0.6875rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .result-content {
    flex: 1;
    min-width: 0;
  }

  .result-text {
    font-size: 0.9375rem;
    line-height: 1.5;
    color: var(--text-primary);
    margin: 0 0 0.75rem;
  }

  .result-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.75rem;
  }

  .meta-title {
    color: var(--accent-primary);
    font-weight: 500;
  }

  .meta-author {
    color: var(--text-secondary);
  }

  .meta-collection {
    color: var(--text-muted);
  }

  .no-results {
    text-align: center;
    padding: 3rem;
    color: var(--text-muted);
  }

  /* Loading & Error States */
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem;
    gap: 1rem;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .access-denied {
    text-align: center;
    padding: 4rem 2rem;
  }

  .access-denied h2 {
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  .access-denied p {
    color: var(--text-muted);
    margin-bottom: 1.5rem;
  }

  .btn-primary {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    background: var(--accent-primary);
    color: white;
    border-radius: 0.5rem;
    text-decoration: none;
    font-weight: 500;
  }

  .error-message {
    padding: 1rem;
    background: var(--error-bg);
    border: 1px solid var(--error-border);
    border-radius: 0.5rem;
    color: var(--error-text);
    margin-bottom: 1rem;
  }
</style>
