<script>
  import { onMount, tick } from 'svelte';
  import { marked } from 'marked';
  import { search, session, documents } from '../lib/api.js';
  import { initAuth, logout, getAuthState } from '../lib/auth.svelte.js';
  import { initPWA, performUpdate, getPWAState } from '../lib/pwa.svelte.js';
  import { setThinking } from '../lib/stores/thinking.svelte.js';
  import changelog from '../lib/changelog.json';
  import AuthModal from './AuthModal.svelte';
  import ThemeToggle from './ThemeToggle.svelte';

  // Configure marked for inline parsing (no <p> tags wrapping)
  marked.use({
    renderer: {
      paragraph(token) {
        // Parse inline tokens (links, bold, italic) but skip the <p> wrapper
        return this.parser.parseInline(token.tokens);
      }
    },
    breaks: false,
    gfm: true
  });

  // App version - injected at build time, formatted as v.0.x (drops leading 0.)
  const APP_VERSION = import.meta.env.PUBLIC_APP_VERSION || '0.0.1';
  const SHORT_VERSION = APP_VERSION.replace(/^0\./, '');

  // PWA update state
  const pwa = getPWAState();

  let messages = $state([]);
  let input = $state('');
  let loading = $state(false);
  let showAuthModal = $state(false);
  let showAbout = $state(false);
  let showMobileMenu = $state(false);
  let libraryStats = $state(null);
  let statsLoading = $state(true);
  let expandedResults = $state({}); // Track which results are expanded
  let inputEl;
  let messagesAreaEl;

  // Fullscreen reader state
  let readerOpen = $state(false);
  let readerDocument = $state(null);
  let readerParagraphs = $state([]);
  let readerLoading = $state(false);
  let readerCurrentIndex = $state(0);
  let readerContainerEl;
  let readerHighlightedText = $state(''); // Store the hit's highlighted text for the current paragraph
  let readerAnimating = $state(false); // For smooth open animation

  // Research plan state - shows the researcher agent's strategy
  let researchPlan = $state(null);

  // Preloaded document cache: Map<document_id, { segments: [], total: number }>
  const documentCache = new Map();

  // Derived reader navigation state
  let readerArrayIndex = $derived(readerParagraphs.findIndex(p => p.paragraph_index === readerCurrentIndex));
  let readerCanGoPrev = $derived(readerArrayIndex > 0);
  let readerCanGoNext = $derived(readerArrayIndex >= 0 && readerArrayIndex < readerParagraphs.length - 1);

  // Extract source URL from first few paragraphs (many docs have links to bahai-library.com, oceanoflights.org, etc.)
  let readerSourceUrl = $derived.by(() => {
    if (!readerParagraphs.length) return null;
    // Check first 5 paragraphs for a source URL
    for (let i = 0; i < Math.min(5, readerParagraphs.length); i++) {
      const text = readerParagraphs[i]?.text || '';
      // Look for common source domains
      const match = text.match(/https?:\/\/(?:bahai-library\.com|oceanoflights\.org|oceanlibrary\.com|reference\.bahai\.org)[^\s\)"\]<]*/i);
      if (match) return match[0];
    }
    return null;
  });

  // Search suggestion examples - randomly select 3 on each page load
  const ALL_SUGGESTIONS = [
    // Soul & Afterlife
    'What is the nature of the soul?',
    'What happens after death?',
    'Is the soul immortal?',
    'What is the purpose of life?',
    // Comparative
    'Compare creation stories across religions',
    'How do religions view suffering?',
    'What do scriptures say about forgiveness?',
    'Compare teachings on love',
    // Virtues & Ethics
    'Teachings on compassion',
    'What is true humility?',
    'How to overcome anger?',
    'Guidance on honesty and truthfulness',
    'What is justice?',
    // Prayer & Worship
    'How should one pray?',
    'What is the purpose of fasting?',
    'Importance of meditation',
    'How to draw closer to God?',
    // Social teachings
    'Teachings on marriage and family',
    'How to achieve peace?',
    'What is the role of service?',
    'Guidance on wealth and poverty',
    // Knowledge & Truth
    'What is the source of knowledge?',
    'How to recognize truth?',
    'Relationship between science and religion',
    'What is wisdom?',
    // Unity & Oneness
    'Teachings on unity of humanity',
    'What does oneness mean?',
    'How to overcome prejudice?',
    // Spiritual Growth
    'How to develop spiritually?',
    'What are spiritual tests?',
    'Purpose of trials and difficulties',
    'How to find inner peace?'
  ];

  // Randomly select 3 suggestions
  function getRandomSuggestions(count = 3) {
    const shuffled = [...ALL_SUGGESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
  const displayedSuggestions = getRandomSuggestions(3);

  // Typewriter loading messages
  const LOADING_MESSAGES = [
    'Searching...',
    'Thinking...',
    'Researching...',
    'Cogitating...',
    'Considering...',
    'Pondering...',
    'Reflecting...',
    'Exploring...',
    'Sifting...',
    'Analyzing...',
    'Consulting...',
    'Examining...',
    'Investigating...',
    'Inquiring...',
    'Perusing...',
    'Studying...',
    'Delving...',
    'Contemplating...',
    'Gathering...',
    'Processing...'
  ];
  let typewriterText = $state('');
  let typewriterInterval = $state(null);
  let typewriterPhase = $state('typing'); // 'typing', 'waiting', 'untyping'

  function startTypewriter() {
    if (typewriterInterval) return;

    let currentMessage = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
    let charIndex = 0;
    typewriterPhase = 'typing';
    typewriterText = '';

    typewriterInterval = setInterval(() => {
      if (typewriterPhase === 'typing') {
        if (charIndex < currentMessage.length) {
          typewriterText = currentMessage.substring(0, charIndex + 1);
          charIndex++;
        } else {
          typewriterPhase = 'waiting';
          setTimeout(() => {
            typewriterPhase = 'untyping';
          }, 800); // Wait 800ms before untyping
        }
      } else if (typewriterPhase === 'untyping') {
        if (charIndex > 0) {
          charIndex--;
          typewriterText = currentMessage.substring(0, charIndex);
        } else {
          // Pick new random message
          currentMessage = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
          typewriterPhase = 'typing';
        }
      }
    }, 50); // 50ms per character
  }

  function stopTypewriter() {
    if (typewriterInterval) {
      clearInterval(typewriterInterval);
      typewriterInterval = null;
    }
    typewriterText = '';
    typewriterPhase = 'typing';
  }

  // Clear search and return to library summary
  function clearSearch() {
    input = '';
    messages = [];
    inputEl?.focus();
  }

  // Close mobile menu
  function closeMobileMenu() {
    showMobileMenu = false;
  }

  const auth = getAuthState();

  // Library connection status
  let libraryConnected = $derived(!statsLoading && libraryStats !== null);

  let retryInterval = $state(null);
  let refreshInterval = $state(null);
  const RETRY_DELAY = 10000; // 10 seconds
  const REFRESH_INTERVAL = 30000; // 30 seconds - check for index updates

  async function loadLibraryStats(silent = false) {
    if (!silent) statsLoading = true;
    try {
      const stats = await search.stats();

      // Check if stats actually changed (compare lastUpdated or counts)
      const hasChanged = !libraryStats ||
        libraryStats.lastUpdated !== stats.lastUpdated ||
        libraryStats.totalDocuments !== stats.totalDocuments ||
        libraryStats.totalPassages !== stats.totalPassages;

      if (hasChanged) {
        libraryStats = stats;
        if (silent) console.log('[Library] Stats updated:', stats.totalDocuments, 'docs,', stats.totalPassages, 'passages');
      }

      // Connected - stop retry polling if running
      if (retryInterval) {
        clearInterval(retryInterval);
        retryInterval = null;
      }

      // Start refresh polling to detect index updates
      startRefreshPolling();
    } catch (err) {
      console.error('Failed to load library stats:', err);
      if (!silent) libraryStats = null;
      // Start retry polling if not already
      startRetryPolling();
      // Stop refresh polling on disconnect
      stopRefreshPolling();
    } finally {
      if (!silent) statsLoading = false;
    }
  }

  function startRetryPolling() {
    if (retryInterval) return; // Already polling
    console.log('[Library] Starting connection retry polling...');
    retryInterval = setInterval(() => {
      console.log('[Library] Retrying connection...');
      loadLibraryStats();
    }, RETRY_DELAY);
  }

  function stopRetryPolling() {
    if (retryInterval) {
      clearInterval(retryInterval);
      retryInterval = null;
    }
  }

  function startRefreshPolling() {
    if (refreshInterval) return; // Already polling
    refreshInterval = setInterval(() => {
      // Only refresh if page is visible
      if (!document.hidden) {
        loadLibraryStats(true); // silent refresh
      }
    }, REFRESH_INTERVAL);
  }

  function stopRefreshPolling() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  // ============================================
  // Full-screen Reader Functions
  // ============================================

  /**
   * Preload document segments for search results (called when sources arrive)
   * Loads a window of paragraphs around each hit for instant reader display
   */
  async function preloadDocuments(sources) {
    for (const source of sources) {
      if (!source.document_id || documentCache.has(source.document_id)) continue;

      // Start preloading in background (don't await - fire and forget)
      documents.getSegments(source.document_id, { limit: 500 })
        .then(response => {
          documentCache.set(source.document_id, {
            segments: response.segments || [],
            total: response.total || 0
          });
        })
        .catch(err => {
          console.warn('Failed to preload document:', source.document_id, err);
        });
    }
  }

  /**
   * Open the full-screen reader for a document
   * Uses preloaded cache if available for instant display
   * @param {Object} result - The search result containing document_id, paragraph_index, title, author, etc.
   */
  async function openReader(result) {
    if (!result.document_id) {
      console.error('No document_id available for reading');
      return;
    }

    const targetIndex = result.paragraph_index || 0;

    // Check cache first - if preloaded, open instantly without loading state
    const cached = documentCache.get(result.document_id);
    if (cached && cached.segments.length > 0) {
      // Set up data first (reader not visible yet)
      readerDocument = {
        id: result.document_id,
        title: result.title,
        author: result.author,
        religion: result.religion,
        collection: result.collection
      };
      readerCurrentIndex = targetIndex;
      readerHighlightedText = result.highlightedText || result.text || '';
      readerParagraphs = cached.segments;
      readerLoading = false;

      // Open reader but keep content invisible until scroll positioned
      readerOpen = true;
      readerAnimating = true;

      // Wait for DOM, position scroll BEFORE content becomes visible
      await tick();
      if (readerContainerEl) {
        // Disable smooth scroll for instant positioning
        readerContainerEl.style.scrollBehavior = 'auto';

        const paragraphEl = readerContainerEl.querySelector(`[data-paragraph-index="${targetIndex}"]`);
        if (paragraphEl) {
          const containerHeight = readerContainerEl.clientHeight;
          const paragraphTop = paragraphEl.offsetTop;
          const paragraphHeight = paragraphEl.offsetHeight;
          const scrollTop = paragraphTop - (containerHeight / 2) + (paragraphHeight / 2);
          readerContainerEl.scrollTop = Math.max(0, scrollTop);
        }

        // Re-enable smooth scroll for user navigation
        readerContainerEl.style.scrollBehavior = 'smooth';
      }

      // End animation after CSS transition
      setTimeout(() => { readerAnimating = false; }, 400);
      return;
    }

    // Fallback: not cached yet, show loading and fetch
    readerAnimating = true;
    readerLoading = true;
    readerOpen = true;
    readerDocument = {
      id: result.document_id,
      title: result.title,
      author: result.author,
      religion: result.religion,
      collection: result.collection
    };
    readerCurrentIndex = targetIndex;
    readerHighlightedText = result.highlightedText || result.text || '';
    readerParagraphs = [];

    setTimeout(() => { readerAnimating = false; }, 400);

    try {
      const response = await documents.getSegments(result.document_id, { limit: 500 });
      readerParagraphs = response.segments || [];

      // Cache for future use
      documentCache.set(result.document_id, {
        segments: response.segments || [],
        total: response.total || 0
      });

      // Position scroll so current paragraph is centered (no animation)
      await tick();
      if (readerContainerEl) {
        readerContainerEl.style.scrollBehavior = 'auto';
        const paragraphEl = readerContainerEl.querySelector(`[data-paragraph-index="${targetIndex}"]`);
        if (paragraphEl) {
          const containerHeight = readerContainerEl.clientHeight;
          const paragraphTop = paragraphEl.offsetTop;
          const paragraphHeight = paragraphEl.offsetHeight;
          const scrollTop = paragraphTop - (containerHeight / 2) + (paragraphHeight / 2);
          readerContainerEl.scrollTop = Math.max(0, scrollTop);
        }
        readerContainerEl.style.scrollBehavior = 'smooth';
      }
    } catch (err) {
      console.error('Failed to load document segments:', err);
      readerParagraphs = [];
    } finally {
      readerLoading = false;
    }
  }

  /**
   * Close the full-screen reader
   */
  function closeReader() {
    readerOpen = false;
    readerDocument = null;
    readerParagraphs = [];
    readerCurrentIndex = 0;
  }

  /**
   * Scroll to a specific paragraph in the reader
   */
  function scrollToReaderParagraph(index) {
    const paragraphEl = readerContainerEl?.querySelector(`[data-paragraph-index="${index}"]`);
    if (paragraphEl) {
      paragraphEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * Handle keyboard navigation in reader
   */
  function handleReaderKeydown(event) {
    if (!readerOpen) return;

    if (event.key === 'Escape') {
      closeReader();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const currentArrayIndex = readerParagraphs.findIndex(p => p.paragraph_index === readerCurrentIndex);
      if (currentArrayIndex > 0) {
        readerCurrentIndex = readerParagraphs[currentArrayIndex - 1].paragraph_index;
        scrollToReaderParagraph(readerCurrentIndex);
      }
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      const currentArrayIndex = readerParagraphs.findIndex(p => p.paragraph_index === readerCurrentIndex);
      if (currentArrayIndex < readerParagraphs.length - 1 && currentArrayIndex >= 0) {
        readerCurrentIndex = readerParagraphs[currentArrayIndex + 1].paragraph_index;
        scrollToReaderParagraph(readerCurrentIndex);
      }
    }
  }

  // ============================================
  // Scroll to user's message at top of view
  async function scrollToLatestUserMessage() {
    await tick(); // Wait for DOM update
    const messageRows = messagesAreaEl?.querySelectorAll('.message-row.user');
    if (messageRows && messageRows.length > 0) {
      const lastUserMessage = messageRows[messageRows.length - 1];
      lastUserMessage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    input = '';
    const messageId = Date.now();

    // Clear previous research plan
    researchPlan = null;

    messages = [...messages, { id: `user-${messageId}`, role: 'user', content: userMessage }];
    loading = true;
    setThinking(true); // Trigger neural activity animation
    startTypewriter(); // Start typewriter loading animation

    // Scroll to user message
    scrollToLatestUserMessage();

    try {
      // Add placeholder message for streaming
      const assistantMsgIndex = messages.length;
      messages = [...messages, {
        id: messageId,
        role: 'assistant',
        content: '',
        results: [],
        isAnalysis: true,
        isStreaming: true
      }];

      // Use streaming endpoint
      let streamedContent = '';
      let sources = [];

      for await (const event of search.analyzeStream(userMessage)) {
        if (event.type === 'plan') {
          // Store the research plan for display
          researchPlan = event.plan;
        } else if (event.type === 'sources') {
          sources = event.sources || [];
          stopTypewriter(); // Stop typewriter when sources arrive
          // Preload documents for instant reader access
          preloadDocuments(sources);
          // Update message with sources
          messages = messages.map((m, i) =>
            i === assistantMsgIndex
              ? { ...m, results: sources }
              : m
          );
        } else if (event.type === 'chunk') {
          stopTypewriter(); // Stop typewriter when streaming starts
          streamedContent += event.text;
          // Update message content progressively
          messages = messages.map((m, i) =>
            i === assistantMsgIndex
              ? { ...m, content: streamedContent }
              : m
          );
        } else if (event.type === 'complete') {
          // Mark streaming complete
          messages = messages.map((m, i) =>
            i === assistantMsgIndex
              ? { ...m, isStreaming: false, content: streamedContent || 'Search completed.' }
              : m
          );
        } else if (event.type === 'error') {
          messages = messages.map((m, i) =>
            i === assistantMsgIndex
              ? { ...m, isStreaming: false, content: event.message || 'AI analysis unavailable.', error: true }
              : m
          );
        }
      }

      // Ensure streaming is marked complete
      messages = messages.map((m, i) =>
        i === assistantMsgIndex
          ? { ...m, isStreaming: false }
          : m
      );

    } catch (err) {
      console.error('Search error:', err?.message || err, err?.stack);
      // Provide a more specific error message based on error type
      let errorMessage = 'An error occurred. Please try again.';
      if (err?.message === 'Stream request failed') {
        errorMessage = 'Could not reach the server. Please try again.';
      } else if (err?.name === 'TypeError' && err?.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection.';
      }
      // Only add error message if we haven't already shown content
      const hasContent = messages.some(m => m.id === messageId && m.content);
      if (!hasContent) {
        messages = [...messages, {
          role: 'assistant',
          content: errorMessage,
          error: true
        }];
      }
    } finally {
      loading = false;
      setThinking(false); // Stop neural activity animation
      stopTypewriter(); // Ensure typewriter is stopped
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num?.toLocaleString() || '0';
  }

  function toggleResult(messageId, resultIndex) {
    const key = `${messageId}-${resultIndex}`;
    const currentState = isExpanded(messageId, resultIndex);

    // Accordion behavior: only one hit can be open at a time
    // Start fresh - explicitly close everything
    const newState = {};

    // Copy all existing keys as false
    Object.keys(expandedResults).forEach(k => {
      newState[k] = false;
    });

    // Also explicitly close the first item of this message (which might be expanded by default)
    const firstKey = `${messageId}-0`;
    newState[firstKey] = false;

    // Toggle the clicked one (if closing, just close; if opening, set to true)
    newState[key] = !currentState;
    expandedResults = newState;
  }

  function isExpanded(messageId, resultIndex) {
    const key = `${messageId}-${resultIndex}`;
    // If we have an explicit state, use it
    if (expandedResults[key] !== undefined) {
      return expandedResults[key];
    }
    // First result expanded by default only if no explicit state set anywhere
    return Object.keys(expandedResults).length === 0 && resultIndex === 0;
  }

  // Format text using marked for markdown, preserving HTML tags from analyzer
  function formatText(text) {
    if (!text) return '';

    // First, clean any HTML tags that might be inside URLs (from Meilisearch highlighting)
    let result = text.replace(
      /https?:\/\/[^\s<]*(?:<\/?(?:em|mark|b|strong)>[^\s<]*)+/gi,
      (match) => match.replace(/<\/?(?:em|mark|b|strong)>/gi, '')
    );

    // Parse with marked (handles links, bold, italic, etc.)
    result = marked.parse(result);

    // Make all links open in new tab
    result = result.replace(/<a href="/g, '<a target="_blank" rel="noopener noreferrer" class="text-link" href="');

    return result;
  }

  async function initSession() {
    try {
      const sessionData = await session.init();
      // If new session with intro message from Sifter, add it to messages
      if (sessionData.isNew && sessionData.intro) {
        messages = [sessionData.intro];
      }
    } catch (err) {
      console.error('Failed to init session:', err);
      // Non-blocking - app works without session intro
    }
  }

  onMount(() => {
    initAuth();
    initPWA();
    loadLibraryStats();
    initSession();
    inputEl?.focus();

    // Cleanup on unmount
    return () => {
      stopRetryPolling();
      stopRefreshPolling();
    };
  });
</script>

<AuthModal bind:isOpen={showAuthModal} />

<!-- Full-screen Reading Modal -->
{#if readerOpen}
  <div
    class="reader-overlay {readerAnimating ? 'animating' : ''}"
    role="dialog"
    aria-modal="true"
    aria-label="Full document reader"
    onkeydown={handleReaderKeydown}
  >
    <div class="reader-modal">
      <!-- Reader Header - Book Style -->
      <header class="reader-header">
        <div class="reader-book-header">
          <!-- Religion symbol/badge -->
          <div class="reader-religion-badge">
            {#if readerDocument?.religion === "Baha'i" || readerDocument?.religion === "Baháʼí"}
              <svg viewBox="0 0 100 100" class="religion-icon">
                <polygon points="50,5 61,35 95,35 68,55 79,90 50,70 21,90 32,55 5,35 39,35" fill="currentColor" opacity="0.15"/>
                <text x="50" y="58" text-anchor="middle" font-size="24" fill="currentColor">✦</text>
              </svg>
            {:else if readerDocument?.religion === "Christianity" || readerDocument?.religion === "Christian"}
              <svg viewBox="0 0 100 100" class="religion-icon">
                <text x="50" y="60" text-anchor="middle" font-size="36" fill="currentColor">✝</text>
              </svg>
            {:else if readerDocument?.religion === "Islam" || readerDocument?.religion === "Islamic"}
              <svg viewBox="0 0 100 100" class="religion-icon">
                <text x="50" y="60" text-anchor="middle" font-size="36" fill="currentColor">☪</text>
              </svg>
            {:else if readerDocument?.religion === "Judaism" || readerDocument?.religion === "Jewish"}
              <svg viewBox="0 0 100 100" class="religion-icon">
                <text x="50" y="60" text-anchor="middle" font-size="36" fill="currentColor">✡</text>
              </svg>
            {:else if readerDocument?.religion === "Hinduism" || readerDocument?.religion === "Hindu"}
              <svg viewBox="0 0 100 100" class="religion-icon">
                <text x="50" y="60" text-anchor="middle" font-size="36" fill="currentColor">ॐ</text>
              </svg>
            {:else if readerDocument?.religion === "Buddhism" || readerDocument?.religion === "Buddhist"}
              <svg viewBox="0 0 100 100" class="religion-icon">
                <text x="50" y="60" text-anchor="middle" font-size="36" fill="currentColor">☸</text>
              </svg>
            {:else}
              <svg viewBox="0 0 100 100" class="religion-icon">
                <text x="50" y="60" text-anchor="middle" font-size="36" fill="currentColor">📖</text>
              </svg>
            {/if}
          </div>

          <!-- Book metadata -->
          <div class="reader-book-meta">
            <div class="reader-book-collection">
              {#if readerDocument?.religion}
                <span class="reader-religion-tag">{readerDocument.religion}</span>
              {/if}
              {#if readerDocument?.collection}
                <span class="reader-collection-sep">›</span>
                <span class="reader-collection-name">{readerDocument.collection}</span>
              {/if}
            </div>
            <h2 class="reader-book-title">{readerDocument?.title || 'Document'}</h2>
            {#if readerDocument?.author}
              <p class="reader-book-author">by {readerDocument.author}</p>
            {/if}
            {#if readerSourceUrl}
              <a href={readerSourceUrl} target="_blank" rel="noopener noreferrer" class="reader-source-link">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                View Source
              </a>
            {/if}
          </div>
        </div>

        <button class="reader-close-btn" onclick={closeReader} aria-label="Close reader">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <!-- Reader Content -->
      <div class="reader-content" bind:this={readerContainerEl}>
        {#if readerLoading}
          <div class="reader-loading">
            <div class="reader-loading-spinner"></div>
            <p>Loading document...</p>
          </div>
        {:else if readerParagraphs.length === 0}
          <div class="reader-empty">
            <p>No content available for this document.</p>
          </div>
        {:else}
          <div class="reader-paragraphs">
            {#each readerParagraphs as paragraph, i}
              <div
                class="reader-paragraph-wrapper {paragraph.paragraph_index === readerCurrentIndex ? 'current' : ''}"
                data-paragraph-index={paragraph.paragraph_index}
                onclick={() => { readerCurrentIndex = paragraph.paragraph_index; }}
              >
                <span class="para-num">{paragraph.paragraph_index + 1}</span>
                <p class="reader-paragraph">
                  {#if paragraph.paragraph_index === readerCurrentIndex && readerHighlightedText}
                    {@html formatText(readerHighlightedText)}
                  {:else}
                    {@html formatText(paragraph.text)}
                  {/if}
                </p>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<div class="chat-container" role="application" aria-label="SifterSearch - Interfaith Library Search">
  <!-- Skip to main content link for keyboard users -->
  <a href="#main-content" class="skip-link">Skip to main content</a>

  <!-- Header -->
  <header class="header px-3 py-2 sm:px-4 sm:py-3" role="banner">
    <div class="header-left">
      <img src="/ocean.svg" alt="SifterSearch" class="logo" />
      <span class="title" role="text">
        <span class="title-full">SifterSearch</span>
        <span class="title-short">Sifter</span>
        {#if pwa.updateAvailable}<button class="version version-update" onclick={performUpdate} title="Click to update">UPDATE</button>{:else}<span class="version">v.{SHORT_VERSION}</span>{/if}
      </span>
    </div>

    <!-- Desktop navigation -->
    <nav class="header-right desktop-nav" aria-label="Main navigation">
      <ThemeToggle />
      <button
        onclick={() => showAbout = !showAbout}
        class="nav-link"
        aria-expanded={showAbout}
        aria-controls="about-section"
      >
        About
      </button>
      {#if auth.isAuthenticated}
        <div class="auth-section">
          <span class="user-email">{auth.user?.email}</span>
          <button
            onclick={logout}
            class="btn-secondary"
          >
            Sign Out
          </button>
        </div>
      {:else}
        <button
          onclick={() => showAuthModal = true}
          class="btn-primary"
        >
          Sign In
        </button>
      {/if}
    </nav>

    <!-- Mobile navigation -->
    <div class="mobile-nav">
      {#if auth.isAuthenticated}
        <button onclick={logout} class="btn-secondary btn-small">Sign Out</button>
      {:else}
        <button onclick={() => showAuthModal = true} class="btn-primary btn-small">Sign In</button>
      {/if}
      <button
        class="hamburger-btn"
        onclick={() => showMobileMenu = !showMobileMenu}
        aria-label="Toggle menu"
        aria-expanded={showMobileMenu}
      >
        <svg class="hamburger-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {#if showMobileMenu}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          {:else}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          {/if}
        </svg>
      </button>
    </div>
  </header>

  <!-- Mobile menu dropdown -->
  {#if showMobileMenu}
    <div class="mobile-menu" role="menu">
      <ThemeToggle />
      <button
        onclick={() => { showAbout = !showAbout; closeMobileMenu(); }}
        class="mobile-menu-item"
        role="menuitem"
      >
        About
      </button>
    </div>
  {/if}

  <!-- Collapsible About Section -->
  {#if showAbout}
    <section id="about-section" class="about-section" role="region" aria-labelledby="about-title">
      <div class="about-content">
        <div class="about-header">
          <h2 id="about-title" class="about-title">About SifterSearch</h2>
          <button
            onclick={() => showAbout = false}
            aria-label="Close about section"
            class="close-btn"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p class="about-text">
          SifterSearch is a private project by Chad Jones to help organize and search the Interfaith
          supplemental library used in <a href="https://oceanlibrary.com" class="link">OceanLibrary.com</a>.
          Access is by invitation from participants and by approval only.
        </p>
        <div class="features-grid">
          <div>
            <h3 class="feature-title">Hybrid Search</h3>
            <p class="feature-desc">Combines keyword matching with semantic understanding to find relevant passages.</p>
          </div>
          <div>
            <h3 class="feature-title">Multi-Tradition Library</h3>
            <p class="feature-desc">Search across scriptures, commentaries, and scholarly works from diverse traditions.</p>
          </div>
          <div>
            <h3 class="feature-title">AI-Powered</h3>
            <p class="feature-desc">Uses OpenAI embeddings for semantic search and Meilisearch for keyword matching.</p>
          </div>
          <div>
            <h3 class="feature-title">Conversational Interface</h3>
            <p class="feature-desc">Ask questions in natural language and receive contextual responses with citations.</p>
          </div>
        </div>

        <!-- How It Works Section -->
        <div class="how-it-works">
          <h3 class="how-it-works-title">How It Works</h3>
          <div class="agents-grid">
            <div class="agent-card">
              <div class="agent-name">Hybrid Search</div>
              <p class="agent-desc">Combines keyword matching with semantic vector search to find passages even when exact words differ.</p>
            </div>
            <div class="agent-card">
              <div class="agent-name">AI Embeddings</div>
              <p class="agent-desc">OpenAI text-embedding-3-small converts text into vectors capturing meaning and context.</p>
            </div>
            <div class="agent-card">
              <div class="agent-name">Sifter Assistant</div>
              <p class="agent-desc">GPT-4 scholarly assistant introduces and contextualizes search results with citations.</p>
            </div>
            <div class="agent-card">
              <div class="agent-name">Meilisearch</div>
              <p class="agent-desc">Lightning-fast full-text search with typo tolerance, filters, and faceted navigation.</p>
            </div>
            <div class="agent-card">
              <div class="agent-name">Citation Tracking</div>
              <p class="agent-desc">Every passage linked to source document with religion, collection, author, and title metadata.</p>
            </div>
            <div class="agent-card">
              <div class="agent-name">Multi-Language</div>
              <p class="agent-desc">Indexes content across languages with language-aware search and filtering.</p>
            </div>
          </div>
        </div>

        <!-- What's New Section - Grouped by Date -->
        {#if changelog?.grouped && Object.keys(changelog.grouped).length > 0}
          <div class="whats-new">
            <h3 class="whats-new-title">What's New</h3>
            {#each Object.entries(changelog.grouped).slice(0, 3) as [date, entries]}
              <div class="changelog-date-group">
                <div class="changelog-date">{new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                <ul class="changelog-list">
                  {#each entries as entry}
                    <li class="changelog-item">
                      <span class="changelog-type changelog-type-{entry.type.toLowerCase()}">{entry.type}</span>
                      <span class="changelog-desc">{entry.description}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {/if}

  <!-- SEO content - visible to screen readers and crawlers -->
  <div class="sr-only">
    <article>
      <h1>SifterSearch - AI-Powered Interfaith Library Search</h1>
      <p>SifterSearch is a private project by Chad Jones to help organize and search the Interfaith supplemental library used in OceanLibrary.com. Access is by invitation from participants and by approval only.</p>
      <h2>Features</h2>
      <ul>
        <li>Hybrid Search: Combines keyword matching with semantic understanding to find relevant passages even when exact words differ.</li>
        <li>Multi-Tradition Library: Search across scriptures, commentaries, and scholarly works from diverse religious and philosophical traditions.</li>
        <li>Conversational Interface: Ask questions in natural language and receive contextual responses with citations from primary sources.</li>
        <li>AI-Powered Technology: Uses OpenAI embeddings for semantic search, Meilisearch for keyword matching, and AI re-ranking for relevance.</li>
      </ul>
    </article>
  </div>

  <!-- Messages area - Main content region -->
  <main id="main-content" class="messages-area p-2 gap-3 sm:p-4 sm:gap-4" bind:this={messagesAreaEl} role="main" aria-label="Search results and conversation">
    {#if messages.length === 0}
      <div class="welcome-screen">
        <img src="/ocean.svg" alt="Ocean Library" class="welcome-logo" />
        <h2 class="welcome-title">Ocean Library Agentic Research Engine</h2>
        <p class="welcome-desc">
          Use advanced AI research to locate information within thousands of books, manuscripts, papers, notes and publications across multiple languages.
        </p>

        <!-- Library Stats -->
        <div class="stats-container">
          {#if statsLoading}
            <div class="stats-loading">
              <svg class="spinner" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Loading library...</span>
            </div>
          {:else if libraryStats}
            <div class="stats-card">
              <h3 class="stats-title">Library Contents</h3>
              <!-- Row 1: Key metrics -->
              <div class="stats-grid">
                <div class="stat">
                  <span class="stat-label">Religions</span>
                  <span class="stat-value">{libraryStats.religions || 0}</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Collections</span>
                  <span class="stat-value">{libraryStats.collections || 0}</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Documents</span>
                  <span class="stat-value">{formatNumber(libraryStats.totalDocuments)}</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Paragraphs</span>
                  <span class="stat-value">{formatNumber(libraryStats.totalPassages)}</span>
                </div>
              </div>
              <!-- Religion tags with document counts -->
              {#if libraryStats.religionCounts && Object.keys(libraryStats.religionCounts).length > 0}
                <div class="religion-tags">
                  {#each Object.entries(libraryStats.religionCounts) as [religion, count]}
                    <span class="religion-tag">
                      {religion}
                      <span class="tag-count">{count}</span>
                    </span>
                  {/each}
                </div>
              {/if}
              {#if libraryStats.lastUpdated}
                <div class="stats-footer">
                  Last indexed: {new Date(libraryStats.lastUpdated).toLocaleDateString()}
                </div>
              {/if}
              {#if libraryStats.indexing}
                <div class="indexing-indicator">
                  <div class="indexing-header">
                    <svg class="indexing-dot" fill="currentColor" viewBox="0 0 8 8">
                      <circle cx="4" cy="4" r="3" />
                    </svg>
                    <span>Indexing in progress</span>
                  </div>
                  {#if libraryStats.indexingProgress}
                    <div class="indexing-progress">
                      <div class="progress-bar">
                        <div
                          class="progress-fill"
                          style="width: {libraryStats.indexingProgress.total > 0 ? Math.round((libraryStats.indexingProgress.total - libraryStats.indexingProgress.pending) / libraryStats.indexingProgress.total * 100) : 0}%"
                        ></div>
                      </div>
                      <div class="progress-text">
                        {libraryStats.indexingProgress.processing} processing, {libraryStats.indexingProgress.pending} pending
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {:else}
            <div class="stats-unavailable">
              Library Not Connected
            </div>
          {/if}
        </div>

        <div class="suggestions">
          {#each displayedSuggestions as suggestion}
            <button
              onclick={() => { input = suggestion; sendMessage(); }}
              class="suggestion-btn"
              disabled={!libraryConnected}
            >
              {suggestion}
            </button>
          {/each}
        </div>
      </div>
    {:else}
      {#each messages as message, msgIndex}
        <div class="message-row {message.role === 'user' ? 'user' : 'assistant'}">
          {#if message.role === 'user'}
            <div class="bubble bubble-user">
              <p class="message-text">{message.content}</p>
            </div>
          {:else if message.isAnalysis}
            <!-- AI Analysis result - streaming response first, then sources -->
            <div class="analysis-container">
              <!-- AI Response (shown first, at top) -->
              {#if message.content || message.isStreaming}
                <div class="analysis-content">
                  {#if message.isStreaming && !message.content}
                    <!-- Typewriter loading text when waiting for response -->
                    <p class="analysis-text typewriter-loading"><span class="typewriter-text">{typewriterText}<span class="typewriter-cursor">|</span></span></p>
                  {:else}
                    <p class="analysis-text">{message.content}{#if message.isStreaming}<span class="streaming-cursor"></span>{/if}</p>
                  {/if}
                </div>
              {/if}

              <!-- Research Plan (shows researcher agent's strategy) -->
              {#if researchPlan && message.results?.length > 0}
                <details class="research-plan">
                  <summary class="research-plan-toggle">
                    <svg class="research-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="11" cy="11" r="8"/>
                      <path d="M21 21l-4.35-4.35"/>
                    </svg>
                    Research Strategy
                    <span class="plan-type">{researchPlan.type}</span>
                  </summary>
                  <div class="research-plan-content">
                    {#if researchPlan.reasoning}
                      <p class="plan-reasoning">{researchPlan.reasoning}</p>
                    {/if}
                    {#if researchPlan.queries?.length > 0}
                      <div class="plan-queries">
                        <span class="queries-label">Queries:</span>
                        {#each researchPlan.queries as q, i}
                          <span class="query-chip" title={q.mode}>
                            {q.query}
                          </span>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </details>
              {/if}

              <!-- Sources (shown below response) -->
              {#if message.results && message.results.length > 0}
                <div class="analysis-sources">
                  <h4 class="sources-heading">Sources ({message.results.length})</h4>
                  {#each message.results as result, i}
                    {@const resultKey = `${message.id || msgIndex}-${i}`}
                    {@const expanded = expandedResults[resultKey] !== undefined ? expandedResults[resultKey] : i === 0}
                    {@const text = result._formatted?.text || result.text || ''}
                    {@const plainText = text.replace(/<[^>]*>/g, '')}
                    {@const title = result.title || 'Untitled'}
                    {@const author = result.author}
                    {@const religion = result.religion || ''}
                    {@const rawCollection = result.collection || ''}
                    {@const collection = rawCollection.includes(' > ') ? rawCollection.split(' > ')[0] : rawCollection}

                    {@const summary = result.summary || ''}
                    {@const highlightedText = result.highlightedText || text}

                    <div class="source-card {expanded ? 'expanded' : 'collapsed'}" role="article">
                      <!-- Collapsed: single line with number, AI summary (or fallback), title, expand arrow -->
                      {#if !expanded}
                        <button class="source-summary-header" onclick={() => toggleResult(message.id || msgIndex, i)}>
                          <span class="source-num">{i + 1}</span>
                          <span class="source-summary-text">{summary || (plainText.substring(0, 60) + (plainText.length > 60 ? '...' : ''))}</span>
                          <span class="source-summary-title">{title.length > 30 ? title.substring(0, 30) + '...' : title}</span>
                          <svg class="source-expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      {:else}
                        <!-- Expanded: full paper card view -->
                        <button class="source-collapse-btn px-3 py-2 sm:px-4" onclick={() => toggleResult(message.id || msgIndex, i)}>
                          <span class="source-num">{i + 1}</span>
                          <span class="source-summary-expanded">{summary || (plainText.substring(0, 80) + (plainText.length > 80 ? '...' : ''))}</span>
                          <svg class="source-expand-icon open" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        <!-- Paper-like text area with off-white background -->
                        <div class="source-paper p-3 sm:p-4 sm:px-5">
                          <span class="para-num">{result.paragraph_index != null ? result.paragraph_index + 1 : ''}</span>
                          <p class="source-text">{@html formatText(highlightedText)}</p>
                        </div>

                        <!-- Citation bar: [religion] > [collection] > [author] > [title] -->
                        <div class="citation-bar px-3 py-2 gap-2 sm:px-4 sm:gap-4">
                          <div class="citation-path">
                            {#if religion}<span class="citation-segment">{religion}</span>{/if}
                            {#if collection}<span class="citation-sep">›</span><span class="citation-segment">{collection}</span>{/if}
                            {#if author && !rawCollection.includes(author)}<span class="citation-sep">›</span><span class="citation-segment">{author}</span>{/if}
                            <span class="citation-sep">›</span><span class="citation-segment citation-title">{title}</span>
                          </div>
                          <button class="read-more-btn" onclick={(e) => { e.stopPropagation(); openReader(result); }}>
                            Read More
                          </button>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {:else if message.results && message.results.length > 0}
            <!-- Search results with collapsible cards -->
            <div class="results-container">
              <p class="results-summary">{message.content}</p>
              {#each message.results as result, i}
                {@const expanded = isExpanded(message.id || msgIndex, i)}
                {@const text = result._formatted?.text || result.text || ''}
                {@const title = result.title || 'Untitled'}
                {@const author = result.author || 'Unknown'}
                {@const collection = result.collection || result.religion || ''}
                <button
                  class="result-card {expanded ? 'expanded' : ''}"
                  onclick={() => { toggleResult(message.id || msgIndex, i); }}
                >
                  {#if expanded}
                    <!-- Expanded: full text with source below -->
                    <div class="result-expanded">
                      <p class="result-full-text">{@html formatText(text)}</p>
                      <div class="result-meta">
                        <span class="meta-title">{title}</span>
                        <span class="meta-sep">—</span>
                        <span class="meta-author">{author}</span>
                        {#if collection}<span class="meta-collection">({collection})</span>{/if}
                      </div>
                    </div>
                  {:else}
                    <!-- Collapsed: compact single row with number, excerpt, source -->
                    <span class="result-num">{i + 1}</span>
                    <span class="result-excerpt">{@html formatText(text.substring(0, 120))}{text.length > 120 ? '...' : ''}</span>
                    <span class="result-src">{title}</span>
                  {/if}
                  <svg class="result-chevron {expanded ? 'open' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              {/each}
            </div>
          {:else if message.isIntro}
            <!-- Sifter's intro message - styled as welcome -->
            <div class="intro-container">
              <div class="intro-avatar">
                <img src="/ocean.svg" alt="Sifter" class="intro-logo" />
              </div>
              <div class="intro-content">
                <p class="intro-text">{message.content}</p>
              </div>
            </div>
          {:else}
            <!-- Regular text message -->
            <div class="bubble bubble-assistant {message.error ? 'error' : ''}">
              <p class="message-text">{message.content}</p>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </main>

  <!-- Live region for screen reader announcements -->
  <div id="search-status" class="sr-only" aria-live="polite" aria-atomic="true">
    {#if loading}
      Searching...
    {:else if messages.length > 0}
      {#if messages[messages.length - 1]?.results?.length}
        Found {messages[messages.length - 1].results.length} results
      {/if}
    {/if}
  </div>

  <!-- Input area -->
  <div class="input-area" role="search">
    <!-- QR code on the left -->
    <a href="https://siftersearch.com" class="qr-link" title="SifterSearch.com" aria-label="QR code for SifterSearch.com">
      <img src="/qr-siftersearch.svg" alt="QR code for siftersearch.com" class="qr-code" />
    </a>

    <!-- Input form with search button inside -->
    <form onsubmit={(e) => { e.preventDefault(); sendMessage(); }} class="input-form" aria-label="Search form">
      <label for="search-input" class="sr-only">Search sacred texts</label>
      <div class="input-wrapper">
        <input
          id="search-input"
          bind:this={inputEl}
          bind:value={input}
          onkeydown={handleKeydown}
          placeholder="Search sacred texts..."
          disabled={loading}
          class="search-input"
          type="search"
          autocomplete="off"
          aria-describedby="search-status"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading || !libraryConnected}
          aria-label={loading ? 'Searching...' : 'Search'}
          class="submit-btn"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>
    </form>

    <!-- Clear button on the right -->
    {#if input || messages.length > 0}
      <button
        type="button"
        onclick={clearSearch}
        class="clear-btn"
        aria-label="Clear search and return to library"
        title="Clear search"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    {/if}
  </div>
</div>

<style>
  /* Container */
  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-default);
    background-color: var(--surface-0-alpha);
    backdrop-filter: blur(8px);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo {
    width: 2rem;
    height: 2rem;
    border-radius: 0.5rem;
  }

  .title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .title-full {
    display: inline;
  }

  .title-short {
    display: none;
  }

  @media (max-width: 480px) {
    .title-full {
      display: none;
    }
    .title-short {
      display: inline;
    }
  }

  .title .version {
    font-size: 0.65rem;
    font-weight: 400;
    color: var(--text-primary);
    opacity: 0.5;
    vertical-align: super;
    margin-left: 0.25rem;
  }

  .title .version-update {
    opacity: 1;
    background: var(--accent-primary);
    color: white;
    border: none;
    padding: 0.15rem 0.5rem;
    border-radius: 0.75rem;
    cursor: pointer;
    font-size: 0.65rem;
    font-weight: 500;
    animation: pulse-update 2s ease-in-out infinite;
    transition: transform 0.15s, background 0.15s;
  }

  .title .version-update:hover {
    background: var(--accent-primary-hover, #0284c7);
    transform: scale(1.05);
  }

  @keyframes pulse-update {
    0%, 100% { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.4); }
    50% { box-shadow: 0 0 0 6px rgba(14, 165, 233, 0); }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  /* Desktop nav visible on larger screens */
  .desktop-nav {
    display: none;
  }

  @media (min-width: 640px) {
    .desktop-nav {
      display: flex;
    }
  }

  /* Mobile nav visible on smaller screens */
  .mobile-nav {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  @media (min-width: 640px) {
    .mobile-nav {
      display: none;
    }
  }

  .hamburger-btn {
    padding: 0.5rem;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.375rem;
    transition: background-color 0.15s, color 0.15s;
  }
  .hamburger-btn:hover {
    background-color: var(--surface-2);
    color: var(--text-primary);
  }

  .hamburger-icon {
    width: 1.5rem;
    height: 1.5rem;
  }

  .btn-small {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
  }

  /* Mobile menu dropdown */
  .mobile-menu {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background-color: var(--surface-1);
    border-bottom: 1px solid var(--border-default);
  }

  @media (min-width: 640px) {
    .mobile-menu {
      display: none;
    }
  }

  .mobile-menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 0.9375rem;
    text-align: left;
    transition: background-color 0.15s, color 0.15s;
  }
  .mobile-menu-item:hover {
    background-color: var(--surface-2);
    color: var(--text-primary);
  }

  .nav-link {
    font-size: 0.875rem;
    color: var(--text-secondary);
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.15s;
  }
  .nav-link:hover {
    color: var(--text-primary);
  }

  .auth-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .user-email {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .btn-primary {
    font-size: 0.875rem;
    padding: 0.375rem 0.75rem;
    background-color: var(--accent-primary);
    color: var(--accent-primary-text);
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: background-color 0.15s;
  }
  .btn-primary:hover {
    background-color: var(--accent-primary-hover);
  }

  .btn-secondary {
    font-size: 0.875rem;
    padding: 0.375rem 0.75rem;
    background-color: var(--surface-2);
    color: var(--text-primary);
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: background-color 0.15s;
  }
  .btn-secondary:hover {
    background-color: var(--surface-3);
  }

  /* About Section */
  .about-section {
    border-bottom: 1px solid var(--border-default);
    background-color: var(--surface-1-alpha);
    backdrop-filter: blur(8px);
  }

  .about-content {
    max-width: 64rem;
    margin: 0 auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .about-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .about-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    color: var(--text-secondary);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
  }
  .close-btn:hover {
    color: var(--text-primary);
  }

  .about-text {
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .link {
    color: var(--accent-primary);
    text-decoration: none;
  }
  .link:hover {
    text-decoration: underline;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    font-size: 0.875rem;
  }

  @media (max-width: 640px) {
    .features-grid {
      grid-template-columns: 1fr;
    }
  }

  .feature-title {
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .feature-desc {
    color: var(--text-secondary);
  }

  /* How It Works / Agents Section */
  .how-it-works {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
  }

  .how-it-works-title {
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.75rem;
    font-size: 0.95rem;
  }

  .agents-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  @media (max-width: 768px) {
    .agents-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 480px) {
    .agents-grid {
      grid-template-columns: 1fr;
    }
  }

  .agent-card {
    background-color: var(--surface-2);
    border-radius: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--border-subtle);
  }

  .agent-name {
    font-weight: 600;
    color: var(--accent-primary);
    font-size: 0.875rem;
    margin-bottom: 0.25rem;
  }

  .agent-desc {
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.4;
    margin: 0;
  }

  /* What's New Section */
  .whats-new {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
  }

  .whats-new-title {
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.75rem;
    font-size: 0.95rem;
  }

  .changelog-date-group {
    margin-bottom: 1rem;
  }

  .changelog-date {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 0.375rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .changelog-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .changelog-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.8rem;
  }

  .changelog-type {
    flex-shrink: 0;
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .changelog-type-new {
    background: rgba(34, 197, 94, 0.2);
    color: rgb(34, 197, 94);
  }

  .changelog-type-fixed {
    background: rgba(59, 130, 246, 0.2);
    color: rgb(59, 130, 246);
  }

  .changelog-type-improved {
    background: rgba(168, 85, 247, 0.2);
    color: rgb(168, 85, 247);
  }

  .changelog-type-updated {
    background: rgba(251, 191, 36, 0.2);
    color: rgb(251, 191, 36);
  }

  .changelog-desc {
    color: var(--text-secondary);
    line-height: 1.4;
  }

  /* Messages Area */
  .messages-area {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  /* Welcome Screen */
  .welcome-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    min-height: 100%;
    text-align: center;
    padding: 0.75rem 1rem 1rem;
  }

  @media (min-width: 640px) {
    .welcome-screen {
      justify-content: center;
      padding: 1rem;
    }
  }

  .welcome-logo {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 0.75rem;
    margin-bottom: 0.75rem;
  }

  @media (min-width: 640px) {
    .welcome-logo {
      width: 5rem;
      height: 5rem;
      border-radius: 1rem;
      margin-bottom: 1.5rem;
    }
  }

  .welcome-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.375rem;
    text-shadow: 0 1px 2px light-dark(rgba(255,255,255,0.8), rgba(0,0,0,0.5));
  }

  @media (min-width: 640px) {
    .welcome-title {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
    }
  }

  .welcome-desc {
    color: var(--text-secondary);
    max-width: 28rem;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
    text-shadow:
      0 0 8px light-dark(rgba(255,255,255,0.9), rgba(0,0,0,0.8)),
      0 0 16px light-dark(rgba(255,255,255,0.7), rgba(0,0,0,0.6)),
      0 1px 3px light-dark(rgba(255,255,255,0.8), rgba(0,0,0,0.7));
  }

  @media (min-width: 640px) {
    .welcome-desc {
      margin-bottom: 1.5rem;
      font-size: 1rem;
    }
  }

  /* Stats */
  .stats-container {
    width: 100%;
    max-width: 42rem;
    margin-bottom: 1rem;
  }

  @media (min-width: 640px) {
    .stats-container {
      margin-bottom: 2rem;
    }
  }

  .stats-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .stats-card {
    background-color: light-dark(rgba(255, 255, 255, 0.35), rgba(30, 41, 59, 0.35));
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-default);
    backdrop-filter: blur(12px);
    box-shadow: 0 4px 12px light-dark(rgba(0,0,0,0.06), rgba(0,0,0,0.2));
  }

  @media (min-width: 640px) {
    .stats-card {
      padding: 1.25rem;
    }
  }

  .stats-title {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }

  @media (min-width: 640px) {
    .stats-title {
      font-size: 0.875rem;
      margin-bottom: 0.75rem;
    }
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
    text-align: center;
  }

  @media (min-width: 640px) {
    .stats-grid {
      gap: 1rem;
    }
  }

  @media (max-width: 480px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
    }
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
  }

  @media (min-width: 640px) {
    .stat {
      gap: 0.25rem;
    }
  }

  .stat-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  @media (min-width: 640px) {
    .stat-label {
      font-size: 1rem;
    }
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--accent-primary);
  }

  @media (min-width: 640px) {
    .stat-value {
      font-size: 1.75rem;
    }
  }

  .religion-tags {
    margin-top: 0.625rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-default);
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    justify-content: center;
  }

  @media (min-width: 640px) {
    .religion-tags {
      margin-top: 1rem;
      padding-top: 0.75rem;
      gap: 0.5rem;
    }
  }

  .religion-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    background-color: color-mix(in srgb, var(--accent-primary) 15%, transparent);
    border-radius: 9999px;
    font-size: 0.75rem;
    color: var(--text-primary);
    border: 1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent);
  }

  .tag-count {
    padding: 0.125rem 0.375rem;
    background-color: var(--surface-3);
    border-radius: 9999px;
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .stats-footer {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-default);
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: center;
  }

  .indexing-indicator {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-default);
    font-size: 0.75rem;
    color: var(--warning);
  }

  .indexing-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .indexing-dot {
    width: 0.75rem;
    height: 0.75rem;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .indexing-progress {
    margin-top: 0.5rem;
  }

  .progress-bar {
    width: 100%;
    height: 0.375rem;
    background-color: var(--surface-3);
    border-radius: 9999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background-color: var(--warning);
    border-radius: 9999px;
    transition: width 0.3s ease;
  }

  .progress-text {
    margin-top: 0.25rem;
    font-size: 0.625rem;
    color: var(--text-muted);
    text-align: center;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .stats-unavailable {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  /* Suggestions */
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }

  .suggestion-btn {
    font-size: 0.875rem;
    padding: 0.375rem 0.75rem;
    background-color: var(--surface-1-alpha);
    border: 1px solid var(--border-default);
    border-radius: 9999px;
    color: var(--text-primary);
    cursor: pointer;
    transition: background-color 0.15s, opacity 0.15s;
  }
  .suggestion-btn:hover:not(:disabled) {
    background-color: var(--surface-2-alpha);
  }
  .suggestion-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Messages */
  .message-row {
    display: flex;
  }
  .message-row.user {
    justify-content: flex-end;
  }
  .message-row.assistant {
    justify-content: flex-start;
  }

  .bubble {
    max-width: 85%;
    padding: 0.75rem 1rem;
    border-radius: 1rem;
  }

  @media (min-width: 768px) {
    .bubble {
      max-width: 85%;
    }
  }

  .bubble-user {
    background-color: var(--bubble-user);
    color: var(--bubble-user-text);
  }

  .bubble-assistant {
    background-color: var(--bubble-assistant);
    color: var(--bubble-assistant-text);
    backdrop-filter: blur(8px);
  }

  .bubble.error {
    border: 1px solid var(--error);
  }

  /* Sifter's intro message */
  .intro-container {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    max-width: 56rem;
    margin: 0 auto;
    padding: 1.5rem;
    background: linear-gradient(135deg, var(--surface-1-alpha), var(--surface-2-alpha));
    border-radius: 1rem;
    border: 1px solid var(--border-default);
    backdrop-filter: blur(8px);
  }

  .intro-avatar {
    flex-shrink: 0;
  }

  .intro-logo {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.5rem;
  }

  .intro-content {
    flex: 1;
  }

  .intro-text {
    font-size: 0.9375rem;
    line-height: 1.7;
    color: var(--text-primary);
  }

  .message-text {
    font-size: 1rem;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  /* AI Analysis */
  .analysis-container {
    width: 100%;
    max-width: 64rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .analysis-content {
    background-color: var(--surface-1-alpha);
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    border: 1px solid var(--border-default);
    backdrop-filter: blur(8px);
  }

  .analysis-text {
    font-size: 1rem;
    line-height: 1.7;
    color: var(--text-primary);
    white-space: pre-wrap;
  }

  .streaming-cursor {
    display: inline-block;
    width: 0.5rem;
    height: 1.1em;
    background-color: var(--accent-primary);
    margin-left: 2px;
    vertical-align: text-bottom;
    animation: blink 0.7s ease-in-out infinite;
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }

  /* Research Plan Styles */
  .research-plan {
    margin: 0.5rem 0;
    border-radius: 0.5rem;
    background: var(--surface-1-alpha);
    border: 1px solid var(--border-default);
    font-size: 0.875rem;
  }

  .research-plan-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    color: var(--text-muted);
    font-weight: 500;
    list-style: none;
  }

  .research-plan-toggle::-webkit-details-marker {
    display: none;
  }

  .research-plan[open] .research-plan-toggle {
    border-bottom: 1px solid var(--border-default);
  }

  .research-icon {
    width: 1rem;
    height: 1rem;
    stroke: var(--text-muted);
  }

  .plan-type {
    margin-left: auto;
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    background: var(--accent-primary);
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .research-plan-content {
    padding: 0.75rem;
  }

  .plan-reasoning {
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
    font-style: italic;
  }

  .plan-queries {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: center;
  }

  .queries-label {
    color: var(--text-muted);
    font-size: 0.75rem;
    margin-right: 0.25rem;
  }

  .query-chip {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 1rem;
    background: var(--surface-elevated);
    color: var(--text-secondary);
    font-size: 0.8125rem;
    border: 1px solid var(--border-default);
  }

  .analysis-sources {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-top: 0.5rem;
  }
  /* Add gap only when expanded card follows any card */
  .analysis-sources .source-card.expanded {
    margin-top: 0.75rem;
  }
  .analysis-sources .source-card.expanded:first-child {
    margin-top: 0;
  }
  /* Add gap after expanded card */
  .analysis-sources .source-card.expanded + .source-card {
    margin-top: 0.75rem;
  }

  .sources-heading {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding-left: 0.25rem;
    margin-bottom: 0.25rem;
  }

  /* Source item - card containing header and text */
  .source-item {
    background-color: var(--surface-1-alpha);
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .source-item:hover {
    border-color: var(--border-default);
  }
  .source-item.expanded {
    border-color: var(--accent-primary);
    border-width: 1px 1px 1px 3px;
  }

  /* Source header - clickable title/author row */
  .source-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    width: 100%;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s;
  }
  .source-header:hover {
    background-color: var(--hover-overlay);
  }

  .source-number {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--accent-primary);
    min-width: 1.75rem;
  }

  .source-meta {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .source-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.3;
  }

  .source-author {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .expand-icon {
    width: 1.25rem;
    height: 1.25rem;
    color: var(--text-muted);
    transition: transform 0.2s;
    flex-shrink: 0;
  }
  .expand-icon.expanded {
    transform: rotate(180deg);
  }

  /* Source text container */
  .source-text-container {
    padding: 0 1rem 1rem 1rem;
  }

  .source-text-excerpt {
    font-size: 1rem;
    line-height: 1.7;
    color: var(--text-secondary);
  }

  .source-text-full {
    font-size: 1.0625rem;
    line-height: 1.8;
    color: var(--text-primary);
    white-space: pre-wrap;
  }

  /* Search highlight for emphasized text */
  .source-text-excerpt :global(.search-highlight),
  .source-text-full :global(.search-highlight) {
    font-weight: 600;
    color: var(--text-primary);
    background-color: color-mix(in srgb, var(--accent-primary) 15%, transparent);
    padding: 0.1em 0.2em;
    border-radius: 0.2em;
  }

  /* Source Card - Paper-like hit card design */
  .source-card {
    background-color: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    overflow: hidden;
    transition: box-shadow 0.15s, border-color 0.15s;
  }
  .source-card.expanded {
    border-color: var(--border-strong, var(--border-default));
    box-shadow: 0 4px 12px light-dark(rgba(0,0,0,0.08), rgba(0,0,0,0.25));
  }
  .source-card.collapsed {
    background-color: var(--surface-1);
    border: none;
    border-bottom: 1px solid var(--border-subtle);
    border-radius: 0;
  }
  .source-card.collapsed:hover {
    background-color: var(--surface-2);
  }

  /* Collapsed summary header */
  .source-summary-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s;
  }
  .source-summary-header:hover {
    background-color: var(--hover-overlay);
  }

  .source-num {
    flex-shrink: 0;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background-color: var(--accent-primary);
    color: white;
    font-size: 0.8125rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .source-summary-text {
    flex: 1;
    min-width: 0;
    font-size: 0.9375rem;
    color: var(--text-primary);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .source-summary-title {
    flex-shrink: 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
    font-weight: 400;
    padding-left: 0.5rem;
    border-left: 1px solid var(--border-subtle);
    white-space: nowrap;
  }

  .source-expand-icon {
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--text-muted);
    transition: transform 0.2s;
  }
  .source-expand-icon.open {
    transform: rotate(180deg);
  }

  /* Collapse button for expanded cards */
  .source-collapse-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    background: var(--surface-2);
    border: none;
    border-bottom: 1px solid var(--border-subtle);
    cursor: pointer;
    text-align: left;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    transition: background-color 0.15s;
  }
  .source-collapse-btn:hover {
    background-color: var(--surface-3);
  }
  .source-collapse-btn .source-num {
    width: 1.5rem;
    height: 1.5rem;
    font-size: 0.75rem;
  }
  .source-summary-expanded {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  /* Paper-like text area - ALWAYS light paper color regardless of theme */
  .source-paper {
    background-color: #faf8f3;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    position: relative;
  }

  /* Floating paragraph number */
  .para-num {
    position: absolute;
    left: 0.5rem;
    top: 0.75rem;
    font-size: 0.65rem;
    font-family: system-ui, -apple-system, sans-serif;
    color: #9ca3af;
    user-select: none;
    pointer-events: none;
  }

  .source-text {
    font-family: Georgia, 'Times New Roman', Times, serif;
    font-size: 1.0625rem;
    line-height: 1.65;
    color: #1a1a1a;
    margin: 0;
    margin-left: 1rem; /* Space for paragraph number */
  }

  /* Meilisearch keyword matches - just bold, no background (avoid over-highlighting) */
  .source-paper :global(.search-highlight),
  .source-paper :global(em) {
    font-style: normal;
    font-weight: 600;
    color: #1a1a1a;
  }

  /* Analyzer highlight for the most relevant sentence - pale yellow background */
  /* Use !important to override browser default mark styles */
  .source-paper :global(mark) {
    background-color: #fef9c3 !important;
    background: #fef9c3 !important;
    padding: 0.15em 0.3em;
    border-radius: 0.25em;
    color: #1a1a1a !important;
  }

  /* Bold key words within the relevant sentence */
  .source-paper :global(mark b),
  .source-paper :global(b) {
    font-weight: 700;
    color: inherit;
  }

  /* Citation bar at bottom of card */
  .citation-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: var(--surface-2);
    font-size: 0.8125rem;
  }

  .citation-path {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem;
    color: var(--text-secondary);
    min-width: 0;
    flex: 1;
  }

  .citation-segment {
    white-space: nowrap;
  }

  .citation-sep {
    color: var(--text-primary);
    opacity: 0.6;
    margin: 0 0.125rem;
    font-weight: 500;
  }

  .citation-title {
    color: var(--text-primary);
    font-weight: 600;
    white-space: normal;
    word-break: break-word;
  }

  .read-more-btn {
    flex-shrink: 0;
    padding: 0.375rem 0.75rem;
    background-color: var(--accent-primary);
    color: var(--accent-primary-text);
    border: none;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s, transform 0.15s;
  }
  .read-more-btn:hover {
    background-color: var(--accent-primary-hover);
    transform: scale(1.02);
  }

  /* Results */
  .results-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .results-summary {
    font-size: 1rem;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }

  /* Collapsed result: single row */
  .result-card {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background-color: var(--card-bg);
    border-radius: 0.375rem;
    border: 1px solid var(--card-border);
    backdrop-filter: blur(8px);
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s;
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }
  .result-card:hover {
    background-color: var(--hover-overlay);
  }
  .result-card.expanded {
    flex-direction: column;
    align-items: stretch;
    padding: 0.75rem 1rem;
  }

  .result-num {
    flex-shrink: 0;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background-color: var(--accent-primary);
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .result-excerpt {
    flex: 1;
    font-size: 1rem;
    color: var(--text-primary);
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-src {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
    max-width: 10rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Expanded result */
  .result-expanded {
    width: 100%;
  }

  .result-full-text {
    font-size: 1.125rem;
    color: var(--text-primary);
    line-height: 1.7;
    white-space: pre-wrap;
    margin-bottom: 0.75rem;
  }

  .result-meta {
    font-size: 0.8125rem;
    color: var(--text-muted);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-subtle);
  }

  .meta-title {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .meta-sep {
    color: var(--text-muted);
  }

  .meta-author {
    color: var(--text-muted);
  }

  .meta-collection {
    color: var(--text-muted);
    font-style: italic;
  }

  .result-chevron {
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
    color: var(--text-muted);
    transition: transform 0.2s;
  }
  .result-chevron.open {
    transform: rotate(180deg);
  }

  /* Search highlight - visible yellow/accent background for matched terms */
  :global(.search-highlight) {
    font-weight: 600;
    font-style: normal;
    background-color: color-mix(in srgb, var(--accent-primary) 25%, transparent);
    padding: 0.1em 0.2em;
    border-radius: 0.2em;
  }

  /* Hyperlinked URLs in text */
  :global(.text-link) {
    color: var(--accent-primary);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--accent-primary) 50%, transparent);
    text-underline-offset: 2px;
    word-break: break-all;
  }
  :global(.text-link:hover) {
    text-decoration-color: var(--accent-primary);
  }

  /* Override browser default <em> styling in results (Meilisearch uses <em> tags) */
  .result-text-area :global(em),
  .result-text-preview :global(em),
  .result-text-full :global(em),
  .result-card :global(em),
  .source-text-excerpt :global(em),
  .source-text-full :global(em),
  .result-excerpt :global(em) {
    font-style: normal;
    font-weight: 600;
    background-color: color-mix(in srgb, var(--accent-primary) 25%, transparent);
    padding: 0.1em 0.2em;
    border-radius: 0.2em;
  }

  /* Also override any mark tags that might be used */
  .result-text-area :global(mark),
  .result-card :global(mark) {
    font-weight: 600;
    background-color: color-mix(in srgb, var(--accent-primary) 25%, transparent) !important;
    background: color-mix(in srgb, var(--accent-primary) 25%, transparent) !important;
    padding: 0.1em 0.2em;
    border-radius: 0.2em;
  }

  /* Typewriter loading animation in analysis content */
  .typewriter-loading {
    min-height: 1.5rem;
  }

  .typewriter-text {
    font-size: 1rem;
    color: var(--text-secondary);
    font-style: italic;
  }

  .typewriter-cursor {
    display: inline-block;
    color: var(--accent-primary);
    font-weight: 300;
    animation: cursor-blink 0.6s ease-in-out infinite;
    margin-left: 1px;
  }

  @keyframes cursor-blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }

  /* Legacy typing indicator (kept for reference) */
  .typing-indicator {
    display: flex;
    gap: 0.25rem;
  }

  .dot {
    width: 0.5rem;
    height: 0.5rem;
    background-color: var(--text-muted);
    border-radius: 9999px;
    animation: bounce 1.4s ease-in-out infinite;
  }
  .dot:nth-child(1) { animation-delay: 0ms; }
  .dot:nth-child(2) { animation-delay: 150ms; }
  .dot:nth-child(3) { animation-delay: 300ms; }

  @keyframes bounce {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-0.375rem); }
  }

  /* Input Area */
  .input-area {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border-default);
    background-color: var(--surface-0-alpha);
    backdrop-filter: blur(8px);
  }

  .qr-link {
    flex-shrink: 0;
  }

  .qr-code {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.375rem;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .qr-link:hover .qr-code {
    opacity: 1;
  }

  .input-form {
    flex: 1;
    min-width: 0;
  }

  /* Input wrapper - contains input and search button */
  .input-wrapper {
    display: flex;
    align-items: center;
    background-color: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 0.75rem;
    overflow: hidden;
    transition: border-color 0.15s;
    backdrop-filter: blur(8px);
  }

  .input-wrapper:focus-within {
    border-color: var(--input-border-focus);
  }

  .search-input {
    flex: 1;
    min-width: 0;
    padding: 0.625rem 0.75rem;
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: 1rem;
    outline: none;
  }
  .search-input::placeholder {
    color: var(--input-placeholder);
  }
  .search-input:disabled {
    opacity: 0.5;
  }

  /* Search button inside input */
  .submit-btn {
    padding: 0.5rem 0.75rem;
    background-color: var(--accent-primary);
    color: var(--accent-primary-text);
    border: none;
    border-radius: 0.5rem;
    margin: 0.25rem;
    cursor: pointer;
    transition: background-color 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .submit-btn:hover:not(:disabled) {
    background-color: var(--accent-primary-hover);
  }
  .submit-btn:disabled {
    background-color: var(--surface-3);
    color: var(--text-muted);
    cursor: not-allowed;
  }

  /* Clear button on the right */
  .clear-btn {
    padding: 0.5rem;
    background-color: var(--surface-2);
    color: var(--text-secondary);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .clear-btn:hover {
    background-color: var(--surface-3);
    color: var(--text-primary);
  }

  /* Utilities */
  .w-5 { width: 1.25rem; }
  .h-5 { height: 1.25rem; }
  .mx-2 { margin-left: 0.5rem; margin-right: 0.5rem; }
  .text-accent { color: var(--accent-primary); }

  /* Skip link for keyboard navigation */
  .skip-link {
    position: absolute;
    top: -40px;
    left: 0;
    background: var(--accent-primary);
    color: var(--accent-primary-text);
    padding: 0.5rem 1rem;
    z-index: 100;
    text-decoration: none;
    font-weight: 500;
    border-radius: 0 0 0.5rem 0;
    transition: top 0.2s ease;
  }
  .skip-link:focus {
    top: 0;
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }

  /* ==========================================
     Full-screen Reader Modal Styles
     ========================================== */

  .reader-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.95);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Smooth expansion animation */
  .reader-overlay.animating {
    animation: readerExpand 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes readerExpand {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .reader-modal {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #faf8f3;
    color: #1a1a1a;
  }

  /* Desktop: still allow some border-radius for polish */
  @media (min-width: 768px) {
    .reader-modal {
      max-width: 100%;
      height: 100%;
      border-radius: 0;
    }
  }

  /* Reader Header - Book Style */
  .reader-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    background: linear-gradient(135deg, #f8f6f1 0%, #ebe7df 100%);
    flex-shrink: 0;
  }

  .reader-book-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    flex: 1;
    min-width: 0;
  }

  /* Religion badge with decorative icon */
  .reader-religion-badge {
    flex-shrink: 0;
    width: 3.5rem;
    height: 3.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(145deg, #fff 0%, #f0ede6 100%);
    border-radius: 0.5rem;
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.8);
    border: 1px solid rgba(0, 0, 0, 0.06);
  }

  .religion-icon {
    width: 2rem;
    height: 2rem;
    color: #8b7355;
  }

  /* Book metadata area */
  .reader-book-meta {
    flex: 1;
    min-width: 0;
    padding-right: 1rem;
  }

  .reader-book-collection {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-bottom: 0.375rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .reader-religion-tag {
    color: #8b7355;
    font-weight: 600;
  }

  .reader-collection-sep {
    color: #b8a88a;
  }

  .reader-collection-name {
    color: #6b5c4c;
  }

  .reader-book-title {
    font-family: Georgia, 'Times New Roman', Times, serif;
    font-size: 1.375rem;
    font-weight: 600;
    color: #2c2416;
    margin: 0 0 0.25rem;
    line-height: 1.25;
  }

  .reader-book-author {
    font-size: 0.9375rem;
    font-style: italic;
    color: #5a4d3a;
    margin: 0;
  }

  /* Mobile: stack vertically */
  @media (max-width: 480px) {
    .reader-header {
      padding: 1rem;
    }

    .reader-book-header {
      gap: 0.75rem;
    }

    .reader-religion-badge {
      width: 2.75rem;
      height: 2.75rem;
    }

    .religion-icon {
      width: 1.5rem;
      height: 1.5rem;
    }

    .reader-book-title {
      font-size: 1.125rem;
    }

    .reader-book-author {
      font-size: 0.875rem;
    }

    .reader-source-link {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
    }
  }

  .reader-source-link {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.5rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    color: #6b5c4c;
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.375rem;
    text-decoration: none;
    transition: all 0.2s ease;
  }

  .reader-source-link:hover {
    background: rgba(255, 255, 255, 0.9);
    color: #4a3d2e;
    border-color: rgba(0, 0, 0, 0.2);
  }

  .reader-source-link svg {
    flex-shrink: 0;
  }

  .reader-close-btn {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 50%;
    color: #666;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .reader-close-btn:hover {
    background: rgba(0, 0, 0, 0.1);
    color: #1a1a1a;
  }

  /* Reader Content */
  .reader-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 2rem 1.5rem;
    scroll-behavior: smooth;
  }

  @media (min-width: 768px) {
    .reader-content {
      padding: 2.5rem 3rem;
    }
  }

  .reader-loading,
  .reader-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    color: #666;
  }

  .reader-loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(0, 0, 0, 0.1);
    border-top-color: var(--accent-primary, #0891b2);
    border-radius: 50%;
    animation: readerSpin 1s linear infinite;
  }

  @keyframes readerSpin {
    to { transform: rotate(360deg); }
  }

  .reader-paragraphs {
    /* Match source-paper width - no max-width constraint */
    margin: 0 auto;
    padding-left: 2rem; /* Space for paragraph numbers */
  }

  .reader-paragraph-wrapper {
    position: relative;
    margin: 0 0 1.5rem;
    cursor: pointer;
  }

  .reader-paragraph-wrapper .para-num {
    position: absolute;
    left: -2rem;
    top: 0.25rem;
  }

  .reader-paragraph {
    font-family: Georgia, 'Times New Roman', Times, serif;
    font-size: 1.0625rem;
    line-height: 1.65;
    color: #1a1a1a;
    margin: 0;
    /* No special padding/border - match source-paper text style */
  }

  /* Reader paragraph highlighting - only <mark> from the current hit */
  .reader-paragraph :global(mark) {
    background-color: #fef9c3 !important;
    background: #fef9c3 !important;
    padding: 0.15em 0.3em;
    border-radius: 0.25em;
    color: #1a1a1a !important;
  }

  .reader-paragraph :global(mark b),
  .reader-paragraph :global(b) {
    font-weight: 700;
    color: inherit;
  }

</style>
