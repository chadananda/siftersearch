<script>
  import { onMount, tick } from 'svelte';
  import { search, session } from '../lib/api.js';
  import { initAuth, logout, getAuthState } from '../lib/auth.svelte.js';
  import { initPWA, performUpdate, getPWAState } from '../lib/pwa.svelte.js';
  import { setThinking } from '../lib/stores/thinking.svelte.js';
  import changelog from '../lib/changelog.json';
  import AuthModal from './AuthModal.svelte';
  import ThemeToggle from './ThemeToggle.svelte';

  // App version - injected at build time
  const APP_VERSION = import.meta.env.PUBLIC_APP_VERSION || '0.0.1';

  // PWA update state
  const pwa = getPWAState();

  let messages = $state([]);
  let input = $state('');
  let loading = $state(false);
  let showAuthModal = $state(false);
  let showAbout = $state(false);
  let libraryStats = $state(null);
  let statsLoading = $state(true);
  let expandedResults = $state({}); // Track which results are expanded
  let inputEl;
  let messagesAreaEl;

  // Clear search and return to library summary
  function clearSearch() {
    input = '';
    messages = [];
    inputEl?.focus();
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

    messages = [...messages, { id: `user-${messageId}`, role: 'user', content: userMessage }];
    loading = true;
    setThinking(true); // Trigger neural activity animation

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
        if (event.type === 'sources') {
          sources = event.sources || [];
          // Update message with sources
          messages = messages.map((m, i) =>
            i === assistantMsgIndex
              ? { ...m, results: sources }
              : m
          );
        } else if (event.type === 'chunk') {
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
    expandedResults = { ...expandedResults, [key]: !currentState };
  }

  function isExpanded(messageId, resultIndex) {
    const key = `${messageId}-${resultIndex}`;
    // Only first result expanded by default, unless user explicitly changed it
    if (expandedResults[key] === undefined) {
      return resultIndex === 0;
    }
    return expandedResults[key];
  }

  // Simple markdown-like formatting for highlighted text
  function formatText(text) {
    if (!text) return '';
    // Convert **bold** and _italic_ and highlight <em> tags from Meilisearch
    return text
      .replace(/<em>/g, '<span class="search-highlight">')
      .replace(/<\/em>/g, '</span>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/_(.+?)_/g, '<em class="italic">$1</em>');
  }

  async function initSession() {
    try {
      const sessionData = await session.init();
      // If new session with intro message from Jafar, add it to messages
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

<div class="chat-container" role="application" aria-label="SifterSearch - Interfaith Library Search">
  <!-- Skip to main content link for keyboard users -->
  <a href="#main-content" class="skip-link">Skip to main content</a>

  <!-- Header -->
  <header class="header" role="banner">
    <div class="header-left">
      <img src="/ocean.svg" alt="SifterSearch" class="logo" />
      <span class="title" role="text">SifterSearch {#if pwa.updateAvailable}<button class="version version-update" onclick={performUpdate} title="Click to update">v{APP_VERSION} - Update!</button>{:else}<span class="version">v{APP_VERSION}</span>{/if}</span>
    </div>
    <nav class="header-right" aria-label="Main navigation">
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
  </header>

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

        <!-- What's New Section -->
        {#if changelog?.entries?.length > 0}
          <div class="whats-new">
            <h3 class="whats-new-title">What's New</h3>
            <ul class="changelog-list">
              {#each changelog.entries.slice(0, 5) as entry}
                <li class="changelog-item">
                  <span class="changelog-type changelog-type-{entry.type.toLowerCase()}">{entry.type}</span>
                  <span class="changelog-desc">{entry.description}</span>
                </li>
              {/each}
            </ul>
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
  <main id="main-content" class="messages-area" bind:this={messagesAreaEl} role="main" aria-label="Search results and conversation">
    {#if messages.length === 0}
      <div class="welcome-screen">
        <img src="/ocean.svg" alt="Ocean Library" class="welcome-logo" />
        <h2 class="welcome-title">Ocean Library AI Research Engine</h2>
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
          {#each ['What is the nature of the soul?', 'Compare creation stories', 'Teachings on compassion'] as suggestion}
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
                  <p class="analysis-text">{message.content}{#if message.isStreaming}<span class="streaming-cursor"></span>{/if}</p>
                </div>
              {/if}

              <!-- Sources (shown below response) -->
              {#if message.results && message.results.length > 0}
                <div class="analysis-sources">
                  <h4 class="sources-heading">Sources ({message.results.length})</h4>
                  {#each message.results as result, i}
                    {@const resultKey = `${message.id || msgIndex}-${i}`}
                    {@const expanded = expandedResults[resultKey] !== undefined ? expandedResults[resultKey] : i === 0}
                    {@const text = result._formatted?.text || result.text || ''}
                    {@const title = result.title || 'Untitled'}
                    {@const author = result.author}
                    {@const religion = result.religion || ''}
                    {@const collection = result.collection || ''}

                    <div class="source-card" role="article">
                      <!-- Paper-like text area with white background -->
                      <div class="source-paper">
                        <p class="source-text">{@html formatText(text)}</p>
                      </div>

                      <!-- Citation bar: [religion] > [collection] > [author] > [title] -->
                      <div class="citation-bar">
                        <div class="citation-path">
                          {#if religion}<span class="citation-segment">{religion}</span>{/if}
                          {#if collection}<span class="citation-sep">›</span><span class="citation-segment">{collection}</span>{/if}
                          {#if author}<span class="citation-sep">›</span><span class="citation-segment">{author}</span>{/if}
                          <span class="citation-sep">›</span><span class="citation-segment citation-title">{title}</span>
                        </div>
                        <button class="read-more-btn" onclick={(e) => { e.stopPropagation(); alert('Full reader coming soon'); }}>
                          Read More
                        </button>
                      </div>
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
            <!-- Jafar's intro message - styled as welcome -->
            <div class="intro-container">
              <div class="intro-avatar">
                <img src="/jafar.svg" alt="Jafar" class="intro-logo" />
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
      {#if loading}
        <div class="message-row assistant">
          <div class="bubble bubble-assistant">
            <div class="typing-indicator">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>
        </div>
      {/if}
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
    <form onsubmit={(e) => { e.preventDefault(); sendMessage(); }} class="input-form" aria-label="Search form">
      <label for="search-input" class="sr-only">Search sacred texts</label>
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
    </form>
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
    padding: 0.75rem 1rem;
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

  .title .version {
    font-size: 0.7rem;
    font-weight: 400;
    color: var(--text-muted);
    vertical-align: super;
    margin-left: 0.25rem;
  }

  .title .version-update {
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
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* Welcome Screen */
  .welcome-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    padding: 1rem;
  }

  .welcome-logo {
    width: 5rem;
    height: 5rem;
    border-radius: 1rem;
    margin-bottom: 1.5rem;
  }

  .welcome-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
    text-shadow: 0 1px 2px light-dark(rgba(255,255,255,0.8), rgba(0,0,0,0.5));
  }

  .welcome-desc {
    color: var(--text-secondary);
    max-width: 28rem;
    margin-bottom: 1.5rem;
    text-shadow:
      0 0 8px light-dark(rgba(255,255,255,0.9), rgba(0,0,0,0.8)),
      0 0 16px light-dark(rgba(255,255,255,0.7), rgba(0,0,0,0.6)),
      0 1px 3px light-dark(rgba(255,255,255,0.8), rgba(0,0,0,0.7));
  }

  /* Stats */
  .stats-container {
    width: 100%;
    max-width: 42rem;
    margin-bottom: 2rem;
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
    background-color: var(--surface-0);
    border-radius: 0.75rem;
    padding: 1.25rem;
    border: 1px solid var(--border-default);
    backdrop-filter: blur(12px);
    box-shadow: 0 4px 12px light-dark(rgba(0,0,0,0.08), rgba(0,0,0,0.25));
  }

  .stats-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 0.75rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    text-align: center;
  }

  @media (max-width: 480px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .stat-label {
    font-size: 1rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .stat-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--accent-primary);
  }

  .religion-tags {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-default);
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
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

  /* Jafar's intro message */
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

  .analysis-sources {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.5rem;
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
  .source-card:hover {
    border-color: var(--border-strong, var(--border-default));
    box-shadow: 0 4px 12px light-dark(rgba(0,0,0,0.08), rgba(0,0,0,0.25));
  }

  /* Paper-like text area with white/light background */
  .source-paper {
    background-color: light-dark(#ffffff, #1a1a1a);
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .source-text {
    font-size: 1.0625rem;
    line-height: 1.8;
    color: light-dark(#1a1a1a, #e8e8e8);
    margin: 0;
  }

  /* Light yellow highlight for search matches on paper background */
  .source-paper :global(.search-highlight),
  .source-paper :global(em) {
    font-style: normal;
    font-weight: 600;
    background-color: light-dark(#fef9c3, rgba(254, 249, 195, 0.3));
    padding: 0.1em 0.25em;
    border-radius: 0.2em;
    color: light-dark(#1a1a1a, #fef9c3);
  }

  /* Citation bar at bottom of card */
  .citation-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.625rem 1rem;
    background-color: var(--surface-2);
    font-size: 0.8125rem;
  }

  .citation-path {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem;
    color: var(--text-muted);
    min-width: 0;
  }

  .citation-segment {
    white-space: nowrap;
  }

  .citation-sep {
    color: var(--text-muted);
    opacity: 0.5;
    margin: 0 0.125rem;
  }

  .citation-title {
    color: var(--text-secondary);
    font-weight: 500;
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
    background-color: color-mix(in srgb, var(--accent-primary) 25%, transparent);
    padding: 0.1em 0.2em;
    border-radius: 0.2em;
  }

  /* Typing indicator */
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
    padding: 1rem;
    border-top: 1px solid var(--border-default);
    background-color: var(--surface-0-alpha);
    backdrop-filter: blur(8px);
  }

  .input-form {
    display: flex;
    gap: 0.75rem;
    max-width: 64rem;
    margin: 0 auto;
  }

  .search-input {
    flex: 1;
    padding: 0.75rem 1rem;
    background-color: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 0.75rem;
    color: var(--text-primary);
    font-size: 1rem;
    outline: none;
    transition: border-color 0.15s;
    backdrop-filter: blur(8px);
  }
  .search-input::placeholder {
    color: var(--input-placeholder);
  }
  .search-input:focus {
    border-color: var(--input-border-focus);
  }
  .search-input:disabled {
    opacity: 0.5;
  }

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

  .submit-btn {
    padding: 0.75rem 1.5rem;
    background-color: var(--accent-primary);
    color: var(--accent-primary-text);
    border: none;
    border-radius: 0.75rem;
    cursor: pointer;
    transition: background-color 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .submit-btn:hover:not(:disabled) {
    background-color: var(--accent-primary-hover);
  }
  .submit-btn:disabled {
    background-color: var(--surface-3);
    cursor: not-allowed;
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
</style>
