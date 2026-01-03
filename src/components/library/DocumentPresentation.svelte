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

    // Pre-generate QR code for print view
    const url = window.location.href;
    qrCodeUrl = await generateQRCodeUrl(url, { width: 120 });

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

      // Handle redirect response
      if (data.redirect && data.location) {
        window.location.replace(data.location);
        return;
      }

      document = data.document;
      paragraphs = data.paragraphs || [];
      total = data.total || 0;
      offset = data.offset + (data.paragraphs?.length || 0);
      hasMore = data.hasMore;
      requiresAuth = data.requiresAuth;
      canEdit = data.canEdit;
      previewLimit = data.previewLimit;

      // Update page metadata dynamically for SEO
      if (document) {
        const displayTitle = document.title || document.filename?.replace(/\.[^.]+$/, '') || 'Document';
        const pageTitle = `${displayTitle}${document.author ? ' by ' + document.author : ''} - SifterSearch`;
        window.document.title = pageTitle;

        // Update meta description
        const description = document.description
          || `Read "${displayTitle}" from the ${document.collection} collection in the ${document.religion} tradition.`;
        updateMetaTag('description', description);
        updateMetaTag('og:description', description, 'property');
        updateMetaTag('twitter:description', description);

        // Update other meta tags
        updateMetaTag('og:title', pageTitle, 'property');
        updateMetaTag('twitter:title', pageTitle);
        updateMetaTag('og:type', 'article', 'property');

        // Keywords
        const keywords = [displayTitle, document.author, document.religion, document.collection, 'sacred text', 'interfaith library'].filter(Boolean).join(', ');
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
    window.print();
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

  // Language code to full name mapping
  const LANGUAGE_NAMES = {
    en: 'English',
    ar: 'Arabic',
    fa: 'Persian',
    he: 'Hebrew',
    ur: 'Urdu',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    pt: 'Portuguese',
    it: 'Italian',
    ru: 'Russian',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    tr: 'Turkish',
    hi: 'Hindi',
    bn: 'Bengali',
    id: 'Indonesian',
    ms: 'Malay',
    sw: 'Swahili',
    nl: 'Dutch',
    pl: 'Polish',
    vi: 'Vietnamese',
    th: 'Thai'
  };

  function getLanguageName(code) {
    if (!code) return null;
    return LANGUAGE_NAMES[code.toLowerCase()] || code.toUpperCase();
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
    <!-- Floating utility bar -->
    <div class="utility-bar">
      <button class="util-btn back-btn" onclick={goBack} title="Back to library">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <div class="util-actions">
        {#if canEdit}
          <button class="util-btn edit" onclick={openEditor} title="Edit document">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        {/if}
        {#if hasTranslations && document.language !== 'en'}
          <button class="util-btn" class:active={showBilingual} onclick={toggleBilingual} title={showBilingual ? 'Hide translation' : 'Show translation'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 5h12M9 3v2m1.048 3.5A3.5 3.5 0 0 1 6 9.5M3 21l3.5-7 3.5 7M4.5 18h5"/>
              <path d="m21 21-3.5-7-3.5 7m1.5-3h5"/>
            </svg>
          </button>
        {/if}
        <button class="util-btn" onclick={showQRCode} title="Share QR Code">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
            <path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 17v3M17 14h3"/>
          </svg>
        </button>
        <button class="util-btn" class:copied={linkCopied} onclick={copyShareLink} title={linkCopied ? 'Copied!' : 'Copy link'}>
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
        <button class="util-btn" onclick={openPrintView} title="Print">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Document content with integrated header -->
    <main
      class="document-content"
      dir={getLanguageDirection(document.language)}
      class:rtl={getLanguageDirection(document.language) === 'rtl'}
      class:bilingual={showBilingual}
    >
      <!-- Document header - always LTR for simplicity -->
      <header class="doc-header" dir="ltr">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="/library">Library</a>
          {#if document.religion}
            <span class="sep">›</span>
            <a href="/library/{pathReligion}">{document.religion}</a>
          {/if}
          {#if document.collection}
            <span class="sep">›</span>
            <a href="/library/{pathReligion}/{pathCollection}">{document.collection}</a>
          {/if}
        </nav>

        <h1 class="doc-title">{document.title || document.filename?.replace(/\.[^.]+$/, '') || 'Untitled'}</h1>

        {#if document.author}
          <p class="doc-author">by {document.author}</p>
        {/if}

        <div class="doc-meta">
          {#if document.language}
            <span class="meta-tag language">{getLanguageName(document.language)}</span>
          {/if}
          {#if document.year}
            <span class="meta-tag">{document.year}</span>
          {/if}
          {#if document.encumbered}
            <span class="meta-tag copyright">© Copyrighted</span>
          {/if}
          {#if qrCodeUrl}
            <button class="meta-qr" onclick={showQRCode} title="Share this document">
              <img src={qrCodeUrl} alt="QR" class="meta-qr-img" />
            </button>
          {/if}
        </div>

        {#if document.description}
          <p class="doc-abstract">{document.description}</p>
        {/if}

        <!-- QR code for print only -->
        <div class="print-qr-section">
          {#if qrCodeUrl}
            <img src={qrCodeUrl} alt="QR Code" class="print-qr-img" />
          {/if}
          <span class="print-url-text">{typeof window !== 'undefined' ? window.location.href.replace(/^https?:\/\//, '') : ''}</span>
        </div>
      </header>

      <hr class="doc-divider" />

      {#if paragraphs.length === 0}
        <div class="empty-content">
          <p>No content available for this document.</p>
        </div>
      {:else}
        {#each paragraphs as para, i}
          <div
            class="paragraph"
            class:highlighted={highlightedParagraphs.has(para.paragraph_index)}
            class:bilingual-paragraph={showBilingual && para.translation}
            id="p{para.paragraph_index}"
            data-index={para.paragraph_index}
          >
            {#if !(showBilingual && para.translation)}
              <button
                class="para-anchor"
                onclick={() => copyParagraphLink(para.paragraph_index || i + 1)}
                title="Copy link to paragraph {para.paragraph_index || i + 1}"
              >
                {para.paragraph_index || i + 1}
              </button>
            {/if}
            {#if para.heading}
              <h2 class="paragraph-heading">{para.heading}</h2>
            {/if}
            {#if showBilingual && para.translation}
              <div class="bilingual-row">
                <div class="original-col" dir={getLanguageDirection(document.language)}>
                  <div class="paragraph-text">{@html renderMarkdown(para.text)}</div>
                </div>
                <div class="para-center">
                  {para.paragraph_index || i + 1}
                </div>
                <div class="translation-col">
                  <div class="paragraph-text translation">{@html renderMarkdown(para.translation)}</div>
                </div>
              </div>
            {:else}
              <div class="para-text-wrapper">
                <div class="paragraph-text">{@html renderMarkdown(para.text)}</div>
              </div>
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

      <!-- Document footer with sharing info -->
      <footer class="doc-footer">
        <div class="footer-content">
          <div class="footer-qr">
            {#if qrCodeUrl}
              <img src={qrCodeUrl} alt="Scan to access this document" class="footer-qr-img" />
            {/if}
          </div>
          <div class="footer-info">
            <p class="footer-url">{typeof window !== 'undefined' ? window.location.href : ''}</p>
            <p class="footer-source">SifterSearch Interfaith Library</p>
          </div>
        </div>
      </footer>
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
    /* Fixed light background - document reading experience should always be light */
    background: #f5f3ee;
    padding-top: 1rem;
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    gap: 1rem;
    color: #666;
  }

  .error-state svg {
    width: 3rem;
    height: 3rem;
    color: #dc2626;
  }

  .error-state h2 {
    margin: 0;
    font-size: 1.25rem;
    color: #1a1a1a;
  }

  .error-state p {
    margin: 0;
    color: #444;
  }

  .back-link {
    margin-top: 1rem;
    color: #3b82f6;
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

  /* Floating utility bar - minimal action buttons */
  .utility-bar {
    position: fixed;
    top: 5rem;
    right: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 100;
  }

  .util-btn {
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.5rem;
    cursor: pointer;
    color: #666;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: all 0.2s;
  }

  .util-btn:hover {
    background: #f5f5f5;
    color: #333;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .util-btn.active {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }

  .util-btn.copied {
    background: #10b981;
    color: white;
    border-color: #10b981;
  }

  .util-btn.edit {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }

  .util-btn.edit:hover {
    background: #2563eb;
  }

  .util-btn svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .util-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .back-btn {
    margin-bottom: 0.5rem;
  }

  /* Document header - inside the paper */
  .doc-header {
    text-align: center;
    padding-bottom: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.75rem;
    color: #888;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .breadcrumb a {
    color: #666;
    text-decoration: none;
  }

  .breadcrumb a:hover {
    color: #3b82f6;
    text-decoration: underline;
  }

  .breadcrumb .sep {
    color: #bbb;
  }

  .doc-title {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
    font-weight: 600;
    color: #1a1a1a;
    line-height: 1.3;
    font-family: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
  }

  .doc-author {
    font-size: 1.125rem;
    color: #555;
    margin: 0 0 1rem 0;
    font-style: italic;
  }

  .doc-meta {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .meta-tag {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.6875rem;
    padding: 0.25rem 0.625rem;
    background: #e8e4dc;
    color: #666;
    border-radius: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .meta-tag.copyright {
    background: #fef3cd;
    color: #856404;
  }

  .meta-tag.language {
    background: #e0e7ff;
    color: #3730a3;
  }

  /* Inline QR code in metadata */
  .meta-qr {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 1px solid #ddd;
    border-radius: 0.375rem;
    padding: 0.25rem;
    cursor: pointer;
    transition: all 0.2s;
    vertical-align: middle;
  }

  .meta-qr:hover {
    border-color: #3b82f6;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
  }

  .meta-qr-img {
    width: 2rem;
    height: 2rem;
    display: block;
  }

  .doc-abstract {
    font-size: 1rem;
    color: #444;
    line-height: 1.6;
    margin: 1rem auto 0;
    max-width: 36rem;
    font-style: italic;
  }

  .doc-divider {
    border: none;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    margin: 0 0 1.5rem 0;
  }

  /* Document footer */
  .doc-footer {
    margin-top: 3rem;
    padding-top: 1.5rem;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
  }

  .footer-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
  }

  .footer-qr-img {
    width: 80px;
    height: 80px;
    border-radius: 0.375rem;
    border: 1px solid #ddd;
  }

  .footer-info {
    text-align: left;
  }

  .footer-url {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.75rem;
    color: #666;
    margin: 0 0 0.25rem 0;
    word-break: break-all;
  }

  .footer-source {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.875rem;
    font-weight: 500;
    color: #333;
    margin: 0;
  }

  /* Print QR section - hidden on screen, shown in print */
  .print-qr-section {
    display: none;
  }

  /* Document content - paper background with explicit light colors */
  .document-content {
    max-width: 48rem;
    margin: 2rem auto;
    padding: 2rem 2.5rem 4rem 2.5rem;
    background: #faf8f3;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 0.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    font-family: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
    /* Explicit light colors - not affected by dark mode */
    color: #1a1a1a;
  }

  .document-content.bilingual {
    max-width: 80rem;
  }

  .document-content.rtl {
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1.25rem;
    line-height: 2;
  }

  .empty-content {
    text-align: center;
    padding: 3rem;
    color: #666;
  }

  .paragraph {
    display: flex;
    gap: 1rem;
    margin-bottom: 0;
    padding: 0.75rem 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    scroll-margin-top: 100px;
    flex-direction: row;
    align-items: flex-start;
  }

  .paragraph:last-of-type {
    border-bottom: none;
  }

  .paragraph:hover {
    background: rgba(0, 0, 0, 0.02);
    margin: 0 -0.75rem;
    padding-left: 0.75rem;
    padding-right: 0.75rem;
    border-radius: 0.25rem;
  }

  .paragraph.highlighted {
    background: rgba(59, 130, 246, 0.1);
    border-left: 3px solid #3b82f6;
    padding-left: 0.75rem;
    margin-left: -0.75rem;
    border-radius: 0.25rem;
  }

  /* RTL documents: keep flex-direction: row
   * The dir="rtl" attribute on parent naturally reverses flex layout
   * so we DON'T need row-reverse here - it would undo the RTL effect
   */
  .rtl .paragraph {
    flex-direction: row;
  }

  .rtl .paragraph.highlighted {
    border-left: none;
    border-right: 3px solid #3b82f6;
    padding-right: 0.75rem;
    margin-right: -0.75rem;
    padding-left: 0;
    margin-left: 0;
  }

  /* Paragraph number anchor
   * - LTR: appears on LEFT (flex start)
   * - RTL: appears on RIGHT (flex start due to row-reverse)
   */
  .para-anchor {
    flex-shrink: 0;
    width: 2.5rem;
    font-family: 'Libre Caslon Text', Georgia, serif;
    font-size: 0.75rem;
    color: #999;
    text-align: right;
    padding-right: 0.5rem;
    align-self: flex-start;
    line-height: 1.75;
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.2s;
  }

  .rtl .para-anchor {
    text-align: left;
    padding-right: 0;
    padding-left: 0.5rem;
    font-family: 'Amiri', 'Traditional Arabic', serif;
  }

  .para-anchor:hover {
    color: #3b82f6;
  }

  .para-anchor:active::after {
    content: ' ✓';
    color: #10b981;
  }

  .paragraph-heading {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1a1a1a;
    margin: 2rem 0 1rem 0;
    padding-top: 1rem;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
  }

  .paragraph-heading:first-child {
    border-top: none;
    padding-top: 0;
    margin-top: 0;
  }

  .paragraph-text {
    font-size: 1rem;
    line-height: 1.75;
    color: #1a1a1a;
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

  /* Bilingual layout - three columns: original | par# | translation */
  .bilingual-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 0;
    flex: 1;
    min-width: 0;
  }

  .original-col {
    padding-right: 1.25rem;
    border-right: 1px solid rgba(0, 0, 0, 0.08);
  }

  .original-col[dir="rtl"] {
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1.125rem;
    line-height: 1.9;
    text-align: right;
  }

  .para-center {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 0 0.75rem;
    font-family: 'Libre Caslon Text', Georgia, serif;
    font-size: 0.75rem;
    color: #999;
    min-width: 2.5rem;
    /* Match line-height of paragraph text for proper alignment */
    line-height: 1.75;
  }

  .translation-col {
    padding-left: 1.25rem;
    border-left: 1px solid rgba(0, 0, 0, 0.08);
  }

  .translation-col .paragraph-text {
    color: #444;
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
    color: #666;
    font-size: 0.875rem;
  }

  /* Auth gate - inside document content, uses light colors */
  .auth-gate {
    margin-top: 2rem;
    padding: 2rem;
    background: linear-gradient(to bottom, transparent, #f0ede6 20%);
    border-radius: 0.5rem;
    text-align: center;
  }

  .auth-gate-content {
    background: #e8e4dc;
    padding: 2rem;
    border-radius: 0.5rem;
    max-width: 400px;
    margin: 0 auto;
  }

  .auth-gate-content h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    color: #1a1a1a;
  }

  .auth-gate-content p {
    margin: 0 0 0.5rem 0;
    color: #333;
  }

  .progress-text {
    font-size: 0.875rem;
    color: #666;
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
    .utility-bar {
      top: 4rem;
      right: 0.5rem;
    }

    .util-btn {
      width: 2rem;
      height: 2rem;
    }

    .util-btn svg {
      width: 1rem;
      height: 1rem;
    }

    .doc-title {
      font-size: 1.5rem;
    }

    .document-content {
      margin: 1rem 0.5rem;
      padding: 1.5rem 1rem 3rem 1rem;
    }

    .para-anchor {
      width: 1.5rem;
      font-size: 0.625rem;
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
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
      padding-right: 0;
      padding-bottom: 1rem;
    }

    .translation-col {
      padding-left: 0;
      border-left: none;
    }

    .para-center {
      display: none;
    }
  }

  /* Para text wrapper for flex layout */
  .para-text-wrapper {
    flex: 1;
    min-width: 0;
  }

  /* Print styles */
  @media print {
    .presentation-container {
      background: white;
      padding-top: 0;
    }

    /* Hide floating utility bar */
    .utility-bar {
      display: none !important;
    }

    /* Document content - minimize margins for print */
    .document-content {
      max-width: 100%;
      margin: 0;
      padding: 0;
      border: none;
      box-shadow: none;
      background: white;
    }

    .document-content.bilingual {
      max-width: 100%;
    }

    /* Show print QR section */
    .print-qr-section {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #ddd;
    }

    .print-qr-img {
      width: 64px;
      height: 64px;
    }

    .print-url-text {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 8pt;
      color: #666;
      word-break: break-all;
    }

    /* Document header styling for print */
    .doc-header {
      padding-bottom: 1rem;
      margin-bottom: 1rem;
    }

    .doc-title {
      font-size: 16pt;
    }

    .doc-author {
      font-size: 11pt;
    }

    .doc-divider {
      margin: 0 0 1rem 0;
    }

    .paragraph {
      page-break-inside: avoid;
      padding: 0.35rem 0;
      gap: 0.5rem;
    }

    .paragraph:hover {
      background: none;
      margin: 0;
      padding-left: 0;
      padding-right: 0;
    }

    .para-anchor {
      display: block !important;
      color: #666;
      width: 1.5rem;
      padding: 0;
    }

    .para-text-wrapper {
      padding-right: 0;
    }

    /* Hide auth gate, load more, footer, and inline QR in print */
    .auth-gate,
    .load-more-section,
    .doc-footer,
    .meta-qr {
      display: none !important;
    }

    /* Bilingual layout adjustments */
    .bilingual-row {
      page-break-inside: avoid;
      gap: 0;
    }

    .original-col {
      border-color: #ccc;
      padding-right: 0.5rem;
    }

    .translation-col {
      border-color: #ccc;
      padding-left: 0.5rem;
    }

    .para-center {
      color: #666;
      padding: 0 0.25rem;
      min-width: 1.5rem;
    }

    /* Hide modals in print */
    .qr-modal,
    .modal-overlay {
      display: none !important;
    }

    /* General print optimizations */
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-size: 11pt;
    }
  }
</style>
