<script>
  import { onMount, tick } from 'svelte';
  import { search, session } from '../lib/api.js';
  import { initAuth, logout, getAuthState } from '../lib/auth.svelte.js';
  import { initPWA, performUpdate, getPWAState } from '../lib/pwa.svelte.js';
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

  const auth = getAuthState();

  // Library connection status
  let libraryConnected = $derived(!statsLoading && libraryStats !== null);

  let retryInterval = $state(null);
  const RETRY_DELAY = 10000; // 10 seconds

  async function loadLibraryStats() {
    statsLoading = true;
    try {
      const stats = await search.stats();
      libraryStats = stats;
      // Connected - stop polling if running
      if (retryInterval) {
        clearInterval(retryInterval);
        retryInterval = null;
      }
    } catch (err) {
      console.error('Failed to load library stats:', err);
      libraryStats = null;
      // Start polling if not already
      startRetryPolling();
    } finally {
      statsLoading = false;
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

    // Scroll to user message
    scrollToLatestUserMessage();

    try {
      // Always use AI-powered analyze endpoint - let AI decide how to respond
      const result = await search.analyze(userMessage);

      messages = [...messages, {
        id: messageId,
        role: 'assistant',
        content: result.analysis || 'Search completed.',
        results: result.sources || [],
        isAnalysis: true
      }];
    } catch (err) {
      console.error('Search error:', err);
      messages = [...messages, {
        role: 'assistant',
        content: `Search error: ${err.message}. Make sure the API server and Meilisearch are running.`,
        error: true
      }];
    } finally {
      loading = false;
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
    expandedResults = { ...expandedResults, [key]: !expandedResults[key] };
  }

  function isExpanded(messageId, resultIndex) {
    return expandedResults[`${messageId}-${resultIndex}`] || false;
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
    };
  });
</script>

<AuthModal bind:isOpen={showAuthModal} />

