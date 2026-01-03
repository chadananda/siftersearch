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

  import { onMount, onDestroy } from 'svelte';
  import { marked } from 'marked';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';
  import { generateQRCodeUrl } from '../../lib/qrcode.js';
  import { authenticatedFetch } from '../../lib/api.js';
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
  let qrCodeUrl = $state(null);
  let linkCopied = $state(false);

  // Anchor/range linking state
  let anchorStart = $state(null);
  let anchorEnd = $state(null);
  let highlightedParagraphs = $state(new Set());

  // Intersection observer for infinite scroll
  let loadMoreTrigger = $state(null);

  const BATCH_SIZE = 50;

  // Sentence anchor state
  let anchorSentence = $state(null);

  /**
   * Parse URL hash for paragraph and sentence anchors
   * Supports: #p5, #5, #p5-10, #5-10, #p5.s2 (sentence 2 in paragraph 5)
   */
  function parseAnchor() {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash) return;

    // Match sentence anchor: #p5.s2
    const sentenceMatch = hash.match(/^#p?(\d+)\.s(\d+)$/);
    if (sentenceMatch) {
      anchorStart = parseInt(sentenceMatch[1], 10);
      anchorEnd = anchorStart;
      anchorSentence = parseInt(sentenceMatch[2], 10);
      highlightedParagraphs = new Set([anchorStart]);
      return;
    }

    // Match patterns: #p5, #5, #p5-10, #5-10
    const match = hash.match(/^#p?(\d+)(?:-(\d+))?$/);
    if (match) {
      anchorStart = parseInt(match[1], 10);
      anchorEnd = match[2] ? parseInt(match[2], 10) : anchorStart;
      anchorSentence = null;

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

  // Cleanup polling on component destroy
  onDestroy(() => {
    stopTranslationPolling();
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
      const res = await authenticatedFetch(
        `${API_BASE}/api/library/by-path/${pathReligion}/${pathCollection}/${pathSlug}?limit=${BATCH_SIZE}&offset=0`
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
      const res = await authenticatedFetch(
        `${API_BASE}/api/library/by-path/${pathReligion}/${pathCollection}/${pathSlug}?limit=${BATCH_SIZE}&offset=${offset}`
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

  /**
   * Strip sentence/phrase markers from text for display
   * Markers use Unicode brackets: ⁅s1⁆...⁅/s1⁆
   */
  function stripMarkers(text) {
    if (!text) return text;
    return text.replace(/⁅\/?[sp]\d+⁆/g, '');
  }

  function renderMarkdown(text) {
    if (!text) return '';
    // Strip sentence markers before rendering
    const clean = stripMarkers(text);
    return marked.parse(clean);
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

  // Check if document has study translations
  let hasStudyTranslations = $derived(paragraphs.some(p => p.study_translation));

  // Auth-based visibility
  let isAdmin = $derived(auth.user?.tier === 'admin' || auth.user?.tier === 'superadmin' || auth.user?.tier === 'editor');
  let isLoggedIn = $derived(auth.isAuthenticated);
  let isNonEnglish = $derived(document?.language && document.language !== 'en');

  // View mode state
  let viewMode = $state('default'); // 'default' | 'sbs' | 'study'
  let showViewMenu = $state(false); // Mobile dropdown

  // Translation queue state
  let translationQueuing = $state(false);
  let translationJobId = $state(null);
  let translationProgress = $state(null); // { progress, total, status }
  let translationPolling = $state(null);

  /**
   * Queue translation directly without modal
   */
  async function queueTranslation() {
    if (!document?.id || translationQueuing || translationJobId) return;

    translationQueuing = true;
    try {
      const res = await authenticatedFetch(`${API_BASE}/api/services/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document.id,
          targetLanguage: 'en',
          quality: 'high'
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to queue');
      }

      const data = await res.json();
      translationJobId = data.jobId;
      translationProgress = { progress: 0, total: 0, status: 'queued' };

      // Start polling for job status
      startTranslationPolling();
    } catch (err) {
      console.error('Translation queue failed:', err);
    } finally {
      translationQueuing = false;
    }
  }

  /**
   * Poll for translation job status
   */
  function startTranslationPolling() {
    if (translationPolling) return;

    translationPolling = setInterval(async () => {
      if (!translationJobId) {
        stopTranslationPolling();
        return;
      }

      try {
        const res = await authenticatedFetch(`${API_BASE}/api/services/translate/status/${translationJobId}`);
        if (!res.ok) throw new Error('Failed to get status');

        const status = await res.json();
        // API returns totalItems, not total
        translationProgress = {
          progress: status.progress ?? 0,
          total: status.totalItems ?? 0,
          status: status.status
        };
        console.log('Translation status:', translationProgress);

        // Job completed - reload document and stop polling
        if (status.status === 'completed') {
          stopTranslationPolling();
          translationJobId = null;
          // Reload document to get updated translations
          await loadDocument();
        } else if (status.status === 'failed') {
          stopTranslationPolling();
          translationJobId = null;
          translationProgress = { ...translationProgress, status: 'failed', error: status.error };
        }
      } catch (err) {
        console.error('Status poll failed:', err);
      }
    }, 3000); // Poll every 3 seconds
  }

  function stopTranslationPolling() {
    if (translationPolling) {
      clearInterval(translationPolling);
      translationPolling = null;
    }
  }

  // Phrase highlighting state for SBS mode
  let highlightedSegmentId = $state(null);

  /**
   * Parse translation field (handles both string and JSON formats)
   * New format: { reading: "...", study: "...", segments: [...], notes: [...] }
   * Legacy format: plain string
   */
  function parseTranslation(para) {
    if (!para.translation) return null;
    try {
      // Try parsing as JSON
      const parsed = typeof para.translation === 'string'
        ? JSON.parse(para.translation)
        : para.translation;
      if (parsed && typeof parsed === 'object') {
        return {
          reading: parsed.reading || null,
          study: parsed.study || null,
          segments: parsed.segments || null,
          notes: parsed.notes || null
        };
      }
    } catch {
      // Not JSON - legacy plain string format
      return { reading: para.translation, study: null, segments: null, notes: null };
    }
    return null;
  }

  /**
   * Parse translation_segments from paragraph
   * Returns array of { id, original, translation } or null
   */
  function parseSegments(para) {
    // First check if segments are in the JSON translation
    const trans = parseTranslation(para);
    if (trans?.segments && Array.isArray(trans.segments) && trans.segments.length > 0) {
      // Ensure each segment has an id for highlighting
      return trans.segments.map((seg, idx) => ({
        ...seg,
        id: seg.id ?? idx
      }));
    }
    // Fallback to translation_segments field
    if (!para.translation_segments) return null;
    try {
      const segments = typeof para.translation_segments === 'string'
        ? JSON.parse(para.translation_segments)
        : para.translation_segments;
      if (!Array.isArray(segments) || segments.length === 0) return null;
      // Ensure each segment has an id for highlighting
      return segments.map((seg, idx) => ({
        ...seg,
        id: seg.id ?? idx
      }));
    } catch {
      return null;
    }
  }

  /**
   * Highlight a segment on hover/tap
   */
  function highlightSegment(segId) {
    highlightedSegmentId = segId;
  }

  /**
   * Clear segment highlight
   */
  function clearHighlight() {
    highlightedSegmentId = null;
  }
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

      <!-- Mobile: Single hamburger menu for ALL actions -->
      <div class="mobile-menu">
        <button
          class="util-btn menu-toggle"
          onclick={() => showViewMenu = !showViewMenu}
          title="Menu"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
        {#if showViewMenu}
          <div class="mobile-menu-dropdown">
            <!-- View modes (if non-English) -->
            {#if isNonEnglish}
              <div class="menu-section-label">View Mode</div>
              <button
                class="menu-item"
                class:active={viewMode === 'default'}
                onclick={() => { viewMode = 'default'; showViewMenu = false; }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 6h16M4 12h16M4 18h10"/>
                </svg>
                <span>Base</span>
              </button>
              <button
                class="menu-item"
                class:active={viewMode === 'sbs'}
                class:disabled={!hasTranslations}
                onclick={() => { if (hasTranslations) { viewMode = 'sbs'; showViewMenu = false; } }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="7" height="18" rx="1"/>
                  <rect x="14" y="3" width="7" height="18" rx="1"/>
                </svg>
                <span>Side-by-Side</span>
              </button>
              <button
                class="menu-item"
                class:active={viewMode === 'study'}
                class:disabled={!hasStudyTranslations}
                onclick={() => { if (hasStudyTranslations) { viewMode = 'study'; showViewMenu = false; } }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                <span>Study</span>
              </button>
              <div class="menu-divider"></div>
            {/if}

            <!-- Share actions -->
            <div class="menu-section-label">Share</div>
            <button class="menu-item" onclick={() => { showQRCode(); showViewMenu = false; }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
                <path d="M14 14h3v3h-3zM17 17h3v3h-3z"/>
              </svg>
              <span>QR Code</span>
            </button>
            <button class="menu-item" onclick={() => { copyShareLink(); showViewMenu = false; }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
              <span>{linkCopied ? 'Copied!' : 'Copy Link'}</span>
            </button>
            <button class="menu-item" onclick={() => { openPrintView(); showViewMenu = false; }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              <span>Print</span>
            </button>

            <!-- Admin actions -->
            {#if isAdmin}
              <div class="menu-divider"></div>
              <div class="menu-section-label">Admin</div>
              <button class="menu-item" onclick={() => { openEditor(); showViewMenu = false; }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span>Edit</span>
              </button>
              {#if isNonEnglish}
                {#if translationQueuing || translationJobId}
                  {@const progress = translationProgress?.total > 0 ? (translationProgress.progress / translationProgress.total) * 100 : 0}
                  <div class="menu-item progress-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M2 12h20"/>
                    </svg>
                    <span>Translating {Math.round(progress)}%</span>
                  </div>
                {:else}
                  <button class="menu-item" onclick={() => { queueTranslation(); showViewMenu = false; }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                    <span>Translate</span>
                  </button>
                {/if}
              {/if}
            {/if}
          </div>
        {/if}
      </div>

      <!-- Desktop: All buttons visible -->
      <div class="desktop-buttons">
        <!-- View mode group for non-English docs -->
        {#if isNonEnglish}
          <div class="util-divider"></div>
          <div class="view-mode-group">
            <button
              class="mode-btn"
              class:active={viewMode === 'default'}
              onclick={() => viewMode = 'default'}
              title="Original text only"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 6h16M4 12h16M4 18h10"/>
              </svg>
              <span class="mode-label">Base</span>
            </button>
            <button
              class="mode-btn"
              class:active={viewMode === 'sbs'}
              class:disabled={!hasTranslations}
              onclick={() => hasTranslations && (viewMode = 'sbs')}
              title={hasTranslations ? 'Side-by-side translation' : 'No translations available yet'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="18" rx="1"/>
                <rect x="14" y="3" width="7" height="18" rx="1"/>
              </svg>
              <span class="mode-label">SBS</span>
            </button>
            <button
              class="mode-btn"
              class:active={viewMode === 'study'}
              class:disabled={!hasStudyTranslations}
              onclick={() => hasStudyTranslations && (viewMode = 'study')}
              title={hasStudyTranslations ? 'Study mode with notes' : 'Study translations not available'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
              <span class="mode-label">Study</span>
            </button>
          </div>
        {/if}

        <div class="util-divider"></div>

        <!-- Sharing & utility buttons -->
        <div class="util-actions">
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

        <!-- Admin-only buttons at bottom -->
        {#if isAdmin}
          <div class="util-divider"></div>
          <div class="util-actions admin-actions">
            <button class="util-btn edit" onclick={openEditor} title="Edit document">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            {#if isNonEnglish}
              {#if translationQueuing || translationJobId}
                {@const progress = translationProgress?.total > 0 ? (translationProgress.progress / translationProgress.total) * 100 : 0}
                {@const circumference = 2 * Math.PI * 10}
                {@const strokeDashoffset = circumference - (progress / 100) * circumference}
                <div class="util-btn translate progress" title={`Translating: ${translationProgress?.progress || 0}/${translationProgress?.total || '?'}`}>
                  <svg class="progress-ring-btn" viewBox="0 0 24 24">
                    <circle class="progress-ring-bg" cx="12" cy="12" r="10" fill="none" stroke-width="2"/>
                    <circle
                      class="progress-ring-progress"
                      cx="12" cy="12" r="10"
                      fill="none"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-dasharray={circumference}
                      stroke-dashoffset={strokeDashoffset}
                      transform="rotate(-90 12 12)"
                    />
                  </svg>
                  <span class="progress-pct">{Math.round(progress)}%</span>
                </div>
              {:else}
                <button class="util-btn translate" onclick={queueTranslation} title="Queue translation">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                </button>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Document content with integrated header -->
    <main
      class="document-content"
      dir={getLanguageDirection(document.language)}
      class:rtl={getLanguageDirection(document.language) === 'rtl'}
      class:bilingual={viewMode === 'sbs' || viewMode === 'study'}
      class:study-mode={viewMode === 'study'}
    >
      <!-- Document header - always LTR for simplicity -->
      <header class="doc-header" dir="ltr">
        <!-- URL-style breadcrumb bar -->
        <nav class="url-breadcrumb" aria-label="Breadcrumb">
          <a href="/" class="url-home" title="Home">
            <img src="/ocean.svg" alt="" class="url-icon" />
          </a>
          <a href="/" class="url-domain">
            <span class="domain-name">SifterSearch</span><span class="domain-tld">.com</span>
          </a>
          <span class="url-sep">/</span>
          <a href="/library" class="url-segment">Library</a>
          {#if document.religion}
            <span class="url-sep">/</span>
            <a href="/library/{pathReligion}" class="url-segment">{document.religion}</a>
          {/if}
          {#if document.collection}
            <span class="url-sep">/</span>
            <a href="/library/{pathReligion}/{pathCollection}" class="url-segment">{document.collection}</a>
          {/if}
          <span class="url-sep">/</span>
          <span class="url-current">{document.filename || pathSlug}</span>

          {#if qrCodeUrl}
            <button class="url-qr" onclick={showQRCode} title="Share this document">
              <img src={qrCodeUrl} alt="QR" class="url-qr-img" />
            </button>
          {/if}
        </nav>

        <!-- Title and metadata -->
        <h1 class="doc-title">{document.title || document.filename?.replace(/\.[^.]+$/, '') || 'Untitled'}</h1>

        {#if document.author}
          <p class="doc-author">by {document.author}</p>
        {/if}

        <div class="doc-meta">
          {#if document.language}
            <span class="meta-tag language">{getLanguageName(document.language)}</span>
          {/if}
          {#if viewMode === 'sbs'}
            <span class="meta-tag translation-mode">Literary Translation</span>
          {:else if viewMode === 'study'}
            <span class="meta-tag translation-mode study">Literal Study</span>
          {/if}
          {#if document.year}
            <span class="meta-tag">{document.year}</span>
          {/if}
          {#if document.encumbered}
            <span class="meta-tag copyright">© Copyrighted</span>
          {/if}
        </div>

        <!-- Abstract section -->
        {#if document.abstract || document.description}
          <div class="doc-abstract">
            <p>{document.abstract || document.description}</p>
          </div>
        {/if}
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
            class:bilingual-paragraph={(viewMode === 'sbs' && parseTranslation(para)?.reading) || (viewMode === 'study' && parseTranslation(para)?.study)}
            id="p{para.paragraph_index}"
            data-index={para.paragraph_index}
          >
            {#if para.heading}
              <h2 class="paragraph-heading">{para.heading}</h2>
            {/if}

            <!-- SBS Mode: Side-by-side reading translation (English on LEFT) -->
            {#if viewMode === 'sbs' && parseTranslation(para)?.reading}
              {@const trans = parseTranslation(para)}
              {@const segments = parseSegments(para)}
              <div class="bilingual-row">
                <!-- Translation (English) on LEFT -->
                <div class="translation-col">
                  {#if segments}
                    <!-- Phrase-level aligned view -->
                    <div class="paragraph-text translation segmented">
                      {#each segments as seg}
                        <span
                          class="segment-phrase"
                          class:highlighted={highlightedSegmentId === seg.id}
                          data-seg-id={seg.id}
                          onmouseenter={() => highlightSegment(seg.id)}
                          onmouseleave={clearHighlight}
                          onclick={() => highlightSegment(seg.id)}
                          role="button"
                          tabindex="0"
                        >{seg.translation}</span>{' '}
                      {/each}
                    </div>
                  {:else}
                    <!-- Fallback: plain translation text -->
                    <div class="paragraph-text translation">{@html renderMarkdown(trans.reading)}</div>
                  {/if}
                </div>
                <div class="para-center">
                  <button
                    class="para-anchor-btn"
                    onclick={() => copyParagraphLink((para.paragraph_index ?? i) + 1)}
                    title="Copy link to paragraph {(para.paragraph_index ?? i) + 1}"
                  >
                    {(para.paragraph_index ?? i) + 1}
                  </button>
                </div>
                <!-- Original on RIGHT -->
                <div class="original-col" dir={getLanguageDirection(document.language)}>
                  {#if segments}
                    <!-- Phrase-level aligned view -->
                    <div class="paragraph-text segmented">
                      {#each segments as seg}
                        <span
                          class="segment-phrase"
                          class:highlighted={highlightedSegmentId === seg.id}
                          data-seg-id={seg.id}
                          onmouseenter={() => highlightSegment(seg.id)}
                          onmouseleave={clearHighlight}
                          onclick={() => highlightSegment(seg.id)}
                          role="button"
                          tabindex="0"
                        >{seg.original}</span>{' '}
                      {/each}
                    </div>
                  {:else}
                    <!-- Fallback: plain original text -->
                    <div class="paragraph-text">{@html renderMarkdown(para.text)}</div>
                  {/if}
                </div>
              </div>

            <!-- Study Mode: Phrase-by-phrase literal translation (English on LEFT) -->
            {:else if viewMode === 'study' && parseTranslation(para)?.study}
              {@const trans = parseTranslation(para)}
              {@const notes = trans.notes}
              <div class="bilingual-row study-row">
                <!-- Study translation (English) on LEFT -->
                <div class="translation-col">
                  {#if notes && Array.isArray(notes) && notes.length > 0}
                    <!-- Phrase-by-phrase with linguistic notes -->
                    <div class="paragraph-text study-text segmented">
                      {#each notes as seg, idx}
                        <span
                          class="segment-phrase study-phrase"
                          class:highlighted={highlightedSegmentId === idx}
                          data-seg-id={idx}
                          onmouseenter={() => highlightSegment(idx)}
                          onmouseleave={clearHighlight}
                          onclick={() => highlightSegment(idx)}
                          role="button"
                          tabindex="0"
                          title={seg.notes || ''}
                        >{seg.literal}</span>{' '}
                      {/each}
                    </div>
                  {:else}
                    <!-- Fallback: plain study translation -->
                    <div class="paragraph-text study-text">{@html renderMarkdown(trans.study)}</div>
                  {/if}
                </div>
                <div class="para-center">
                  <button
                    class="para-anchor-btn"
                    onclick={() => copyParagraphLink((para.paragraph_index ?? i) + 1)}
                    title="Copy link to paragraph {(para.paragraph_index ?? i) + 1}"
                  >
                    {(para.paragraph_index ?? i) + 1}
                  </button>
                </div>
                <!-- Original on RIGHT -->
                <div class="original-col" dir={getLanguageDirection(document.language)}>
                  {#if notes && Array.isArray(notes) && notes.length > 0}
                    <!-- Phrase-by-phrase original -->
                    <div class="paragraph-text segmented">
                      {#each notes as seg, idx}
                        <span
                          class="segment-phrase"
                          class:highlighted={highlightedSegmentId === idx}
                          data-seg-id={idx}
                          onmouseenter={() => highlightSegment(idx)}
                          onmouseleave={clearHighlight}
                          onclick={() => highlightSegment(idx)}
                          role="button"
                          tabindex="0"
                        >{seg.original}</span>{' '}
                      {/each}
                    </div>
                  {:else}
                    <!-- Fallback: plain original text -->
                    <div class="paragraph-text">{@html renderMarkdown(para.text)}</div>
                  {/if}
                </div>
              </div>

            <!-- Default Mode: Original text only -->
            {:else}
              <button
                class="para-anchor"
                onclick={() => copyParagraphLink((para.paragraph_index ?? i) + 1)}
                title="Copy link to paragraph {(para.paragraph_index ?? i) + 1}"
              >
                {(para.paragraph_index ?? i) + 1}
              </button>
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

      <!-- Document footer with metadata and QR code -->
      <footer class="doc-footer">
        <div class="footer-content">
          <div class="footer-meta">
            <p class="footer-title">{document.title || document.filename?.replace(/\.[^.]+$/, '') || 'Untitled'}</p>
            {#if document.author}
              <p class="footer-author">by {document.author}</p>
            {/if}
            <p class="footer-collection">{document.religion}{document.collection ? ` · ${document.collection}` : ''}</p>
            <p class="footer-url">{typeof window !== 'undefined' ? window.location.href : ''}</p>
          </div>
          <div class="footer-qr">
            {#if qrCodeUrl}
              <img src={qrCodeUrl} alt="Scan to access this document" class="footer-qr-img" />
            {/if}
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
    /* Center buttons in the 5rem right margin: (5rem - 2.5rem button) / 2 = 1.25rem from edge */
    right: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 40; /* Below navbar dropdowns (200+) */
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

  /* Divider between button groups */
  .util-divider {
    width: 1.5rem;
    height: 1px;
    background: rgba(0, 0, 0, 0.1);
    margin: 0.25rem 0.5rem;
  }

  /* Translate button */
  .util-btn.translate {
    background: #8b5cf6;
    color: white;
    border-color: #8b5cf6;
  }

  .util-btn.translate:hover {
    background: #7c3aed;
  }

  /* Translate button with progress */
  .util-btn.translate.progress {
    background: #f0fdf4;
    border-color: #10b981;
    position: relative;
    cursor: default;
    flex-direction: column;
    gap: 0;
  }

  .progress-ring-btn {
    width: 1.5rem;
    height: 1.5rem;
  }

  .progress-ring-bg {
    stroke: #e5e7eb;
  }

  .progress-ring-progress {
    stroke: #10b981;
    transition: stroke-dashoffset 0.3s ease;
  }

  .util-btn.translate .progress-pct {
    font-size: 0.5rem;
    font-weight: 700;
    color: #10b981;
    font-family: system-ui, -apple-system, sans-serif;
    line-height: 1;
  }

  /* Mobile menu - hidden on desktop */
  .mobile-menu {
    display: none;
    position: relative;
  }

  .menu-toggle {
    background: white;
  }

  .mobile-menu-dropdown {
    position: absolute;
    right: 100%;
    top: 0;
    margin-right: 0.5rem;
    background: white;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 140px;
    overflow: hidden;
    z-index: 50;
  }

  .menu-section-label {
    padding: 0.5rem 0.75rem 0.25rem;
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #999;
  }

  .menu-divider {
    height: 1px;
    background: rgba(0, 0, 0, 0.1);
    margin: 0.25rem 0;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: white;
    border: none;
    cursor: pointer;
    font-size: 0.8125rem;
    color: #555;
    transition: all 0.15s;
  }

  .menu-item:hover {
    background: #f5f5f5;
    color: #333;
  }

  .menu-item.active {
    background: #3b82f6;
    color: white;
  }

  .menu-item.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .menu-item.disabled:hover {
    background: white;
    color: #555;
  }

  .menu-item.progress-item {
    color: #10b981;
    font-weight: 500;
    cursor: default;
  }

  .menu-item svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  /* Desktop buttons - visible on desktop */
  .desktop-buttons {
    display: contents;
  }

  /* View mode toggle group */
  .view-mode-group {
    display: flex;
    flex-direction: column;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }

  .mode-btn {
    width: 2.5rem;
    height: auto;
    min-height: 2.5rem;
    padding: 0.375rem 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.125rem;
    background: white;
    border: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    cursor: pointer;
    color: #888;
    transition: all 0.2s;
  }

  .mode-btn:last-child {
    border-bottom: none;
  }

  .mode-btn:hover {
    background: #f5f5f5;
    color: #333;
  }

  .mode-btn.active {
    background: #3b82f6;
    color: white;
  }

  .mode-btn.disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .mode-btn.disabled:hover {
    background: white;
    color: #888;
  }

  .mode-btn svg {
    width: 1rem;
    height: 1rem;
  }

  .mode-btn .mode-label {
    font-size: 0.5rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    font-family: system-ui, -apple-system, sans-serif;
  }

  /* Para anchor button in bilingual/study modes */
  .para-anchor-btn {
    font-family: 'Libre Caslon Text', Georgia, serif;
    font-size: 0.75rem;
    color: #999;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    line-height: 1.75;
    transition: color 0.2s;
  }

  .para-anchor-btn:hover {
    color: #3b82f6;
  }

  /* Document header - inside the paper */
  .doc-header {
    text-align: center;
    padding-bottom: 1.5rem;
    margin-bottom: 1.5rem;
    position: relative;
    overflow: hidden;
  }

  /* URL-style breadcrumb bar */
  .url-breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.8125rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    justify-content: flex-start;
    position: relative;
    padding-right: 3rem; /* Space for QR */
  }

  .url-home {
    display: flex;
    align-items: center;
    margin-right: 0.125rem;
  }

  .url-icon {
    width: 2.5rem;
    height: 2.5rem;
    opacity: 0.85;
    transition: opacity 0.2s;
  }

  .url-home:hover .url-icon {
    opacity: 1;
  }

  .url-domain {
    text-decoration: none;
    font-weight: 600;
    transition: opacity 0.2s;
  }

  .url-domain:hover {
    opacity: 0.8;
  }

  .domain-name {
    color: #1a1a1a;
  }

  .domain-tld {
    color: #14b8a6; /* Teal to match icon */
  }

  .url-sep {
    color: #bbb;
    font-weight: 400;
    margin: 0 0.125rem;
  }

  .url-segment {
    color: #666;
    text-decoration: none;
    transition: color 0.2s;
  }

  .url-segment:hover {
    color: #14b8a6;
  }

  .url-current {
    color: #999;
    font-weight: 400;
  }

  /* QR code button - positioned to the right */
  .url-qr {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 1px solid #ddd;
    border-radius: 0.5rem;
    padding: 0.25rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .url-qr:hover {
    border-color: #14b8a6;
    box-shadow: 0 2px 8px rgba(20, 184, 166, 0.2);
  }

  .url-qr-img {
    width: 2.5rem;
    height: 2.5rem;
    display: block;
    border-radius: 0.25rem;
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

  .meta-tag.translation-mode {
    background: #dbeafe;
    color: #1d4ed8;
    font-style: italic;
  }

  .meta-tag.translation-mode.study {
    background: #ede9fe;
    color: #6d28d9;
  }

  /* Abstract block */
  .doc-abstract {
    margin: 1.5rem auto 0;
    padding: 1.25rem 1.5rem;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.04) 0%, rgba(59, 130, 246, 0.02) 100%);
    border-left: 3px solid rgba(59, 130, 246, 0.3);
    border-radius: 0 0.5rem 0.5rem 0;
    max-width: 36rem;
    position: relative;
    z-index: 1;
  }

  .doc-abstract p {
    margin: 0;
    font-size: 0.95rem;
    color: #444;
    line-height: 1.7;
    font-style: italic;
  }

  .doc-divider {
    border: none;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    margin: 0 0 1.5rem 0;
  }

  /* Translation mode header */
  .translation-mode-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    margin-bottom: 1.5rem;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%);
    border: 1px solid rgba(59, 130, 246, 0.15);
    border-radius: 0.5rem;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .translation-mode-header.study {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(139, 92, 246, 0.04) 100%);
    border-color: rgba(139, 92, 246, 0.15);
  }

  .mode-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #3b82f6;
  }

  .translation-mode-header.study .mode-label {
    color: #7c3aed;
  }

  .mode-desc {
    font-size: 0.75rem;
    color: #666;
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
    justify-content: space-between;
    gap: 1.5rem;
  }

  .footer-meta {
    flex: 1;
  }

  .footer-title {
    font-family: 'Libre Caslon Text', Georgia, serif;
    font-size: 1rem;
    font-weight: 600;
    color: #1a1a1a;
    margin: 0 0 0.25rem 0;
  }

  .footer-author {
    font-family: 'Libre Caslon Text', Georgia, serif;
    font-size: 0.875rem;
    font-style: italic;
    color: #555;
    margin: 0 0 0.25rem 0;
  }

  .footer-collection {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.75rem;
    color: #888;
    margin: 0 0 0.5rem 0;
  }

  .footer-qr-img {
    width: 80px;
    height: 80px;
    border-radius: 0.375rem;
    border: 1px solid #ddd;
  }

  .footer-url {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.625rem;
    color: #999;
    margin: 0;
    word-break: break-all;
  }

  /* Document content - paper background with explicit light colors */
  .document-content {
    max-width: 48rem;
    margin: 2rem auto;
    /* Right margin for utility bar: 1.5rem (bar position) + 2.5rem (buttons) + 1rem (buffer) = 5rem */
    margin-right: 5rem;
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
    /* Arabic text 1.25x larger than base for readability */
    font-size: 1.25rem;
    line-height: 2;
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
    /* English translation - left-aligned with tighter line spacing */
    text-align: left;
  }

  .translation-col .paragraph-text {
    color: #333;
    font-style: normal;
    /* Tighter line spacing for English to match base mode */
    line-height: 1.75;
  }

  /* Phrase-level segment highlighting */
  .paragraph-text.segmented {
    display: inline;
  }

  .segment-phrase {
    cursor: pointer;
    padding: 0.1em 0.15em;
    margin: -0.1em -0.05em;
    border-radius: 0.2em;
    transition: all 0.15s ease;
    display: inline;
  }

  .segment-phrase:hover {
    background: rgba(59, 130, 246, 0.15);
  }

  .segment-phrase.highlighted {
    background: rgba(59, 130, 246, 0.25);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
  }

  /* RTL segment styling */
  .original-col[dir="rtl"] .segment-phrase {
    unicode-bidi: isolate;
  }

  /* Focus styles for keyboard navigation */
  .segment-phrase:focus {
    outline: none;
    background: rgba(59, 130, 246, 0.2);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.4);
  }

  /* Touch-friendly tap targets on mobile */
  @media (pointer: coarse) {
    .segment-phrase {
      padding: 0.2em 0.25em;
      margin: 0 0.05em;
    }
  }

  /* Study mode layout */
  .study-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 0;
    flex: 1;
    min-width: 0;
  }

  .study-col {
    padding-left: 1.25rem;
    border-left: 1px solid rgba(0, 0, 0, 0.08);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .study-translation {
    font-size: 1rem;
    line-height: 1.75;
    color: #333;
    font-family: 'Libre Caslon Text', Georgia, serif;
  }

  .study-notes {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #f5f3ee;
    border-radius: 0.375rem;
    border: 1px solid rgba(0, 0, 0, 0.06);
  }

  .note-segment {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .note-original {
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1rem;
    color: #1a1a1a;
    font-weight: 500;
    direction: rtl;
  }

  .note-literal {
    color: #555;
    font-style: italic;
  }

  .note-annotation {
    color: #777;
    font-size: 0.75rem;
    flex-basis: 100%;
    padding-left: 1rem;
    border-left: 2px solid #ddd;
    margin-top: 0.25rem;
  }

  /* Study mode document styling */
  .document-content.study-mode {
    max-width: 80rem;
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

    /* Show mobile hamburger menu, hide desktop buttons */
    .mobile-menu {
      display: block;
    }

    .desktop-buttons {
      display: none;
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
      /* Minimal right margin - only back + hamburger buttons on mobile */
      margin: 1rem 0.5rem;
      padding: 1.5rem 1rem 3rem 1rem;
    }

    /* URL breadcrumb adjustments for mobile */
    .url-breadcrumb {
      font-size: 0.6875rem;
      padding-right: 2.5rem;
    }

    .url-icon {
      width: 1.25rem;
      height: 1.25rem;
    }

    .url-qr-img {
      width: 1.5rem;
      height: 1.5rem;
    }

    .doc-abstract {
      padding: 1rem;
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

    /* Study mode mobile */
    .study-row {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .study-col {
      padding-left: 0;
      border-left: none;
      border-top: 1px solid rgba(0, 0, 0, 0.08);
      padding-top: 1rem;
    }

    .document-content.study-mode {
      max-width: 100%;
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

    /* URL breadcrumb print styles */
    .url-breadcrumb {
      font-size: 9pt;
      margin-bottom: 0.75rem;
    }

    .url-icon {
      width: 1rem;
      height: 1rem;
    }

    .url-qr {
      display: flex !important;
      border: 1px solid #ccc;
    }

    .url-qr-img {
      width: 1.5rem;
      height: 1.5rem;
    }

    .domain-tld {
      color: #0d9488; /* Darker teal for print */
    }

    /* Show footer in print with QR and metadata */
    .doc-footer {
      display: block !important;
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid #ddd;
    }

    .footer-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .footer-title {
      font-size: 11pt;
    }

    .footer-author {
      font-size: 10pt;
    }

    .footer-collection {
      font-size: 8pt;
    }

    .footer-url {
      font-size: 7pt;
    }

    .footer-qr {
      display: block !important;
    }

    .footer-qr-img {
      display: block !important;
      width: 64px !important;
      height: 64px !important;
    }

    /* Document header styling for print */
    .doc-header {
      padding-bottom: 0.5rem;
      margin-bottom: 0.5rem;
      overflow: visible;
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

    /* Hide auth gate and load more in print */
    .auth-gate,
    .load-more-section {
      display: none !important;
    }

    /* Abstract styling for print */
    .doc-abstract {
      margin: 1rem auto 0;
      padding: 0.75rem 1rem;
      border-left-width: 2px;
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

    .para-anchor-btn {
      color: #666;
    }

    /* Study mode print styles */
    .document-content.study-mode {
      max-width: 100%;
    }

    .study-row {
      page-break-inside: avoid;
      gap: 0;
    }

    .study-col {
      border-color: #ccc;
      padding-left: 0.5rem;
    }

    .study-translation {
      font-size: 10pt;
    }

    .study-notes {
      background: #f5f5f5;
      border-color: #ddd;
      padding: 0.5rem;
      margin-top: 0.5rem;
    }

    .note-segment {
      font-size: 8pt;
    }

    .note-original {
      font-size: 9pt;
    }

    .note-annotation {
      font-size: 7pt;
      color: #555;
    }

    /* Segment phrases in print - no interactive styling */
    .segment-phrase {
      cursor: default;
      padding: 0;
      margin: 0;
      background: none !important;
      box-shadow: none !important;
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
