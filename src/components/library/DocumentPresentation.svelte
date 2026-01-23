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
  import markedFootnote from 'marked-footnote';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';

  // Enable footnote extension for markdown
  marked.use(markedFootnote());
  import { generateQRCodeUrl } from '../../lib/qrcode.js';
  import { authenticatedFetch } from '../../lib/api.js';
  import AuthModal from '../AuthModal.svelte';

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';

  /**
   * Svelte action to force single line-height on all child elements
   * This bypasses CSS specificity issues with dynamic content
   */
  function singleSpaced(node) {
    const applyLineHeight = () => {
      node.style.lineHeight = '1.15';
      node.querySelectorAll('*').forEach(el => {
        el.style.lineHeight = '1.15';
      });
    };
    // Apply immediately and observe for changes
    applyLineHeight();
    const observer = new MutationObserver(applyLineHeight);
    observer.observe(node, { childList: true, subtree: true });
    return {
      destroy() {
        observer.disconnect();
      }
    };
  }

  // Props - path segments from URL
  let {
    pathReligion = '',
    pathCollection = '',
    pathSlug = '',
    initialViewMode = 'default'
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

    // Check for any active translation jobs for this document
    await checkForActiveTranslation();

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

  // Render content based on blocktype (heading1, heading2, heading3, heading4, quote, etc.)
  function renderBlockContent(text, blocktype) {
    if (!text) return '';
    const clean = stripMarkers(text);
    // For headings, use marked.parseInline to handle links/formatting but not wrap in <p>
    switch (blocktype) {
      case 'heading1':
        return `<h1>${marked.parseInline(clean)}</h1>`;
      case 'heading2':
        return `<h2>${marked.parseInline(clean)}</h2>`;
      case 'heading3':
        return `<h3>${marked.parseInline(clean)}</h3>`;
      case 'heading4':
        return `<h4>${marked.parseInline(clean)}</h4>`;
      case 'quote':
        return `<blockquote>${marked.parse(clean)}</blockquote>`;
      default:
        return marked.parse(clean);
    }
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

  // Check if document has study translations (API returns study_translation field)
  let hasStudyTranslations = $derived(paragraphs.some(p => p.study_translation));

  // Check if all paragraphs are translated (100% complete)
  let isFullyTranslated = $derived(
    paragraphs.length > 0 && paragraphs.every(p => p.translation)
  );

  // Calculate translation percentage for partial translations
  let translationPercentage = $derived(() => {
    if (paragraphs.length === 0) return 0;
    const translated = paragraphs.filter(p => p.translation).length;
    return Math.round((translated / paragraphs.length) * 100);
  });

  // Check if partially translated (some but not all)
  let isPartiallyTranslated = $derived(
    hasTranslations && !isFullyTranslated
  );

  // Auth-based visibility
  let isAdmin = $derived(auth.user?.tier === 'admin' || auth.user?.tier === 'superadmin' || auth.user?.tier === 'editor');
  let isLoggedIn = $derived(auth.isAuthenticated);
  let isNonEnglish = $derived(document?.language && document.language !== 'en');

  // View mode state - initialize from prop (for shareable links)
  let viewMode = $state(initialViewMode); // 'default' | 'sbs' | 'study'
  let showViewMenu = $state(false); // Mobile dropdown

  /**
   * Update URL query parameter when view mode changes
   * This makes the view mode shareable via the URL
   */
  function updateViewModeUrl(mode) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (mode === 'default') {
      url.searchParams.delete('view');
    } else {
      url.searchParams.set('view', mode);
    }
    // Update URL without reload
    window.history.replaceState({}, '', url.toString());
  }

  // Watch for viewMode changes and update URL
  $effect(() => {
    updateViewModeUrl(viewMode);
  });

  // Translation queue state
  let translationQueuing = $state(false);
  let translationJobId = $state(null);
  let translationProgress = $state(null); // { progress, total, status }
  let translationPolling = $state(null);

  // localStorage key for persisting translation jobs
  const TRANSLATION_JOBS_KEY = 'sifter_translation_jobs';

  /**
   * Get stored translation jobs from localStorage
   */
  function getStoredTranslationJobs() {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem(TRANSLATION_JOBS_KEY) || '{}');
    } catch {
      return {};
    }
  }

  /**
   * Save translation job to localStorage
   */
  function saveTranslationJob(docId, jobId) {
    if (typeof window === 'undefined') return;
    const jobs = getStoredTranslationJobs();
    jobs[docId] = { jobId, startedAt: Date.now() };
    localStorage.setItem(TRANSLATION_JOBS_KEY, JSON.stringify(jobs));
  }

  /**
   * Remove translation job from localStorage
   */
  function removeTranslationJob(docId) {
    if (typeof window === 'undefined') return;
    const jobs = getStoredTranslationJobs();
    delete jobs[docId];
    localStorage.setItem(TRANSLATION_JOBS_KEY, JSON.stringify(jobs));
  }

  /**
   * Check for and restore any active translation job for this document
   */
  async function checkForActiveTranslation() {
    if (!document?.id) return;

    const jobs = getStoredTranslationJobs();
    const job = jobs[document.id];

    if (job?.jobId) {
      // Check if job is still active (less than 1 hour old)
      const hourAgo = Date.now() - (60 * 60 * 1000);
      if (job.startedAt && job.startedAt < hourAgo) {
        // Job is stale, remove it
        removeTranslationJob(document.id);
        return;
      }

      // Restore job and start polling
      translationJobId = job.jobId;
      translationProgress = { progress: 0, total: 0, status: 'checking' };
      startTranslationPolling();
    }
  }

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

      // Persist job to localStorage
      saveTranslationJob(document.id, data.jobId);

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
          removeTranslationJob(document.id);
          translationJobId = null;
          // Reload document to get updated translations
          await loadDocument();
        } else if (status.status === 'failed') {
          stopTranslationPolling();
          removeTranslationJob(document.id);
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
  // Uses composite key (paraIndex:segId) to ensure uniqueness across paragraphs
  let highlightedSegmentKey = $state(null);

  function getSegmentKey(paraIndex, segId) {
    return `${paraIndex}:${segId}`;
  }

  function highlightSegment(paraIndex, segId) {
    highlightedSegmentKey = getSegmentKey(paraIndex, segId);
  }

  function clearHighlight(paraIndex, segId) {
    if (highlightedSegmentKey === getSegmentKey(paraIndex, segId)) {
      highlightedSegmentKey = null;
    }
  }

  function isSegmentHighlighted(paraIndex, segId) {
    return highlightedSegmentKey === getSegmentKey(paraIndex, segId);
  }

  /**
   * Parse translation field (handles both string and JSON formats)
   * New format: { reading: "...", study: "...", segments: [...], notes: [...] }
   * Legacy format: plain string
   */
  function parseTranslation(para) {
    // API pre-parses translation JSON into separate fields:
    // - para.translation: reading text (string)
    // - para.study_translation: study text (string)
    // - para.translation_segments: segments array
    // - para.study_notes: notes array
    if (!para.translation && !para.study_translation) return null;
    return {
      reading: para.translation || null,
      study: para.study_translation || null,
      segments: para.translation_segments || null,
      notes: para.study_notes || null
    };
  }

  /**
   * Parse translation_segments from paragraph
   * Returns array of { id, original, translation } or null
   * Handles both array format and object format ({s1: {...}, s2: {...}})
   */
  function parseSegments(para) {
    // API provides translation_segments as pre-parsed array
    if (!para.translation_segments) return null;
    try {
      const segments = typeof para.translation_segments === 'string'
        ? JSON.parse(para.translation_segments)
        : para.translation_segments;
      return normalizeSegments(segments);
    } catch {
      return null;
    }
  }

  /**
   * Normalize segments to array format
   * Handles both array [{original, translation}] and object {s1: {original, text}} formats
   */
  function normalizeSegments(segments) {
    if (!segments) return null;

    // Already an array
    if (Array.isArray(segments)) {
      if (segments.length === 0) return null;
      return segments.map((seg, idx) => ({
        id: seg.id ?? idx,
        original: seg.original || '',
        translation: seg.translation || seg.text || ''
      }));
    }

    // Object format: {s1: {original, text}, s2: {...}, ...}
    if (typeof segments === 'object') {
      const keys = Object.keys(segments).filter(k => k.startsWith('s')).sort((a, b) => {
        const numA = parseInt(a.slice(1), 10);
        const numB = parseInt(b.slice(1), 10);
        return numA - numB;
      });
      if (keys.length === 0) return null;
      return keys.map((key, idx) => ({
        id: key,
        original: segments[key].original || '',
        translation: segments[key].translation || segments[key].text || ''
      }));
    }

    return null;
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
                {:else if isFullyTranslated}
                  <div class="menu-item progress-item complete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M9 12l2 2 4-4"/>
                    </svg>
                    <span>Translated 100%</span>
                  </div>
                {:else if isPartiallyTranslated}
                  <button class="menu-item progress-item partial" onclick={() => { queueTranslation(); showViewMenu = false; }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M2 12h20"/>
                    </svg>
                    <span>Translated {translationPercentage()}% — Continue</span>
                  </button>
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
              {:else if isFullyTranslated}
                <!-- Translation complete - show 100% indicator -->
                {@const circumference = 2 * Math.PI * 10}
                <div class="util-btn translate complete" title="Translation complete (100%)">
                  <svg class="progress-ring-btn" viewBox="0 0 24 24">
                    <circle class="progress-ring-bg" cx="12" cy="12" r="10" fill="none" stroke-width="2"/>
                    <circle
                      class="progress-ring-progress complete"
                      cx="12" cy="12" r="10"
                      fill="none"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-dasharray={circumference}
                      stroke-dashoffset="0"
                      transform="rotate(-90 12 12)"
                    />
                  </svg>
                  <span class="progress-pct">100%</span>
                </div>
              {:else if isPartiallyTranslated}
                <!-- Partially translated - show current percentage, click to continue -->
                {@const pct = translationPercentage()}
                {@const circumference = 2 * Math.PI * 10}
                {@const strokeDashoffset = circumference - (pct / 100) * circumference}
                <button class="util-btn translate partial" onclick={queueTranslation} title={`Translated ${pct}% — Click to continue`}>
                  <svg class="progress-ring-btn" viewBox="0 0 24 24">
                    <circle class="progress-ring-bg" cx="12" cy="12" r="10" fill="none" stroke-width="2"/>
                    <circle
                      class="progress-ring-progress partial"
                      cx="12" cy="12" r="10"
                      fill="none"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-dasharray={circumference}
                      stroke-dashoffset={strokeDashoffset}
                      transform="rotate(-90 12 12)"
                    />
                  </svg>
                  <span class="progress-pct">{pct}%</span>
                </button>
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
      <!-- Corner icons positioned relative to document-content box -->
      <a href="/" class="corner-icon corner-left" title="Home">
        <img src="/ocean.svg" alt="" class="url-icon" />
      </a>

      {#if qrCodeUrl}
        <button class="corner-icon corner-right" onclick={showQRCode} title="Share this document">
          <img src={qrCodeUrl} alt="QR" class="url-qr-img" />
        </button>
      {/if}

      <!-- Document header - always LTR for simplicity -->
      <header class="doc-header" dir="ltr">
        <!-- URL-style breadcrumb bar -->
        <nav class="url-breadcrumb" aria-label="Breadcrumb">
          <!-- Line 1: Domain + Path (combined on desktop, split on mobile) -->
          <div class="url-line url-line-top">
            <span class="url-domain-wrap">
              <a href="/" class="url-domain">
                <span class="domain-name">SifterSearch</span><span class="domain-tld">.com</span>
              </a>
              <span class="url-sep domain-sep">/</span>
            </span>
            <span class="url-path-wrap">
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
            </span>
          </div>

          <!-- Line 2: Current document filename -->
          <div class="url-line url-line-current">
            <span class="url-current">{document.filename || pathSlug}</span>
          </div>
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
          <!-- Only show year/encumbered if abstract exists, to reduce clutter -->
          {#if document.abstract || document.description}
            {#if document.year}
              <span class="meta-tag">{document.year}</span>
            {/if}
            {#if document.encumbered}
              <span class="meta-tag copyright">© Copyrighted</span>
            {/if}
          {/if}
        </div>

        <!-- Abstract section - only show if there's an actual abstract (not just path description) -->
        {#if document.abstract}
          <div class="doc-abstract">
            <p>{document.abstract}</p>
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
              <h2 class="paragraph-heading">{@html renderMarkdown(para.heading)}</h2>
            {/if}

            <!-- SBS Mode: Side-by-side reading translation (English on LEFT) -->
            {#if viewMode === 'sbs' && parseTranslation(para)?.reading}
              {@const trans = parseTranslation(para)}
              {@const segments = parseSegments(para)}
              <div class="bilingual-row">
                <!-- Translation (English) on LEFT -->
                <div class="translation-col" dir="ltr">
                  {#if segments}
                    <!-- Phrase-level aligned view -->
                    <div class="paragraph-text translation segmented" use:singleSpaced>
                      {#each segments as seg}
                        <span
                          class="segment-phrase"
                          class:highlighted={isSegmentHighlighted(para.paragraph_index ?? i, seg.id)}
                          data-seg-id={seg.id}
                          onmouseenter={() => highlightSegment(para.paragraph_index ?? i, seg.id)}
                          onmouseleave={() => clearHighlight(para.paragraph_index ?? i, seg.id)}
                          onclick={() => highlightSegment(para.paragraph_index ?? i, seg.id)}
                          role="button"
                          tabindex="0"
                        >{seg.translation}</span>{' '}
                      {/each}
                    </div>
                  {:else}
                    <!-- Fallback: plain translation text -->
                    <div class="paragraph-text translation" use:singleSpaced>{@html renderMarkdown(trans.reading)}</div>
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
                          class:highlighted={isSegmentHighlighted(para.paragraph_index ?? i, seg.id)}
                          data-seg-id={seg.id}
                          onmouseenter={() => highlightSegment(para.paragraph_index ?? i, seg.id)}
                          onmouseleave={() => clearHighlight(para.paragraph_index ?? i, seg.id)}
                          onclick={() => highlightSegment(para.paragraph_index ?? i, seg.id)}
                          role="button"
                          tabindex="0"
                        >{seg.original}</span>{' '}
                      {/each}
                    </div>
                  {:else}
                    <!-- Fallback: plain original text -->
                    <div class="paragraph-text">{@html renderBlockContent(para.text, para.blocktype)}</div>
                  {/if}
                </div>
              </div>

            <!-- Study Mode: Phrase-by-phrase literal translation with aligned rows -->
            {:else if viewMode === 'study' && parseTranslation(para)?.study}
              {@const trans = parseTranslation(para)}
              {@const segments = parseSegments(para)}
              {@const notes = trans.notes}
              <div class="study-container">
                <!-- Paragraph number centered above -->
                <div class="study-para-number">
                  <button
                    class="para-anchor-btn"
                    onclick={() => copyParagraphLink((para.paragraph_index ?? i) + 1)}
                    title="Copy link to paragraph {(para.paragraph_index ?? i) + 1}"
                  >
                    ¶ {(para.paragraph_index ?? i) + 1}
                  </button>
                </div>
                <!-- Phrase rows: each row has Arabic LEFT, English RIGHT -->
                {#if segments && segments.length > 0}
                  <div class="study-phrase-grid">
                    {#each segments as seg, idx}
                      {@const prevSeg = idx > 0 ? segments[idx - 1] : null}
                      {@const isContinuation = prevSeg && !/[.!?؟。]$/.test(prevSeg.translation?.trim() || '')}
                      <div class="study-phrase-row" class:continuation={isContinuation}>
                        <div class="study-phrase-original" dir={getLanguageDirection(document.language)}>
                          {seg.original}
                        </div>
                        <div class="study-phrase-translation" dir="ltr">
                          {seg.translation}
                        </div>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <!-- Fallback: plain text side by side -->
                  <div class="study-phrase-row">
                    <div class="study-phrase-original" dir={getLanguageDirection(document.language)}>
                      {@html renderBlockContent(para.text, para.blocktype)}
                    </div>
                    <div class="study-phrase-translation" dir="ltr">
                      {@html renderMarkdown(trans.study)}
                    </div>
                  </div>
                {/if}
                <!-- Notes section - full width below phrases -->
                {#if notes && Array.isArray(notes) && notes.length > 0}
                  <div class="study-notes-section">
                    <div class="study-notes-label">Notes:</div>
                    <ul class="study-notes-list">
                      {#each notes as note, idx}
                        <li class="study-note-item">
                          {#if note.term}<strong class="note-term">{note.term}</strong> — {/if}
                          {note.note || note.notes || note.explanation}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
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
                <div class="paragraph-text">{@html renderBlockContent(para.text, para.blocktype)}</div>
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
    top: 12rem; /* Below QR code corner */
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

  /* Selection text must be visible on active/colored buttons */
  .util-btn.active::selection,
  .util-btn.active *::selection,
  .util-btn.edit::selection,
  .util-btn.edit *::selection,
  .util-btn.translate::selection,
  .util-btn.translate *::selection,
  .util-btn.copied::selection,
  .util-btn.copied *::selection {
    background: rgba(0, 0, 0, 0.3);
    color: white;
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

  /* Translation complete state */
  .util-btn.translate.complete {
    background: #f0fdf4;
    border-color: #10b981;
    cursor: default;
    flex-direction: column;
    gap: 0;
  }

  .progress-ring-progress.complete {
    stroke: #10b981;
  }

  .progress-ring-progress.partial {
    stroke: #f59e0b;
  }

  .util-btn.translate.partial {
    background: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
    cursor: pointer;
  }

  .util-btn.translate.partial:hover {
    background: #fde68a;
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

  .menu-item.active::selection,
  .menu-item.active *::selection {
    background: rgba(0, 0, 0, 0.3);
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

  .menu-item.progress-item.complete {
    color: #10b981;
    background: #f0fdf4;
  }

  .menu-item.progress-item.partial {
    color: #92400e;
    background: #fef3c7;
    cursor: pointer;
  }

  .menu-item.progress-item.partial:hover {
    background: #fde68a;
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

  .mode-btn.active .mode-label {
    color: white;
  }

  .mode-btn.active::selection,
  .mode-btn.active *::selection {
    background: rgba(0, 0, 0, 0.3);
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
  }

  /* URL-style breadcrumb bar - 2 lines on desktop, 3 on mobile */
  .url-breadcrumb {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.8125rem;
    margin-bottom: 1.25rem;
    position: relative;
    text-align: center;
  }

  .url-line {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  /* Top line: domain + path together on desktop */
  .url-line-top {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .url-domain-wrap,
  .url-path-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  /* Current document filename on its own line */
  .url-line-current {
    display: flex;
  }

  /* Corner icons - positioned at document box corners with 5px overlap */
  .corner-icon {
    position: absolute;
    z-index: 10;
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

  .corner-left {
    /* Position at top-left corner with 10% overlap (~0.5rem of 5rem icon) */
    left: -0.5rem;
    top: -0.5rem;
  }

  .corner-right {
    /* Position at top-right corner with 10% overlap (~0.5rem of 5rem icon) */
    right: -0.5rem;
    top: -0.5rem;
  }

  .corner-icon:hover {
    border-color: #14b8a6;
    box-shadow: 0 2px 8px rgba(20, 184, 166, 0.2);
  }

  .url-icon {
    width: 4.5rem;
    height: 4.5rem;
    opacity: 0.85;
    transition: opacity 0.2s;
    border-radius: 0.25rem;
  }

  .corner-icon:hover .url-icon {
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

  .url-domain {
    font-size: 1.25rem;
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

  /* Extra spacing after domain before Library */
  .url-sep.domain-sep {
    margin-left: 0.5rem;
    margin-right: 0.375rem;
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

  .url-qr-img {
    width: 4rem;
    height: 4rem;
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
  /* Same width for all modes (BASE, SBS, Study) - centered */
  .document-content {
    position: relative; /* For corner icon positioning */
    max-width: 900px;
    margin: 2rem auto;
    padding: 2rem 2.5rem 4rem 2.5rem;
    background: #faf8f3;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 0.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    font-family: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
    /* Explicit light colors - not affected by dark mode */
    color: #1a1a1a;
    /* Allow corner icons to overflow */
    overflow: visible;
  }

  .document-content.bilingual {
    /* Same width as base - minimal padding to maximize reading area */
    padding: 1.5rem 0.5rem 3rem 0.5rem;
  }

  /* On narrow screens, allow content to use available space */
  @media (max-width: 850px) {
    .document-content {
      max-width: calc(100% - 2rem);
      margin-left: 1rem;
      margin-right: 1rem;
    }
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
    flex-wrap: wrap;
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

  /* Removed paragraph hover background - not helpful */

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
    width: 100%;
    font-size: 1.25rem;
    font-weight: 600;
    color: #1a1a1a;
    margin: 1rem 0 0.5rem 0;
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

  /* Block-level headings within paragraphs */
  .paragraph-text :global(h1),
  .paragraph-text :global(h2),
  .paragraph-text :global(h3),
  .paragraph-text :global(h4) {
    font-weight: 600;
    margin: 0;
    line-height: 1.4;
  }

  .paragraph-text :global(h1) {
    font-size: 1.5rem;
    color: var(--text-primary);
  }

  .paragraph-text :global(h2) {
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .paragraph-text :global(h3) {
    font-size: 1.1rem;
    color: var(--text-secondary);
  }

  .paragraph-text :global(h4) {
    font-size: 1rem;
    color: var(--text-secondary);
    font-style: italic;
  }

  .paragraph-text :global(blockquote) {
    border-left: 3px solid var(--border);
    padding-left: 1rem;
    margin: 0;
    font-style: italic;
    color: var(--text-secondary);
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
    padding-right: 0;
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
    line-height: 1;
  }

  .translation-col {
    padding-left: 0;
    line-height: 1.25 !important;
    /* English translation - explicit LTR with left alignment */
    direction: ltr;
    text-align: left;
  }

  .translation-col .paragraph-text {
    color: #333;
    font-style: normal;
    /* English: 1.1rem font with comfortable line spacing */
    font-size: 1.1rem !important;
    line-height: 1.25 !important;
    direction: ltr;
    unicode-bidi: normal;
  }

  .translation-col .paragraph-text :global(*) {
    line-height: 1.25 !important;
    direction: ltr;
  }

  .translation-col .paragraph-text :global(p) {
    margin: 0 0 0.5rem 0;
    line-height: 1.25 !important;
  }

  .translation-col .paragraph-text :global(p:last-child) {
    margin-bottom: 0;
  }

  /* Phrase-level segment highlighting */
  .paragraph-text.segmented {
    display: inline;
  }

  .segment-phrase {
    cursor: pointer;
    transition: background 0.15s ease;
    display: inline;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }

  .segment-phrase:hover {
    /* Highlighter pen effect - only covers middle 70% to prevent line overlap */
    background: linear-gradient(to bottom, transparent 20%, rgba(59, 130, 246, 0.2) 20%, rgba(59, 130, 246, 0.2) 80%, transparent 80%);
  }

  .segment-phrase.highlighted {
    /* Highlighter pen effect - only covers middle 70% to prevent line overlap */
    background: linear-gradient(to bottom, transparent 20%, rgba(59, 130, 246, 0.2) 20%, rgba(59, 130, 246, 0.2) 80%, transparent 80%);
    color: #1a1a1a;
  }

  /* RTL segment styling */
  .original-col[dir="rtl"] .segment-phrase {
    unicode-bidi: isolate;
  }

  /* Ensure LTR direction for translation segments */
  .translation-col .segment-phrase {
    direction: ltr;
    unicode-bidi: isolate;
  }

  /* Focus styles for keyboard navigation */
  .segment-phrase:focus {
    outline: none;
    background: linear-gradient(to bottom, transparent 20%, rgba(59, 130, 246, 0.3) 20%, rgba(59, 130, 246, 0.3) 80%, transparent 80%);
  }

  /* Touch-friendly tap targets on mobile */
  @media (pointer: coarse) {
    .segment-phrase {
      padding: 0 0.15em;
      margin: 0;
    }
  }

  /* Study mode layout - new aligned row structure */
  .study-paragraph-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }

  .study-para-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .study-para-header .para-anchor-btn {
    font-size: 0.75rem;
    color: #888;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
  }

  .study-para-header .para-anchor-btn:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #666;
  }

  /* Study container - full width for paragraph */
  .study-container {
    flex: 1;
    min-width: 0;
  }

  /* Paragraph number centered above phrases */
  .study-para-number {
    text-align: center;
    padding: 0.5rem 0;
    margin-bottom: 0.25rem;
  }

  .study-para-number .para-anchor-btn {
    font-family: 'Libre Caslon Text', Georgia, serif;
    font-size: 0.75rem;
    color: #999;
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.2s;
  }

  .study-para-number .para-anchor-btn:hover {
    color: #666;
  }

  /* Phrase grid - container for aligned rows */
  .study-phrase-grid {
    display: flex;
    flex-direction: column;
  }

  /* Each phrase row: 2-column grid with Arabic LEFT, English RIGHT */
  .study-phrase-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    direction: ltr; /* Force LTR grid layout */
    align-items: baseline; /* Align first line baselines */
  }

  .study-phrase-row:last-child {
    border-bottom: none;
  }

  /* Continuation phrases - indent English column from left */
  .study-phrase-row.continuation .study-phrase-translation {
    margin-left: 1.5rem;
  }

  /* Arabic column in continuation rows - indent from right side */
  .study-phrase-row.continuation .study-phrase-original {
    padding-right: 1.5rem;
  }

  /* Arabic original - LEFT column, right-aligned text */
  .study-phrase-original {
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1.4rem;
    line-height: 1.7;
    color: #1a1a1a;
    text-align: right;
  }

  /* English translation - RIGHT column, left-aligned text */
  .study-phrase-translation {
    font-family: 'Libre Caslon Text', Georgia, serif;
    font-size: 1.05rem;
    line-height: 1.6;
    color: #333;
    text-align: left;
  }

  /* Study notes section - full width below paragraph */
  .study-notes-section {
    margin-top: 0.75rem;
    padding: 0.75rem 1rem;
    background: #f8f6f1;
    border-radius: 0.375rem;
    border-left: 3px solid #c9b99a;
  }

  .study-notes-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #888;
    margin-bottom: 0.5rem;
  }

  .study-notes-list {
    margin: 0;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .study-note-item {
    font-size: 0.875rem;
    line-height: 1.5;
    color: #555;
  }

  .study-note-item .note-term {
    color: #333;
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1rem;
  }

  /* Study mode document styling */
  .document-content.study-mode {
    /* Same width as other modes - uses base max-width */
  }

  /* Legacy study phrase styles (for compatibility) */
  .study-phrase-list {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .study-phrase-block {
    display: block;
    padding: 0.375rem 0.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: background-color 0.15s ease;
    border-left: 2px solid transparent;
  }

  .study-phrase-block:hover,
  .study-phrase-block.highlighted {
    background: rgba(139, 115, 85, 0.08);
    border-left-color: #8b7355;
  }

  .study-phrase-block:focus {
    outline: 2px solid rgba(139, 115, 85, 0.3);
    outline-offset: 1px;
  }

  .study-phrase-text {
    display: block;
    font-family: 'Libre Caslon Text', Georgia, serif;
    font-size: 1.1rem;
    line-height: 1.25;
    color: #1a1a1a;
    direction: ltr;
    text-align: left;
    unicode-bidi: isolate;
  }

  .study-phrase-block.original-phrase .study-phrase-text {
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1.125rem;
    line-height: 1.8;
  }

  .study-phrase-note {
    display: block;
    margin-top: 0.25rem;
    padding-left: 1rem;
    font-size: 0.75rem;
    line-height: 1.4;
    color: #666;
    font-style: italic;
    border-left: 2px solid #ddd;
  }

  /* Paragraph footnotes - terminology notes at end of paragraph */
  .paragraph-footnotes {
    margin-top: 0.75rem;
    padding: 0.75rem 1rem;
    background: #f8f6f1;
    border-radius: 0.375rem;
    border-left: 3px solid #c9b99a;
  }

  .footnote-item {
    margin: 0 0 0.5rem 0;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: #555;
  }

  .footnote-item:last-child {
    margin-bottom: 0;
  }

  .footnote-number {
    font-weight: 600;
    color: #8b7355;
    margin-right: 0.375rem;
  }

  .footnote-text {
    color: #555;
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

  /* Responsive - collapse buttons to hamburger menu when viewport < 900px */
  /* This prevents overlap with 775px content area + utility bar */
  @media (max-width: 900px) {
    .utility-bar {
      top: 12rem; /* Move down to avoid QR code in corner */
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
  }

  /* Narrower screens - adjust content margins */
  @media (max-width: 768px) {
    .document-content {
      /* Minimal right margin - only back + hamburger buttons on mobile */
      /* Keep tiny left margin visible for visual separation from edge */
      margin: 1rem 0.5rem 1rem 0.75rem;
      padding: 1.5rem 1rem 3rem 1rem;
    }

    /* URL breadcrumb adjustments for mobile - 3 stacked lines */
    .url-breadcrumb {
      font-size: 0.6875rem;
      gap: 0.125rem;
    }

    /* Split domain and path onto separate lines on mobile */
    .url-line-top {
      flex-direction: column;
      gap: 0.125rem;
    }

    .url-domain-wrap,
    .url-path-wrap {
      justify-content: center;
    }

    .url-domain {
      font-size: 1rem;
    }

    /* Corner icons on mobile - smaller with slight overlap */
    .corner-left {
      left: -0.25rem;
      top: -0.25rem;
    }

    .corner-right {
      right: -0.25rem;
      top: -0.25rem;
    }

    .url-icon {
      width: 2rem;
      height: 2rem;
    }

    .url-qr-img {
      width: 2.5rem;
      height: 2.5rem;
    }

    .doc-abstract {
      padding: 1rem;
    }

    .para-anchor {
      width: 1.5rem;
      font-size: 0.625rem;
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

    /* Study phrase blocks mobile */
    .study-phrase-block {
      padding: 0.5rem;
    }

    .study-phrase-note {
      font-size: 0.7rem;
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

    /* Corner icons in print - position at corners, keep large */
    .corner-icon {
      position: absolute;
      padding: 0;
    }

    .corner-left {
      left: 0;
      top: 0;
    }

    .corner-right {
      right: 0;
      top: 0;
    }

    .url-icon {
      width: 4rem;
      height: 4rem;
    }

    .url-qr-img {
      width: 4rem;
      height: 4rem;
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

    /* Study phrase blocks in print */
    .study-phrase-block {
      padding: 0.25rem 0;
      border-left: none;
    }

    .study-phrase-block:hover,
    .study-phrase-block.highlighted {
      background: transparent;
      border-left: none;
    }

    .study-phrase-text {
      font-size: 10pt;
    }

    .study-phrase-block.original-phrase .study-phrase-text {
      font-size: 11pt;
    }

    .study-phrase-note {
      font-size: 8pt;
      color: #555;
      border-left-color: #ccc;
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

    /* Study view print styles */
    .study-container {
      page-break-inside: avoid;
    }

    .study-phrase-row {
      page-break-inside: avoid;
      padding: 0.25rem 0.5rem;
    }

    .study-phrase-grid {
      page-break-before: auto; /* Don't force page break before phrases */
    }

    .study-para-number {
      padding: 0.25rem 0;
      margin-bottom: 0;
    }
  }
</style>