<div class="chat-container">
  <!-- Header -->
  <header class="header">
    <div class="header-left">
      <img src="/logo.svg" alt="SifterSearch" class="logo" />
      <h1 class="title">SifterSearch {#if pwa.updateAvailable}<button class="version version-update" onclick={performUpdate} title="Click to update">v{APP_VERSION} - Update!</button>{:else}<span class="version">v{APP_VERSION}</span>{/if}</h1>
    </div>
    <nav class="header-right">
      <ThemeToggle />
      <button
        onclick={() => showAbout = !showAbout}
        class="nav-link"
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
    <div class="about-section">
      <div class="about-content">
        <div class="about-header">
          <h2 class="about-title">About SifterSearch</h2>
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
      </div>
    </div>
  {/if}

  <!-- Hidden SEO content -->
  <div class="sr-only" aria-hidden="true">
    <article>
      <h1>SifterSearch - Ocean 2.0 Interfaith Library, AI Search</h1>
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

  <!-- Messages area -->
  <div class="messages-area" bind:this={messagesAreaEl}>
    {#if messages.length === 0}
      <div class="welcome-screen">
        <img src="/logo.svg" alt="SifterSearch" class="welcome-logo" />
        <h2 class="welcome-title">Ocean 2.0 Interfaith Library, AI Search</h2>
        <p class="welcome-desc">
          Use advanced AI research to locate information across thousands of books, manuscripts, papers, notes and publications across multiple languages.
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
                  <div class="stat-value" style="color: var(--accent-primary)">{libraryStats.religions || 0}</div>
                  <div class="stat-label">Religions</div>
                </div>
                <div class="stat">
                  <div class="stat-value" style="color: var(--accent-secondary)">{libraryStats.collections || 0}</div>
                  <div class="stat-label">Collections</div>
                </div>
                <div class="stat">
                  <div class="stat-value" style="color: var(--accent-tertiary)">{formatNumber(libraryStats.totalDocuments)}</div>
                  <div class="stat-label">Documents</div>
                </div>
              </div>
              <!-- Row 2: Collection tags -->
              {#if libraryStats.collectionCounts && Object.keys(libraryStats.collectionCounts).length > 0}
                <div class="collection-tags">
                  {#each Object.entries(libraryStats.collectionCounts) as [collection, count]}
                    <span class="collection-tag">
                      {collection}
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
            <!-- AI Analysis result -->
            <div class="analysis-container">
              <div class="analysis-content">
                <p class="analysis-text">{message.content}</p>
              </div>
              {#if message.results && message.results.length > 0}
                <div class="analysis-sources">
                  <h4 class="sources-heading">Sources ({message.results.length})</h4>
                  {#each message.results as result, i}
                    {@const resultKey = `${message.id || msgIndex}-${i}`}
                    {@const expanded = expandedResults[resultKey]}
                    {@const text = result._formatted?.text || result.text || ''}
                    {@const title = result.title || 'Untitled'}
                    {@const author = result.author || 'Unknown'}
                    {@const collection = result.collection || result.religion || ''}
                    <button
                      class="source-card"
                      onclick={() => { expandedResults = { ...expandedResults, [resultKey]: !expanded }; }}
                    >
                      <span class="source-number">[{i + 1}]</span>
                      <div class="source-info">
                        <span class="source-title-small">{title}</span>
                        <span class="source-author-small">{author}</span>
                      </div>
                      <svg
                        class="expand-icon-small {expanded ? 'expanded' : ''}"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {#if expanded}
                      <div class="source-expanded-text">
                        <p>{@html formatText(text)}</p>
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          {:else if message.results && message.results.length > 0}
            <!-- Search results with collapsible cards -->
            <div class="results-container">
              <p class="results-summary">{message.content}</p>
              {#each message.results as result, i}
                {@const resultKey = `${message.id || msgIndex}-${i}`}
                {@const expanded = expandedResults[resultKey]}
                {@const text = result._formatted?.text || result.text || ''}
                {@const title = result.title || 'Untitled'}
                {@const author = result.author || 'Unknown'}
                {@const collection = result.collection || result.religion || ''}
                <button
                  class="result-card"
                  onclick={() => { expandedResults = { ...expandedResults, [resultKey]: !expanded }; }}
                >
                  <!-- Result number badge -->
                  <span class="result-number">{i + 1}</span>

                  <!-- Text content first - at least 3 lines when collapsed -->
                  <div class="result-text-area">
                    {#if expanded}
                      <p class="result-text-full">{@html formatText(text)}</p>
                    {:else}
                      <p class="result-text-preview">{@html formatText(text.substring(0, 350))}{text.length > 350 ? '...' : ''}</p>
                    {/if}
                  </div>

                  <!-- Source info underneath -->
                  <div class="result-source">
                    <span class="source-title">{title}</span>
                    <span class="source-separator">—</span>
                    <span class="source-author">{author}</span>
                    {#if collection}
                      <span class="source-collection">({collection})</span>
                    {/if}
                  </div>

                  <!-- Expand indicator -->
                  <svg
                    class="expand-icon {expanded ? 'expanded' : ''}"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
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
  </div>

  <!-- Input area -->
  <div class="input-area">
    <form onsubmit={(e) => { e.preventDefault(); sendMessage(); }} class="input-form">
      <input
        bind:this={inputEl}
        bind:value={input}
        onkeydown={handleKeydown}
        placeholder="Search sacred texts..."
        disabled={loading}
        class="search-input"
      />
      <button
        type="submit"
        disabled={!input.trim() || loading || !libraryConnected}
        aria-label="Search"
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
    max-width: 48rem;
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
  }

  .welcome-desc {
    color: var(--text-secondary);
    max-width: 28rem;
    margin-bottom: 1.5rem;
  }

  /* Stats */
  .stats-container {
    width: 100%;
    max-width: 32rem;
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
    background-color: var(--surface-1-alpha);
    border-radius: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--border-default);
    backdrop-filter: blur(8px);
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
    gap: 0.75rem;
    text-align: center;
  }

  @media (max-width: 480px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .stat-label {
    font-size: 0.7rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .collection-tags {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-default);
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }

  .collection-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    background-color: var(--surface-2-alpha);
    border-radius: 9999px;
    font-size: 0.75rem;
    color: var(--text-secondary);
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
      max-width: 70%;
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
    max-width: 32rem;
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
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  /* AI Analysis */
  .analysis-container {
    width: 100%;
    max-width: 48rem;
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
    font-size: 0.9375rem;
    line-height: 1.7;
    color: var(--text-primary);
    white-space: pre-wrap;
  }

  .analysis-sources {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sources-heading {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding-left: 0.25rem;
  }

  .source-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background-color: var(--surface-2-alpha);
    border: 1px solid var(--border-subtle);
    border-radius: 0.375rem;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s;
  }
  .source-card:hover {
    background-color: var(--hover-overlay);
  }

  .source-number {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent-primary);
    min-width: 1.5rem;
  }

  .source-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .source-title-small {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .source-author-small {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .expand-icon-small {
    width: 0.875rem;
    height: 0.875rem;
    color: var(--text-muted);
    transition: transform 0.2s;
    flex-shrink: 0;
  }
  .expand-icon-small.expanded {
    transform: rotate(180deg);
  }

  .source-expanded-text {
    padding: 0.75rem 1rem;
    margin-left: 1.5rem;
    background-color: var(--surface-1-alpha);
    border-left: 2px solid var(--accent-primary);
    border-radius: 0 0.375rem 0.375rem 0;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--text-secondary);
  }

  /* Results */
  .results-container {
    width: 100%;
    max-width: 48rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .results-summary {
    font-size: 0.875rem;
    color: var(--text-secondary);
    padding-left: 0.25rem;
  }

  .result-card {
    position: relative;
    width: 100%;
    padding: 0.875rem 1rem;
    background-color: var(--card-bg);
    border-radius: 0.5rem;
    border: 1px solid var(--card-border);
    backdrop-filter: blur(8px);
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .result-card:hover {
    background-color: var(--hover-overlay);
  }

  .result-number {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 9999px;
    background-color: var(--surface-2);
    color: var(--text-muted);
    font-size: 0.625rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .result-text-area {
    flex: 1;
    padding-right: 1.5rem;
  }

  .result-text-preview {
    font-size: 0.875rem;
    color: var(--text-primary);
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .result-text-full {
    font-size: 0.875rem;
    color: var(--text-primary);
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .result-source {
    font-size: 0.75rem;
    color: var(--text-muted);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    padding-top: 0.375rem;
    border-top: 1px solid var(--border-subtle);
  }

  .source-title {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .source-separator {
    color: var(--text-muted);
  }

  .source-author {
    color: var(--text-muted);
  }

  .source-collection {
    color: var(--text-muted);
    font-style: italic;
  }

  .expand-icon {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    width: 1rem;
    height: 1rem;
    color: var(--text-muted);
    transition: transform 0.2s;
  }
  .expand-icon.expanded {
    transform: rotate(180deg);
  }

  /* Search highlight - very subtle emphasis, just slightly bolder */
  :global(.search-highlight) {
    font-weight: 500;
    color: inherit;
    background: none !important;
    background-color: transparent !important;
    font-style: normal;
  }

  /* Override browser default <em> styling in results (Meilisearch uses <em> tags) */
  .result-text-area :global(em),
  .result-text-preview :global(em),
  .result-text-full :global(em),
  .result-card :global(em) {
    font-style: normal;
    font-weight: 500;
    color: inherit;
    background: none !important;
    background-color: transparent !important;
  }

  /* Also override any mark tags that might be used */
  .result-text-area :global(mark),
  .result-card :global(mark) {
    font-weight: 500;
    color: inherit;
    background: none !important;
    background-color: transparent !important;
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
    max-width: 48rem;
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
</style>
