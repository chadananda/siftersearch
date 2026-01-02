<script>
  /**
   * DocumentPresentation Component
   *
   * Rich presentation view for library documents with:
   * - Semantic URL support (/library/religion/collection/slug)
   * - Progressive content loading with infinite scroll
   * - Auth-gated content for encumbered documents
   * - Edit button for admin/editors
   * - QR code sharing
   * - Print support
   * - Bilingual view toggle
   * - RTL language support
   */

  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';
  import { generateQRCodeUrl } from '../../lib/qrcode.js';
  import AuthModal from '../AuthModal.svelte';

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';

  // Props - path segments from URL
  let {
    pathReligion = '',
    pathCollection = '',
    pathSlug = ''
  } = $props();

  // Auth state
  const auth = getAuthState();

  // Document state
  let document = $state(null);
  let paragraphs = $state([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state(null);

  // Pagination state
  let total = $state(0);
  let offset = $state(0);
  let hasMore = $state(false);
  let requiresAuth = $state(false);
  let canEdit = $state(false);
  let previewLimit = $state(null);

  // UI state
  let showMetadata = $state(false);
  let showQRModal = $state(false);
  let showLoginModal = $state(false);
  let showBilingual = $state(false);
  let qrCodeUrl = $state(null);
  let linkCopied = $state(false);

  // Anchor/range linking state
  let anchorStart = $state(null);
  let anchorEnd = $state(null);
  let highlightedParagraphs = $state(new Set());

  // Intersection observer for infinite scroll
  let loadMoreTrigger = $state(null);

  const BATCH_SIZE = 50;

  /**
   * Parse URL hash for paragraph anchors
   * Supports: #p5, #5, #p5-10, #5-10
   */
  function parseAnchor() {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash) return;

    // Match patterns: #p5, #5, #p5-10, #5-10
    const match = hash.match(/^#p?(\d+)(?:-(\d+))?$/);
    if (match) {
      anchorStart = parseInt(match[1], 10);
      anchorEnd = match[2] ? parseInt(match[2], 10) : anchorStart;

      // Build set of highlighted paragraphs
      const highlighted = new Set();
      for (let i = anchorStart; i <= anchorEnd; i++) {
        highlighted.add(i);
      }
      highlightedParagraphs = highlighted;
    }
  }

  /**
   * Scroll to anchor paragraph after content loads
   */
  function scrollToAnchor() {
    if (!anchorStart) return;

    // Small delay to ensure DOM is ready
    setTimeout(() => {
      const el = window.document.getElementById(`p${anchorStart}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  /**
   * Copy paragraph link to clipboard
   */
  function copyParagraphLink(index) {
    if (typeof window === 'undefined') return;
    const baseUrl = window.location.href.split('#')[0];
    const link = `${baseUrl}#p${index}`;
    navigator.clipboard.writeText(link);
  }

  // Helper to update meta tags dynamically
  function updateMetaTag(name, content, attr = 'name') {
    if (typeof window === 'undefined') return;
    let tag = window.document.querySelector(`meta[${attr}="${name}"]`);
    if (tag) {
      tag.setAttribute('content', content);
    } else {
      tag = window.document.createElement('meta');
      tag.setAttribute(attr, name);
      tag.setAttribute('content', content);
      window.document.head.appendChild(tag);
    }
  }

  onMount(async () => {
    // Parse anchor from URL hash
    parseAnchor();

    // Listen for hash changes
    window.addEventListener('hashchange', parseAnchor);

    // Initialize auth
    await initAuth();

    // Load initial content
    await loadDocument();

    // Scroll to anchor after content loads
    scrollToAnchor();

    // Setup intersection observer for infinite scroll
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore && !loadingMore && !requiresAuth) {
            loadMore();
          }
        },
        { rootMargin: '200px' }
      );

      // Observe will be called when loadMoreTrigger is set
      return () => {
        observer.disconnect();
        window.removeEventListener('hashchange', parseAnchor);
      };
    }

    return () => window.removeEventListener('hashchange', parseAnchor);
  });

  // Watch for loadMoreTrigger changes
  $effect(() => {
    if (loadMoreTrigger && typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore && !loadingMore && !requiresAuth) {
            loadMore();
          }
        },
        { rootMargin: '200px' }
      );
      observer.observe(loadMoreTrigger);
      return () => observer.disconnect();
    }
  });

  async function loadDocument() {
    if (!pathReligion || !pathCollection || !pathSlug) {
      error = 'Invalid document path';
      loading = false;
      return;
    }

    loading = true;
    error = null;

    try {
      const res = await fetch(
        `${API_BASE}/api/library/by-path/${pathReligion}/${pathCollection}/${pathSlug}?limit=${BATCH_SIZE}&offset=0`,
        { credentials: 'include' }
      );

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Document not found');
        }
        throw new Error('Failed to load document');
      }

      const data = await res.json();
      document = data.document;
      paragraphs = data.paragraphs || [];
      total = data.total || 0;
      offset = data.offset + (data.paragraphs?.length || 0);
      hasMore = data.hasMore;
      requiresAuth = data.requiresAuth;
      canEdit = data.canEdit;
      previewLimit = data.previewLimit;

      // Update page metadata dynamically for SEO
      if (document?.title) {
        const title = `${document.title}${document.author ? ' by ' + document.author : ''} - SifterSearch`;
        window.document.title = title;

        // Update meta description
        const description = document.description
          || `Read "${document.title}" from the ${document.collection} collection in the ${document.religion} tradition.`;
        updateMetaTag('description', description);
        updateMetaTag('og:description', description, 'property');
        updateMetaTag('twitter:description', description);

        // Update other meta tags
        updateMetaTag('og:title', title, 'property');
        updateMetaTag('twitter:title', title);
        updateMetaTag('og:type', 'article', 'property');

        // Keywords
        const keywords = [document.title, document.author, document.religion, document.collection, 'sacred text', 'interfaith library'].filter(Boolean).join(', ');
        updateMetaTag('keywords', keywords);
      }
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore || requiresAuth) return;

    loadingMore = true;

    try {
      const res = await fetch(
        `${API_BASE}/api/library/by-path/${pathReligion}/${pathCollection}/${pathSlug}?limit=${BATCH_SIZE}&offset=${offset}`,
        { credentials: 'include' }
      );

      if (!res.ok) {
        throw new Error('Failed to load more content');
      }

      const data = await res.json();

      // Check if auth is now required
      if (data.requiresAuth) {
        requiresAuth = true;
        hasMore = false;
        return;
      }

      paragraphs = [...paragraphs, ...(data.paragraphs || [])];
      offset = offset + (data.paragraphs?.length || 0);
      hasMore = data.hasMore;
      requiresAuth = data.requiresAuth;
    } catch (err) {
      console.error('Failed to load more:', err);
    } finally {
      loadingMore = false;
    }
  }

  async function handleAuthSuccess() {
    showLoginModal = false;
    // Reload document with auth
    await loadDocument();
  }

  function renderMarkdown(text) {
    if (!text) return '';
    return marked.parse(text);
  }

  function getLanguageDirection(lang) {
    const rtlLanguages = ['ar', 'fa', 'he', 'ur'];
    return rtlLanguages.includes(lang) ? 'rtl' : 'ltr';
  }

  async function showQRCode() {
    const url = window.location.href;
    qrCodeUrl = await generateQRCodeUrl(url, { width: 200 });
    showQRModal = true;
  }

  function copyShareLink() {
    navigator.clipboard.writeText(window.location.href);
    linkCopied = true;
    setTimeout(() => linkCopied = false, 2000);
  }

  function openPrintView() {
    if (document?.id) {
      window.open(`/print/reading?doc=${document.id}`, '_blank');
    }
  }

  function openEditor() {
    if (document?.id) {
      window.location.href = `/admin/edit?id=${document.id}`;
    }
  }

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/library';
    }
  }

  function toggleBilingual() {
    showBilingual = !showBilingual;
  }

  // Check if document has translations
  let hasTranslations = $derived(paragraphs.some(p => p.translation));
