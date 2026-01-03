<script>
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import { authenticatedFetch } from '../../lib/api.js';

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';

  // State
  let documentId = $state('');
  let document = $state(null);
  let paragraphs = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let showMetadata = $state(false);

  // Get document ID from URL query param on mount
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const docId = params.get('doc');

    if (docId) {
      documentId = docId;
      loadDocument();
    } else {
      error = 'No document ID provided. Use ?doc=document-id';
      loading = false;
    }
  });

  async function loadDocument() {
    loading = true;
    error = null;

    try {
      const res = await authenticatedFetch(`${API_BASE}/api/library/documents/${documentId}?includeParagraphs=true&paragraphLimit=1000`);

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Document not found');
        }
        throw new Error('Failed to load document');
      }

      const data = await res.json();
      document = data.document || data;
      paragraphs = data.paragraphs || [];

      // Update page title
      if (document.title) {
        window.document.title = `${document.title} - SifterSearch`;
      }
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function renderMarkdown(text) {
    if (!text) return '';
    return marked.parse(text);
  }

  function getLanguageDirection(lang) {
    const rtlLanguages = ['ar', 'fa', 'he', 'ur'];
    return rtlLanguages.includes(lang) ? 'rtl' : 'ltr';
  }

  let linkCopied = $state(false);

  function copyShareLink() {
    const shareUrl = `${window.location.origin}/library/view?doc=${documentId}`;
    navigator.clipboard.writeText(shareUrl);
    linkCopied = true;
    setTimeout(() => linkCopied = false, 2000);
  }

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/library';
    }
  }
</script>