</script>

<div class="presentation-container">
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
      <a href="/library" class="back-link">Back to Library</a>
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
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="/library">Library</a>
          {#if document.religion}
            <span class="sep">/</span>
            <a href="/library/{pathReligion}">{document.religion}</a>
          {/if}
          {#if document.collection}
            <span class="sep">/</span>
            <a href="/library/{pathReligion}/{pathCollection}">{document.collection}</a>
          {/if}
        </nav>
        <h1 class="document-title">{document.title}</h1>
        {#if document.author}
          <div class="document-author">by {document.author}</div>
        {/if}

        <!-- Metadata badges -->
        <div class="metadata-badges">
          {#if document.language}
            <span class="badge">{document.language.toUpperCase()}</span>
          {/if}
          {#if document.year}
            <span class="badge">{document.year}</span>
          {/if}
          <span class="badge">{document.paragraphCount} paragraphs</span>
          {#if document.encumbered}
            <span class="badge encumbered">Copyrighted</span>
          {/if}
        </div>
      </div>

      <div class="header-actions">
        {#if canEdit}
          <button class="action-btn edit-btn" onclick={openEditor} title="Edit document">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        {/if}
        {#if hasTranslations && document.language !== 'en'}
          <button
            class="action-btn"
            class:active={showBilingual}
            onclick={toggleBilingual}
            title={showBilingual ? 'Hide translation' : 'Show translation'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 21V14a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7"/>
              <path d="M4 10V7a2 2 0 0 1 2-2h4"/>
              <path d="M14 5h4a2 2 0 0 1 2 2v3"/>
              <path d="M6 17h.01M10 17h.01M14 17h.01M18 17h.01"/>
            </svg>
          </button>
        {/if}
        <button class="action-btn" onclick={() => showMetadata = !showMetadata} title="Document info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
        </button>
        <button class="action-btn" onclick={showQRCode} title="QR Code">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
            <rect x="14" y="14" width="3" height="3"/>
            <rect x="18" y="14" width="3" height="3"/>
            <rect x="14" y="18" width="3" height="3"/>
            <rect x="18" y="18" width="3" height="3"/>
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
        <button class="action-btn" onclick={openPrintView} title="Print">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
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
            <span class="meta-value">{document.paragraphCount?.toLocaleString()}</span>
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
      class:rtl={document.isRTL}
      class:bilingual={showBilingual}
    >
      {#if paragraphs.length === 0}
        <div class="empty-content">
          <p>No content available for this document.</p>
        </div>
      {:else}
        {#each paragraphs as para, i}
          <div
            class="paragraph"
            class:highlighted={highlightedParagraphs.has(para.paragraph_index)}
            id="p{para.paragraph_index}"
            data-index={para.paragraph_index}
          >
            <button
              class="para-anchor"
              onclick={() => copyParagraphLink(para.paragraph_index)}
              title="Copy link to paragraph {para.paragraph_index}"
            >
              {para.paragraph_index}
            </button>
            {#if para.heading}
              <h2 class="paragraph-heading">{para.heading}</h2>
            {/if}
            {#if showBilingual && para.translation}
              <div class="bilingual-row">
                <div class="original-col" dir={getLanguageDirection(document.language)}>
                  <div class="paragraph-text">{@html renderMarkdown(para.text)}</div>
                </div>
                <div class="translation-col">
                  <div class="paragraph-text translation">{@html renderMarkdown(para.translation)}</div>
                </div>
              </div>
            {:else}
              <div class="paragraph-text">{@html renderMarkdown(para.text)}</div>
            {/if}
          </div>
        {/each}

        <!-- Load more trigger / Auth gate -->
        {#if hasMore || loadingMore}
          <div class="load-more-section" bind:this={loadMoreTrigger}>
            {#if loadingMore}
              <div class="loading-more">
                <svg class="spinner small" viewBox="0 0 24 24" width="20" height="20">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
                </svg>
                <span>Loading more...</span>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Auth gate for encumbered content -->
        {#if requiresAuth}
          <div class="auth-gate">
            <div class="auth-gate-content">
              <h3>Continue Reading</h3>
              <p>Sign in to access the full document</p>
              <p class="progress-text">Showing {paragraphs.length} of {total} paragraphs</p>
              <button class="sign-in-btn" onclick={() => showLoginModal = true}>
                Sign In to Continue
              </button>
            </div>
          </div>
        {/if}
      {/if}
    </main>
  {/if}
</div>

<!-- QR Code Modal -->
{#if showQRModal}
  <div class="modal-overlay" onclick={() => showQRModal = false}>
    <div class="modal-content qr-modal" onclick={(e) => e.stopPropagation()}>
      <h3>Share Document</h3>
      {#if qrCodeUrl}
        <img src={qrCodeUrl} alt="QR Code for this document" class="qr-code" />
      {/if}
      <p class="qr-url">{typeof window !== 'undefined' ? window.location.href : ''}</p>
      <div class="modal-actions">
        <button class="copy-btn" onclick={copyShareLink}>
          {linkCopied ? 'Copied!' : 'Copy Link'}
        </button>
        <button class="close-btn" onclick={() => showQRModal = false}>Close</button>
      </div>
    </div>
  </div>
{/if}

<!-- Login Modal -->
<AuthModal
  bind:isOpen={showLoginModal}
  onClose={handleAuthSuccess}
/>

<style>
  .presentation-container {
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

  .spinner.small {
    width: 20px;
    height: 20px;
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

  .metadata-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .badge {
    font-size: 0.625rem;
    padding: 0.25rem 0.5rem;
    background: var(--surface-2);
    color: var(--text-secondary);
    border-radius: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .badge.encumbered {
    background: var(--warning-bg, #fef3cd);
    color: var(--warning-text, #856404);
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
    flex-wrap: wrap;
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
  }

  .action-btn.active {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
  }

  .action-btn.copied {
    color: var(--success);
    border-color: var(--success);
  }

  .action-btn.edit-btn {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
  }

  .action-btn.edit-btn:hover {
    background: var(--accent-hover);
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
    padding: 2rem 1.5rem 4rem 3rem; /* Extra left padding for paragraph anchors */
  }

  .document-content.bilingual {
    max-width: 72rem;
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
    position: relative;
    scroll-margin-top: 100px;
  }

  .paragraph.highlighted {
    background: var(--accent-bg, rgba(59, 130, 246, 0.1));
    border-left: 3px solid var(--accent-primary);
    padding-left: 1rem;
    margin-left: -1rem;
    border-radius: 0.25rem;
  }

  .para-anchor {
    position: absolute;
    left: -2.5rem;
    top: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .paragraph:hover .para-anchor {
    opacity: 1;
  }

  .para-anchor:hover {
    color: var(--accent-primary);
  }

  .para-anchor:active::after {
    content: ' ✓';
    color: var(--success);
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

  /* Bilingual layout */
  .bilingual-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }

  .original-col {
    border-right: 1px solid var(--border-subtle);
    padding-right: 1.5rem;
  }

  .translation-col {
    padding-left: 0.5rem;
  }

  .translation-col .paragraph-text {
    color: var(--text-secondary);
    font-style: normal;
  }

  /* Load more section */
  .load-more-section {
    padding: 2rem;
    text-align: center;
  }

  .loading-more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  /* Auth gate */
  .auth-gate {
    margin-top: 2rem;
    padding: 2rem;
    background: linear-gradient(to bottom, transparent, var(--surface-1) 20%);
    border-radius: 0.5rem;
    text-align: center;
  }

  .auth-gate-content {
    background: var(--surface-2);
    padding: 2rem;
    border-radius: 0.5rem;
    max-width: 400px;
    margin: 0 auto;
  }

  .auth-gate-content h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .auth-gate-content p {
    margin: 0 0 0.5rem 0;
    color: var(--text-secondary);
  }

  .progress-text {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-bottom: 1rem !important;
  }

  .sign-in-btn {
    padding: 0.75rem 1.5rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .sign-in-btn:hover {
    background: var(--accent-hover);
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--surface-1);
    padding: 2rem;
    border-radius: 0.75rem;
    max-width: 90vw;
    max-height: 90vh;
    overflow: auto;
  }

  .qr-modal {
    text-align: center;
    min-width: 280px;
  }

  .qr-modal h3 {
    margin: 0 0 1rem 0;
    color: var(--text-primary);
  }

  .qr-code {
    display: block;
    margin: 0 auto 1rem;
    border-radius: 0.5rem;
  }

  .qr-url {
    font-size: 0.75rem;
    color: var(--text-muted);
    word-break: break-all;
    margin: 0 0 1rem 0;
  }

  .modal-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .copy-btn,
  .close-btn {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .copy-btn {
    background: var(--accent-primary);
    color: white;
    border: none;
  }

  .copy-btn:hover {
    background: var(--accent-hover);
  }

  .close-btn {
    background: none;
    border: 1px solid var(--border-default);
    color: var(--text-secondary);
  }

  .close-btn:hover {
    background: var(--hover-overlay);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .document-header {
      padding: 0.75rem 1rem;
      flex-wrap: wrap;
    }

    .header-actions {
      order: 3;
      width: 100%;
      justify-content: flex-end;
      margin-top: 0.5rem;
    }

    .document-title {
      font-size: 1.125rem;
    }

    .document-content {
      padding: 1.5rem 1rem 3rem 1.5rem;
    }

    .para-anchor {
      display: none; /* Hide anchors on mobile */
    }

    .document-content.bilingual {
      max-width: 100%;
    }

    .bilingual-row {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .original-col {
      border-right: none;
      border-bottom: 1px solid var(--border-subtle);
      padding-right: 0;
      padding-bottom: 1rem;
    }

    .translation-col {
      padding-left: 0;
    }

    .metadata-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