<div class="viewer-container">
  {#if loading}
    <div class="loading-state">
      <svg class="spinner" viewBox="0 0 24 24" width="32" height="32">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
      </svg>
      <span>Loading document...</span>
    </div>
  {:else if error}
    <div class="error-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4M12 16h.01"/>
      </svg>
      <h2>Error</h2>
      <p>{error}</p>
      <a href="/library" class="back-link">← Back to Library</a>
    </div>
  {:else if document}
    <!-- Header -->
    <header class="document-header">
      <button class="back-button" onclick={goBack} title="Go back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>

      <div class="header-content">
        <div class="breadcrumb">
          <a href="/library">Library</a>
          {#if document.religion}
            <span class="sep">›</span>
            <span>{document.religion}</span>
          {/if}
          {#if document.collection}
            <span class="sep">›</span>
            <span>{document.collection}</span>
          {/if}
        </div>
        <h1 class="document-title">{document.title}</h1>
        {#if document.author}
          <div class="document-author">by {document.author}</div>
        {/if}
      </div>

      <div class="header-actions">
        <button class="action-btn" onclick={() => showMetadata = !showMetadata} title="Document info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
        </button>
        <button class="action-btn" class:copied={linkCopied} onclick={copyShareLink} title={linkCopied ? 'Copied!' : 'Copy link'}>
          {#if linkCopied}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          {/if}
        </button>
      </div>
    </header>

    <!-- Metadata panel -->
    {#if showMetadata}
      <div class="metadata-panel">
        <div class="metadata-grid">
          {#if document.author}
            <div class="meta-item">
              <span class="meta-label">Author</span>
              <span class="meta-value">{document.author}</span>
            </div>
          {/if}
          {#if document.religion}
            <div class="meta-item">
              <span class="meta-label">Religion</span>
              <span class="meta-value">{document.religion}</span>
            </div>
          {/if}
          {#if document.collection}
            <div class="meta-item">
              <span class="meta-label">Collection</span>
              <span class="meta-value">{document.collection}</span>
            </div>
          {/if}
          {#if document.language}
            <div class="meta-item">
              <span class="meta-label">Language</span>
              <span class="meta-value">{document.language.toUpperCase()}</span>
            </div>
          {/if}
          {#if document.year}
            <div class="meta-item">
              <span class="meta-label">Year</span>
              <span class="meta-value">{document.year}</span>
            </div>
          {/if}
          <div class="meta-item">
            <span class="meta-label">Paragraphs</span>
            <span class="meta-value">{paragraphs.length.toLocaleString()}</span>
          </div>
        </div>
        {#if document.description}
          <div class="description">
            <span class="meta-label">Description</span>
            <p>{document.description}</p>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Document content -->
    <main
      class="document-content"
      dir={getLanguageDirection(document.language)}
      class:rtl={getLanguageDirection(document.language) === 'rtl'}
    >
      {#if paragraphs.length === 0}
        <div class="empty-content">
          <p>No content available for this document.</p>
        </div>
      {:else}
        {#each paragraphs as para, i}
          <div class="paragraph" data-index={para.paragraph_index}>
            {#if para.heading}
              <h2 class="paragraph-heading">{para.heading}</h2>
            {/if}
            <div class="paragraph-text">{@html renderMarkdown(para.text)}</div>
          </div>
        {/each}
      {/if}
    </main>
  {/if}
</div>

<style>
  .viewer-container {
    min-height: 100vh;
    background: var(--surface-0);
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    gap: 1rem;
    color: var(--text-muted);
  }

  .error-state svg {
    width: 3rem;
    height: 3rem;
    color: var(--error);
  }

  .error-state h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .error-state p {
    margin: 0;
    color: var(--text-secondary);
  }

  .back-link {
    margin-top: 1rem;
    color: var(--accent-primary);
    text-decoration: none;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Header */
  .document-header {
    position: sticky;
    top: 0;
    z-index: 100;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 1.5rem;
    background: var(--surface-solid);
    border-bottom: 1px solid var(--border-default);
  }

  .back-button {
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    border-radius: 0.5rem;
    flex-shrink: 0;
  }

  .back-button:hover {
    background: var(--hover-overlay);
    color: var(--text-primary);
  }

  .back-button svg {
    width: 1.5rem;
    height: 1.5rem;
  }

  .header-content {
    flex: 1;
    min-width: 0;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 0.25rem;
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

  .document-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.3;
  }

  .document-author {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .action-btn {
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid var(--border-default);
    cursor: pointer;
    color: var(--text-secondary);
    border-radius: 0.5rem;
  }

  .action-btn:hover {
    background: var(--hover-overlay);
    color: var(--text-primary);
    border-color: var(--border-default);
  }

  .action-btn.copied {
    color: var(--success);
    border-color: var(--success);
  }

  .action-btn svg {
    width: 1.125rem;
    height: 1.125rem;
  }

  /* Metadata panel */
  .metadata-panel {
    background: var(--surface-1);
    border-bottom: 1px solid var(--border-default);
    padding: 1rem 1.5rem;
  }

  .metadata-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 1rem;
  }

  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .meta-label {
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .meta-value {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .description {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-subtle);
  }

  .description p {
    margin: 0.5rem 0 0 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  /* Document content */
  .document-content {
    max-width: 48rem;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }

  .document-content.rtl {
    font-family: 'Amiri', serif;
    font-size: 1.25rem;
    line-height: 2;
  }

  .empty-content {
    text-align: center;
    padding: 3rem;
    color: var(--text-muted);
  }

  .paragraph {
    margin-bottom: 1.5rem;
  }

  .paragraph-heading {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 2rem 0 1rem 0;
    padding-top: 1rem;
    border-top: 1px solid var(--border-subtle);
  }

  .paragraph-heading:first-child {
    border-top: none;
    padding-top: 0;
    margin-top: 0;
  }

  .paragraph-text {
    font-size: 1rem;
    line-height: 1.75;
    color: var(--text-primary);
  }

  .rtl .paragraph-text {
    font-size: 1.25rem;
    line-height: 2;
  }

  .paragraph-text :global(p) {
    margin: 0 0 1rem 0;
  }

  .paragraph-text :global(p:last-child) {
    margin-bottom: 0;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .document-header {
      padding: 0.75rem 1rem;
    }

    .document-title {
      font-size: 1.125rem;
    }

    .document-content {
      padding: 1.5rem 1rem 3rem;
    }

    .metadata-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
