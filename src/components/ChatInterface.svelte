<script>
  import { onMount, tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fade, slide } from 'svelte/transition';
  import { marked } from 'marked';
  import { search, session, documents, triggerServerUpdate, authenticatedFetch, admin } from '../lib/api.js';

  // Client version - baked in at build time
  const CLIENT_VERSION = __APP_VERSION__;
  const APP_DESCRIPTION = __APP_DESCRIPTION__;
  import { initAuth, getAuthState } from '../lib/auth.svelte.js';
  import { initPWA, getPWAState, setConversationChecker } from '../lib/pwa.svelte.js';
  import NavBar from './common/NavBar.svelte';
  import { setThinking } from '../lib/stores/thinking.svelte.js';
  import { updateUsage } from '../lib/usage.svelte.js';
  import { getReferralUrl, captureReferral, generateQRCode } from '../lib/referral.js';
  import { getUserId } from '../lib/api.js';
  import TranslationView from './TranslationView.svelte';
  import AudioPlayer from './AudioPlayer.svelte';

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

  // Format milliseconds for display: >1000ms as X.XXs, otherwise Xms
  function formatTime(ms) {
    if (!ms) return '';
    return ms >= 1000 ? (ms / 1000).toFixed(2) + 's' : ms + 'ms';
  }

  // Truncate text at sentence boundary for complete thoughts
  function truncateAtSentence(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    // Look for sentence-ending punctuation before maxLength
    const truncated = text.slice(0, maxLength);
    // Find the last sentence end (.!?) followed by space or end
    const sentenceEndMatch = truncated.match(/.*[.!?](?:\s|$)/);
    if (sentenceEndMatch && sentenceEndMatch[0].length > maxLength * 0.4) {
      return sentenceEndMatch[0].trim();
    }
    // Fallback: find last space to avoid mid-word cut
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.6) {
      return truncated.slice(0, lastSpace) + '...';
    }
    return truncated + '...';
  }

  // Apply highlighting to text using keyPhrase and coreTerms
  function applyHighlighting(text, keyPhrase, coreTerms = []) {
    if (!text) return text;
    let result = text;

    // Find the sentence containing the most coreTerms and highlight it
    if (coreTerms?.length > 0) {
      // Split into sentences
      const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
      let bestSentence = null;
      let bestScore = 0;

      for (const sentence of sentences) {
        const lowerSentence = sentence.toLowerCase();
        let score = 0;
        for (const term of coreTerms) {
          if (lowerSentence.includes(term.toLowerCase())) score++;
        }
        if (score > bestScore) {
          bestScore = score;
          bestSentence = sentence;
        }
      }

      // Wrap best sentence in sentence-hit span (yellow background)
      if (bestSentence && bestScore > 0) {
        const escaped = bestSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
          const regex = new RegExp(`(${escaped})`, 'g');
          result = result.replace(regex, '<span class="sentence-hit">$1</span>');
        } catch (e) {
          // Skip on regex error
        }
      }
    }

    // Apply coreTerms with <b>
    if (coreTerms?.length > 0) {
      const sortedTerms = [...coreTerms].sort((a, b) => b.length - a.length);
      for (const term of sortedTerms) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
          // Match whole words, avoid matching inside HTML tags
          const termRegex = new RegExp(`(?<!<[^>]*)\\b(${escaped})\\b(?![^<]*>)`, 'gi');
          result = result.replace(termRegex, '<b>$1</b>');
        } catch (e) {
          // Skip on regex error
        }
      }
    }

    return result;
  }

  // PWA update state
  const pwa = getPWAState();

  let messages = $state([]);
  let input = $state('');
  let loading = $state(false);

  // Initialize library stats from cache for instant display
  const STATS_CACHE_KEY = 'sifter_library_stats';
  const isBrowser = typeof window !== 'undefined';

  function getCachedStats() {
    if (!isBrowser) return null;
    try {
      const cached = localStorage.getItem(STATS_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  }
  function setCachedStats(stats) {
    if (!isBrowser) return;
    try {
      localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(stats));
    } catch { /* ignore storage errors */ }
  }

  // Default stats for immediate display (prevents layout shift)
  const defaultStats = {
    religions: 0,
    collections: 0,
    totalDocuments: 0,
    totalPassages: 0,
    religionCounts: {},
    lastUpdated: null,
    serverVersion: null
  };

  // Load from cache immediately if in browser
  const initialCache = isBrowser ? getCachedStats() : null;
  let libraryStats = $state(initialCache);
  let statsLoading = $state(true); // Track if we're still fetching
  let serverOffline = $state(false); // Track if server is unreachable

  // Display stats: use fetched data, cached data, or defaults (never null)
  let displayStats = $derived(libraryStats || initialCache || defaultStats);
  let expandedResults = $state({}); // Track which results are expanded
  let qrCodeUrl = $state(null); // Dynamic QR code with referral URL
  let inputEl;
  let messagesAreaEl;

  // Fullscreen reader state
  let readerOpen = $state(false);
  let readerDocument = $state(null);
  let readerParagraphs = $state([]);
  let readerLoading = $state(false);
  let readerCurrentIndex = $state(0);
  let readerContainerEl;
  let readerKeyPhrase = $state(''); // Store keyPhrase for highlighting in reader
  let readerCoreTerms = $state([]); // Store coreTerms for bold emphasis in reader
  let readerAnimating = $state(false); // For smooth open animation
  let showTranslationView = $state(false); // Translation side-by-side view
  let showAudioPlayer = $state(false); // Audio player overlay

  // Research plan state - shows the researcher agent's strategy
  let researchPlan = $state(null);
  // Quick search mode state (lightning button toggle) - default ON for instant search
  let searchMode = $state(true);
  let searchResults = $state([]);
  let searchLoading = $state(false);
  let searchTime = $state(null);
  let totalHits = $state(0);
  let hasMoreResults = $state(false);
  let loadingMore = $state(false);
  let currentSearchQuery = $state('');  // Track query for pagination
  let debounceTimer = null;
  // Preloaded document cache: Map<document_id, { segments: [], total: number }>
  const documentCache = new Map();

  // Derived reader navigation state
  let readerArrayIndex = $derived(readerParagraphs.findIndex(p => p.paragraph_index === readerCurrentIndex));
  let readerCanGoPrev = $derived(readerArrayIndex > 0);
  let readerCanGoNext = $derived(readerArrayIndex >= 0 && readerArrayIndex < readerParagraphs.length - 1);

  // RTL languages that need special handling
  const RTL_LANGUAGES = ['ar', 'fa', 'he', 'ur'];
  let readerIsRTL = $derived(RTL_LANGUAGES.includes(readerDocument?.language));

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

  // Extract domain name from source URL for display
  let readerSourceDomain = $derived.by(() => {
    if (!readerSourceUrl) return null;
    try {
      const url = new URL(readerSourceUrl);
      // Remove www. prefix if present
      return url.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  });

  // AI Chat suggestions - full questions/phrases for conversational search (50 items)
  const CHAT_SUGGESTIONS = [
    // Soul & Afterlife
    'What is the nature of the soul?',
    'What happens after death?',
    'Is the soul immortal?',
    'What is the purpose of life?',
    'What is the relationship between body and soul?',
    // Comparative Religion
    'Compare creation stories across religions',
    'How do religions view suffering?',
    'What do scriptures say about forgiveness?',
    'Compare teachings on love',
    'How do different faiths describe God?',
    'What are common teachings on the afterlife?',
    // Virtues & Ethics
    'Teachings on compassion',
    'What is true humility?',
    'How to overcome anger?',
    'Guidance on honesty and truthfulness',
    'What is justice?',
    'How to practice patience?',
    'Teachings on gratitude',
    'What is the meaning of sacrifice?',
    // Prayer & Worship
    'How should one pray?',
    'What is the purpose of fasting?',
    'Importance of meditation',
    'How to draw closer to God?',
    'What are sacred obligations?',
    'Why is pilgrimage important?',
    // Social Teachings
    'Teachings on marriage and family',
    'How to achieve peace?',
    'What is the role of service?',
    'Guidance on wealth and poverty',
    'How to raise children spiritually?',
    'What is the purpose of work?',
    'Teachings on education',
    // Knowledge & Truth
    'What is the source of knowledge?',
    'How to recognize truth?',
    'Relationship between science and religion',
    'What is wisdom?',
    'How do we know God exists?',
    'What is the role of reason?',
    // Unity & Oneness
    'Teachings on unity of humanity',
    'What does oneness mean?',
    'How to overcome prejudice?',
    'What is the purpose of diversity?',
    'How do religions teach equality?',
    // Spiritual Growth
    'How to develop spiritually?',
    'What are spiritual tests?',
    'Purpose of trials and difficulties',
    'How to find inner peace?',
    'What is detachment?',
    'How to purify the heart?',
    'What is spiritual awakening?',
    'How to overcome the ego?'
  ];

  // Quick Search suggestions - keyword phrases for instant search (50 items)
  const SEARCH_SUGGESTIONS = [
    // Soul & Afterlife
    'nature of the soul',
    'life after death',
    'immortality of soul',
    'purpose of life',
    'body and spirit',
    // Comparative Religion
    'creation story',
    'meaning of suffering',
    'forgiveness teachings',
    'divine love',
    'names of God',
    'heaven paradise',
    // Virtues & Ethics
    'compassion mercy',
    'true humility',
    'overcoming anger',
    'honesty truthfulness',
    'justice righteousness',
    'patience forbearance',
    'gratitude thankfulness',
    'sacrifice selflessness',
    // Prayer & Worship
    'how to pray',
    'purpose of fasting',
    'meditation spiritual',
    'nearness to God',
    'sacred duties',
    'pilgrimage holy places',
    // Social Teachings
    'marriage family',
    'world peace',
    'service to humanity',
    'wealth poverty',
    'spiritual education',
    'work worship',
    'raising children',
    // Knowledge & Truth
    'source of knowledge',
    'recognizing truth',
    'science and religion',
    'wisdom understanding',
    'proof of God',
    'reason intellect',
    // Unity & Oneness
    'unity of humanity',
    'oneness of God',
    'eliminating prejudice',
    'diversity unity',
    'equality mankind',
    // Spiritual Growth
    'spiritual development',
    'tests and trials',
    'inner peace',
    'detachment material',
    'purity of heart',
    'spiritual awakening',
    'overcoming ego',
    // Sacred Texts
    'Book of Certitude',
    'Hidden Words',
    'Sermon on Mount'
  ];

  // Randomly select suggestions based on mode
  function getRandomSuggestions(suggestions, count = 3) {
    const shuffled = [...suggestions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  // Pre-select random indices so we can show corresponding suggestions in both modes
  const selectedChatSuggestions = getRandomSuggestions(CHAT_SUGGESTIONS, 3);
  const selectedSearchSuggestions = getRandomSuggestions(SEARCH_SUGGESTIONS, 3);

  // Reactive: show different suggestions based on search mode
  let displayedSuggestions = $derived(searchMode ? selectedSearchSuggestions : selectedChatSuggestions);

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
          }, 1500); // Wait 1.5s before untyping
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
    }, 150); // 150ms per character (slower, more readable)
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
  // Quick search mode functions
  function toggleSearchMode() {
    searchMode = !searchMode;
    if (searchMode) { searchResults = []; totalHits = 0; searchTime = null; }
  }
  function handleSearchInput() {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!input.trim()) {
      searchResults = [];
      totalHits = 0;
      searchTime = null;
      hasMoreResults = false;
      currentSearchQuery = '';
      return;
    }
    debounceTimer = setTimeout(performQuickSearch, 30);
  }

  async function performQuickSearch() {
    const q = input?.trim();
    if (!q) return;
    searchLoading = true;
    currentSearchQuery = q;
    const start = performance.now();
    try {
      // Initial search: limit 10, offset 0
      const data = await search.quick(q, 10, 0);
      console.debug('[Quick Search]', { q, data: { hits: data?.hits?.length, estimatedTotalHits: data?.estimatedTotalHits, hasMore: data?.hasMore, cached: data?.cached } });
      // Only update if query hasn't changed during fetch
      const currentInput = input?.trim();
      console.debug('[Quick Search] Check:', { currentInput, capturedQ: q, matches: currentInput === q });
      if (currentInput === q && data) {
        searchResults = data.hits || [];
        totalHits = data.estimatedTotalHits || searchResults.length;
        hasMoreResults = data.hasMore ?? false;
        searchTime = Math.round(performance.now() - start);
        // Log result keys to check for duplicates
        const keys = searchResults.map(r => `${r.doc_id || r.document_id}-${r.paragraph_index}`);
        console.debug('[Quick Search] Applied:', { totalHits, resultsLength: searchResults.length, hasMore: hasMoreResults, uniqueKeys: new Set(keys).size, keys });
      } else {
        console.debug('[Quick Search] Skipped: query changed');
      }
    } catch (err) {
      console.error('Quick search error:', err);
      // Reset state on error
      searchResults = [];
      totalHits = 0;
      hasMoreResults = false;
    }
    finally { searchLoading = false; }
  }

  async function loadMoreResults() {
    if (loadingMore || !hasMoreResults || !currentSearchQuery) return;
    loadingMore = true;
    try {
      const offset = searchResults.length;
      const data = await search.quick(currentSearchQuery, 10, offset);
      // Only update if query hasn't changed during fetch
      if (currentSearchQuery === input?.trim() && data) {
        searchResults = [...searchResults, ...(data.hits || [])];
        hasMoreResults = data.hasMore ?? false;
        totalHits = data.estimatedTotalHits || searchResults.length;
      }
    } catch (err) {
      console.error('Load more error:', err);
    }
    finally { loadingMore = false; }
  }
  async function openReaderFromSearch(result) {
    console.debug('[openReaderFromSearch] paragraph_index:', result.paragraph_index, 'doc_id:', result.document_id || result.doc_id);
    const docId = result.document_id || result.doc_id;
    const searchQuery = input.trim();
    // Extract non-stop-word terms for bold highlighting
    const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'it', 'its', 'this', 'that', 'these', 'those', 'he', 'she', 'they', 'them', 'his', 'her', 'their', 'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why']);
    const coreTerms = searchQuery.toLowerCase().split(/\s+/).filter(t => t.length >= 2 && !stopWords.has(t));
    await openReader({
      document_id: docId,
      paragraph_index: result.paragraph_index,
      title: result.title,
      author: result.author,
      religion: result.religion,
      collection: result.collection,
      language: result.language,
      text: result.text,
      keyPhrase: searchQuery,
      coreTerms: coreTerms
    });
  }

  // Track which result is showing "copied" state
  let copiedResultId = $state(null);

  /**
   * Copy search result text and attribution to clipboard
   */
  async function copyResultToClipboard(event, result) {
    event.stopPropagation(); // Don't trigger card click
    const text = result.text || '';
    const author = result.author || '';
    const title = result.title || '';
    const paraNum = result.paragraph_index != null ? result.paragraph_index + 1 : '';

    // Format: "Text" — Author, Title, ¶N
    const attribution = [author, title, paraNum ? `¶${paraNum}` : ''].filter(Boolean).join(', ');
    const clipboardText = `"${text.trim()}"\n— ${attribution}`;

    try {
      await navigator.clipboard.writeText(clipboardText);
      copiedResultId = result.id || result.doc_id;
      setTimeout(() => { copiedResultId = null; }, 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  const auth = getAuthState();

  // Admin AI usage status (only loaded for admins)
  let aiUsageStatus = $state(null);
  // Use server-side isAdmin from libraryStats (immediate) OR client-side auth (delayed)
  let isAdmin = $derived(
    libraryStats?.isAdmin ||
    (auth.isAuthenticated && auth.user?.tier === 'admin')
  );

  // Load AI usage when user becomes admin (e.g., after login or stats load)
  $effect(() => {
    if (isAdmin) loadAIUsageStatus();
  });

  // Check if user can access AI-powered research (approved+ only)
  let canUseResearcher = $derived(
    auth.isAuthenticated &&
    ['approved', 'patron', 'institutional', 'admin'].includes(auth.user?.tier)
  );

  // Library connection status
  let libraryConnected = $derived(!statsLoading && libraryStats !== null);

  let retryInterval = $state(null);
  let refreshInterval = $state(null);
  const RETRY_DELAY = 10000; // 10 seconds
  const MIN_REFRESH_INTERVAL = 10000; // 10 seconds - minimum polling interval
  const MAX_REFRESH_INTERVAL = 300000; // 5 minutes - maximum backoff
  const INDEXING_REFRESH_INTERVAL = 3000; // 3 seconds - faster polling during indexing
  const BACKOFF_MULTIPLIER = 1.5; // Increase interval by 50% each time stats unchanged

  // Track if we've already triggered an update this session
  let updateTriggered = $state(false);

  // Backoff state for reducing polling when idle
  let currentBackoffInterval = $state(MIN_REFRESH_INTERVAL);
  let lastUserActivity = $state(Date.now());

  async function loadLibraryStats(silent = false) {
    if (!silent) statsLoading = true;
    try {
      // Version is now sent in X-Client-Version header on all requests
      const stats = await search.stats();

      // Check if stats actually changed (compare lastUpdated or counts)
      const hasChanged = !libraryStats ||
        libraryStats.lastUpdated !== stats.lastUpdated ||
        libraryStats.totalDocuments !== stats.totalDocuments ||
        libraryStats.totalPassages !== stats.totalPassages;

      // Mark server as connected
      serverOffline = false;

      if (hasChanged) {
        libraryStats = stats;
        setCachedStats(stats); // Cache for instant display on next visit
        if (silent) console.log('[Library] Stats updated:', stats.totalDocuments, 'docs,', stats.totalPassages, 'passages');
        // Reset backoff when stats change
        currentBackoffInterval = MIN_REFRESH_INTERVAL;
      } else if (silent) {
        // Stats unchanged - increase backoff for next poll (unless actively indexing)
        if (!stats.indexing && !stats.translating) {
          const timeSinceActivity = Date.now() - lastUserActivity;
          if (timeSinceActivity > 30000) { // User idle for 30+ seconds
            const newInterval = Math.min(currentBackoffInterval * BACKOFF_MULTIPLIER, MAX_REFRESH_INTERVAL);
            if (newInterval > currentBackoffInterval) {
              console.log('[Library] User idle, backing off polling to', Math.round(newInterval / 1000), 's');
            }
            currentBackoffInterval = newInterval;
          }
        }
      }

      // Check for version mismatch
      if (stats.serverVersion && CLIENT_VERSION) {
        if (stats.serverVersion !== CLIENT_VERSION && !updateTriggered) {
          // Compare versions to determine who needs updating
          const clientParts = CLIENT_VERSION.split('.').map(Number);
          const serverParts = stats.serverVersion.split('.').map(Number);
          const serverNewer = serverParts[0] > clientParts[0] ||
            (serverParts[0] === clientParts[0] && serverParts[1] > clientParts[1]) ||
            (serverParts[0] === clientParts[0] && serverParts[1] === clientParts[1] && serverParts[2] > clientParts[2]);

          if (serverNewer) {
            // Server is newer - client needs to reload (only if no active conversation)
            if (messages.length === 0) {
              // Check if we recently tried reloading (with 30-second cooldown to allow CDN propagation)
              const reloadKey = `reload_attempted_${stats.serverVersion}`;
              const lastAttempt = sessionStorage.getItem(reloadKey);
              const cooldownMs = 30 * 1000; // 30 seconds
              const cooldownExpired = !lastAttempt || (Date.now() - parseInt(lastAttempt, 10)) > cooldownMs;

              if (cooldownExpired) {
                // Store timestamp for cooldown (not boolean - allows retry after cooldown)
                sessionStorage.setItem(reloadKey, Date.now().toString());
                console.log(`[Deploy] Server newer (${stats.serverVersion} > ${CLIENT_VERSION}), triggering PWA update...`);

                // Let the PWA plugin handle the update properly:
                // 1. Call r.update() on service worker registration
                // 2. New SW downloads and installs (skipWaiting makes it activate immediately)
                // 3. controllerchange event in pwa.svelte.js triggers reload
                // Don't manually clear caches - that breaks PWA lifecycle
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                  navigator.serviceWorker.ready.then(registration => {
                    console.log('[Deploy] Checking for service worker update...');
                    registration.update();
                  });
                } else {
                  // No service worker active - just reload
                  console.log('[Deploy] No service worker, reloading...');
                  window.location.reload();
                }
              } else {
                const secondsLeft = Math.ceil((parseInt(lastAttempt, 10) + cooldownMs - Date.now()) / 1000);
                console.log(`[Deploy] Update cooldown active (${secondsLeft}s remaining), waiting for CDN propagation...`);
              }
            } else {
              console.log(`[Deploy] Server newer but conversation active, skipping reload`);
            }
          } else {
            // Client is newer - trigger server update
            console.log(`[Deploy] Version mismatch: client=${CLIENT_VERSION}, server=${stats.serverVersion}`);
            updateTriggered = true;
            triggerServerUpdate(CLIENT_VERSION);
          }
        }
      }

      // Connected - stop retry polling if running
      if (retryInterval) {
        clearInterval(retryInterval);
        retryInterval = null;
      }

      // Adjust polling frequency based on indexing/translating state
      startRefreshPolling(stats.indexing || stats.translating);
    } catch (err) {
      console.error('Failed to load library stats:', err);
      // Mark server offline but keep showing cached data
      serverOffline = true;
      // Start retry polling if not already
      startRetryPolling();
      // Stop refresh polling on disconnect
      stopRefreshPolling();
    } finally {
      if (!silent) statsLoading = false;
    }
  }

  // Load AI usage status for admins (called on mount and periodically)
  async function loadAIUsageStatus() {
    if (!isAdmin) return;
    try {
      const status = await admin.getAIUsageStatus();
      const summary = await admin.getAIUsageSummary();
      // Combine embedding-related callers into single "embeddings" entry
      // (embedding, embedding-worker, embedding-batch all become "embeddings")
      let callerData = summary?.byCallerToday || [];
      if (callerData.length > 0) {
        const embeddingCost = callerData
          .filter(c => c.caller?.startsWith('embedding'))
          .reduce((sum, c) => sum + (c.cost || 0), 0);
        const nonEmbedding = callerData.filter(c => !c.caller?.startsWith('embedding'));
        if (embeddingCost > 0) {
          callerData = [...nonEmbedding, { caller: 'embeddings', cost: embeddingCost }];
        } else {
          callerData = nonEmbedding;
        }
      }
      // Get top 2 callers by cost from 24-hour data (sorted descending)
      const topCallers = callerData.length > 0
        ? [...callerData].sort((a, b) => b.cost - a.cost).slice(0, 2)
        : [];
      aiUsageStatus = {
        ...status,
        today: summary?.today,
        topCallers
      };
    } catch (err) {
      console.error('Failed to load AI usage status:', err);
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

  let currentPollingInterval = $state(null);
  let isActivelyIndexing = $state(false);
  let refreshTimeoutId = null;

  // Track user activity to reset backoff
  function handleUserActivity() {
    const wasIdle = Date.now() - lastUserActivity > 30000;
    lastUserActivity = Date.now();
    // If user was idle and is now active, reset backoff and trigger immediate refresh
    if (wasIdle && currentBackoffInterval > MIN_REFRESH_INTERVAL) {
      currentBackoffInterval = MIN_REFRESH_INTERVAL;
      console.log('[Library] User active - resetting backoff to', MIN_REFRESH_INTERVAL / 1000, 's');
    }
  }

  function scheduleNextPoll() {
    // Clear any existing timeout
    if (refreshTimeoutId) {
      clearTimeout(refreshTimeoutId);
      refreshTimeoutId = null;
    }

    // Don't schedule if page is hidden - we'll resume on visibility change
    if (document.hidden) {
      return;
    }

    // Determine interval: fast polling during indexing, otherwise use backoff
    const interval = isActivelyIndexing ? INDEXING_REFRESH_INTERVAL : currentBackoffInterval;

    refreshTimeoutId = setTimeout(() => {
      if (!document.hidden) {
        loadLibraryStats(true); // silent refresh - this will call startRefreshPolling again
      }
    }, interval);
  }

  // Handle tab visibility changes - stop polling when hidden, resume when visible
  function handleVisibilityChange() {
    if (document.hidden) {
      // Tab hidden - stop polling entirely
      if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
        refreshTimeoutId = null;
      }
      console.log('[Library] Tab hidden - polling paused');
    } else {
      // Tab visible again - reset backoff and resume polling
      currentBackoffInterval = MIN_REFRESH_INTERVAL;
      console.log('[Library] Tab visible - resuming polling');
      loadLibraryStats(true); // Immediate refresh on return
    }
  }

  function startRefreshPolling(isActive = false) {
    // Update indexing state
    const wasActive = isActivelyIndexing;
    isActivelyIndexing = isActive;

    if (isActive && !wasActive) {
      console.log('[Library] Indexing/translating detected - polling every 3s');
      // Reset backoff when indexing starts
      currentBackoffInterval = MIN_REFRESH_INTERVAL;
    }

    // Schedule next poll with dynamic interval
    scheduleNextPoll();
  }

  function stopRefreshPolling() {
    if (refreshTimeoutId) {
      clearTimeout(refreshTimeoutId);
      refreshTimeoutId = null;
    }
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
      documents.getSegments(source.document_id, { limit: 5000 })
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
    console.debug('[openReader] document_id:', result.document_id, 'result.paragraph_index:', result.paragraph_index, 'targetIndex:', targetIndex);

    // Check cache first - if preloaded, open instantly without loading state
    const cached = documentCache.get(result.document_id);
    if (cached && cached.segments.length > 0) {
      // Set up data first (reader not visible yet)
      readerDocument = {
        id: result.document_id,
        title: result.title,
        author: result.author,
        religion: result.religion,
        collection: result.collection,
        language: result.language || 'en'
      };
      readerCurrentIndex = targetIndex;
      readerKeyPhrase = result.keyPhrase || '';
      readerCoreTerms = result.coreTerms || [];
      readerParagraphs = cached.segments;
      readerLoading = false;

      // Open reader but keep content invisible until scroll positioned
      readerOpen = true;
      readerAnimating = true;

      // Wait for DOM, position scroll BEFORE content becomes visible
      await tick();
      // Use requestAnimationFrame to ensure browser has finished rendering
      requestAnimationFrame(() => {
        if (readerContainerEl) {
          // Disable smooth scroll for instant positioning
          readerContainerEl.style.scrollBehavior = 'auto';

          const paragraphEl = readerContainerEl.querySelector(`[data-paragraph-index="${targetIndex}"]`);
          console.debug('[Reader Scroll] Target index:', targetIndex, 'Element found:', !!paragraphEl, 'Paragraphs in DOM:', readerContainerEl.querySelectorAll('[data-paragraph-index]').length);
          if (paragraphEl) {
            const containerHeight = readerContainerEl.clientHeight;
            const paragraphTop = paragraphEl.offsetTop;
            const paragraphHeight = paragraphEl.offsetHeight;
            const scrollTop = paragraphTop - (containerHeight / 2) + (paragraphHeight / 2);
            console.debug('[Reader Scroll] containerHeight:', containerHeight, 'paragraphTop:', paragraphTop, 'scrollTop:', scrollTop);
            readerContainerEl.scrollTop = Math.max(0, scrollTop);
          } else {
            console.warn('[Reader Scroll] Paragraph element not found for index:', targetIndex);
          }

          // Re-enable smooth scroll for user navigation
          readerContainerEl.style.scrollBehavior = 'smooth';
        } else {
          console.warn('[Reader Scroll] Container not available');
        }

        // End animation after CSS transition
        setTimeout(() => { readerAnimating = false; }, 400);
      });
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
      collection: result.collection,
      language: result.language || 'en'
    };
    readerCurrentIndex = targetIndex;
    readerKeyPhrase = result.keyPhrase || '';
    readerCoreTerms = result.coreTerms || [];
    readerParagraphs = [];

    setTimeout(() => { readerAnimating = false; }, 400);

    try {
      const response = await documents.getSegments(result.document_id, { limit: 5000 });
      readerParagraphs = response.segments || [];

      // Cache for future use
      documentCache.set(result.document_id, {
        segments: response.segments || [],
        total: response.total || 0
      });

      // Position scroll so current paragraph is centered (no animation)
      await tick();
      requestAnimationFrame(() => {
        if (readerContainerEl) {
          readerContainerEl.style.scrollBehavior = 'auto';
          const paragraphEl = readerContainerEl.querySelector(`[data-paragraph-index="${targetIndex}"]`);
          console.debug('[Reader Scroll Uncached] Target index:', targetIndex, 'Element found:', !!paragraphEl, 'Paragraphs in DOM:', readerContainerEl.querySelectorAll('[data-paragraph-index]').length);
          if (paragraphEl) {
            const containerHeight = readerContainerEl.clientHeight;
            const paragraphTop = paragraphEl.offsetTop;
            const paragraphHeight = paragraphEl.offsetHeight;
            const scrollTop = paragraphTop - (containerHeight / 2) + (paragraphHeight / 2);
            console.debug('[Reader Scroll Uncached] containerHeight:', containerHeight, 'paragraphTop:', paragraphTop, 'scrollTop:', scrollTop);
            readerContainerEl.scrollTop = Math.max(0, scrollTop);
          } else {
            console.warn('[Reader Scroll Uncached] Paragraph element not found for index:', targetIndex);
          }
          readerContainerEl.style.scrollBehavior = 'smooth';
        } else {
          console.warn('[Reader Scroll Uncached] Container not available');
        }
      });
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

      // Use AI-powered ResearcherAgent for approved+ users
      const useResearcher = canUseResearcher;
      for await (const event of search.analyzeStream(userMessage, { mode: 'hybrid', useResearcher })) {
        if (event.type === 'thinking') {
          // Conversational acknowledgment for complex queries
          // Display immediately as the message content
          stopTypewriter();
          messages = messages.map((m, i) =>
            i === assistantMsgIndex
              ? { ...m, content: event.message, isThinking: true }
              : m
          );
        } else if (event.type === 'progress') {
          // Progress updates during search (e.g., "Pass 1 complete...")
          // Could show in a status indicator or append to thinking message
          console.log('Search progress:', event.phase, event.message);
        } else if (event.type === 'plan') {
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
          // Capture analyzer timing if available
          if (event.timing?.analyzerTimeMs && researchPlan) {
            researchPlan = { ...researchPlan, analyzerTimeMs: event.timing.analyzerTimeMs };
          }
          // Update usage limits from response
          if (event.queryLimit) {
            updateUsage(event.queryLimit);
          }
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
      if (err?.status === 402) {
        errorMessage = 'You\'ve reached the search limit. Please log in to continue searching.';
      } else if (err?.message === 'Stream request failed') {
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
    return String(num ?? 0);
  }

  // Format number with commas (no abbreviation) - for countdowns
  function formatWithCommas(num) {
    return (num ?? 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

    // Extend <mark> tags to cover complete words (Meilisearch sometimes splits mid-word)
    // Pattern: word-chars before <mark>, content, </mark>, word-chars after
    result = result.replace(
      /(\w*)(<mark>)(.*?)(<\/mark>)(\w*)/gi,
      (match, before, openTag, content, closeTag, after) => {
        // If there are word characters before or after, extend the mark
        if (before || after) {
          return `${openTag}${before}${content}${after}${closeTag}`;
        }
        return match;
      }
    );

    // Parse with marked.parseInline to avoid wrapping in <p> tags
    // (outer element is already a <p>, so nested <p> would be invalid HTML)
    result = marked.parseInline(result);

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

  /**
   * Open the reader directly by document ID (for URL deep linking)
   * @param {string|number} documentId - The document ID to open
   */
  async function openReaderByDocumentId(documentId) {
    if (!documentId) return;

    readerAnimating = true;
    readerLoading = true;
    readerOpen = true;
    readerKeyPhrase = '';
    readerCoreTerms = [];

    try {
      // Fetch document details
      const docRes = await authenticatedFetch(`${API_BASE}/api/library/documents/${documentId}?paragraphs=true`);
      if (!docRes.ok) throw new Error('Document not found');
      const docData = await docRes.json();

      readerDocument = {
        id: documentId,
        title: docData.document?.title || 'Document',
        author: docData.document?.author || '',
        religion: docData.document?.religion || '',
        collection: docData.document?.collection || '',
        language: docData.document?.language || 'en'
      };

      readerParagraphs = (docData.paragraphs || []).map((p, i) => ({
        paragraph_index: p.paragraph_index ?? i,
        text: p.text || p.content || ''
      }));
      readerCurrentIndex = 0;
    } catch (err) {
      console.error('Failed to open document:', err);
      readerOpen = false;
    } finally {
      readerLoading = false;
      setTimeout(() => { readerAnimating = false; }, 400);
    }
  }

  onMount(async () => {
    initAuth();
    // Register conversation checker before initializing PWA
    // This allows PWA to auto-update only when no conversation is active
    setConversationChecker(() => messages.length > 0);
    initPWA();
    loadLibraryStats();

    // Load AI usage for admins (after short delay to ensure auth is ready)
    setTimeout(() => {
      loadAIUsageStatus();
    }, 1000);

    // Refresh AI usage status every 60 seconds for admins
    const aiUsageInterval = setInterval(() => {
      if (isAdmin) loadAIUsageStatus();
    }, 60_000);

    // Dedicated version check every 10 seconds (separate from stats polling which backs off)
    const versionCheckInterval = setInterval(async () => {
      try {
        const stats = await search.stats();
        if (stats?.serverVersion && stats.serverVersion !== CLIENT_VERSION) {
          // Version mismatch detected - trigger the full version check logic
          loadLibraryStats(true);
        }
      } catch (e) { /* silent fail - will retry on next poll */ }
    }, 10_000);

    initSession();
    inputEl?.focus();

    // Track user activity to reset polling backoff
    // Use passive listeners for better scroll performance
    window.addEventListener('mousemove', handleUserActivity, { passive: true });
    window.addEventListener('keydown', handleUserActivity, { passive: true });
    window.addEventListener('click', handleUserActivity, { passive: true });
    window.addEventListener('scroll', handleUserActivity, { passive: true });
    window.addEventListener('touchstart', handleUserActivity, { passive: true });

    // Stop polling when tab is hidden, resume when visible
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Capture referral code from URL if present
    captureReferral();

    // Check for document deep link: /?read=documentId
    const urlParams = new URLSearchParams(window.location.search);
    const readDocId = urlParams.get('read');
    if (readDocId) {
      // Remove the parameter from URL without reload
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      // Open the document in reader
      await openReaderByDocumentId(readDocId);
    }

    // Generate QR code with referral URL (using current user's ID)
    const userId = getUserId();
    qrCodeUrl = await generateQRCode(userId);

    // Cleanup on unmount
    return () => {
      stopRetryPolling();
      stopRefreshPolling();
      clearInterval(versionCheckInterval);
      // Remove activity listeners
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('scroll', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });
</script>

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
              <a href={readerSourceUrl} target="_blank" rel="noopener noreferrer" class="reader-source-link" title="Open source at {readerSourceDomain}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                {readerSourceDomain || 'View Source'}
              </a>
            {/if}
          </div>
        </div>

        <div class="reader-actions">
          <!-- Translation button (patron+ only, non-English documents only) -->
          {#if auth.isAuthenticated && ['patron', 'institutional', 'admin'].includes(auth.user?.tier) && readerDocument?.language && readerDocument.language !== 'en'}
            <button
              class="reader-action-btn"
              onclick={() => showTranslationView = !showTranslationView}
              title={showTranslationView ? 'Close translation' : 'Translate document'}
              aria-label={showTranslationView ? 'Close translation view' : 'Open translation view'}
              class:active={showTranslationView}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 5h12M9 3v2m1.048 3.5A7.5 7.5 0 0 0 19.5 15m0 0a7.5 7.5 0 0 1-7.5 7.5m7.5-7.5h-3m0 0l1.5-1.5m-1.5 1.5l1.5 1.5M5 12h3l1-3 2 6 1-3h3" />
              </svg>
            </button>
          {/if}
          {#if auth.isAuthenticated && ['patron', 'institutional', 'admin'].includes(auth.user?.tier)}
            <!-- Audio button (patron+ only) -->
            <button
              class="reader-action-btn"
              onclick={() => showAudioPlayer = !showAudioPlayer}
              title={showAudioPlayer ? 'Close audio player' : 'Listen to document'}
              aria-label={showAudioPlayer ? 'Close audio player' : 'Open audio player'}
              class:active={showAudioPlayer}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            </button>
          {/if}
          <!-- Edit button (admin only) -->
          {#if auth.isAuthenticated && ['admin', 'superadmin', 'editor'].includes(auth.user?.tier) && readerDocument?.id}
            <a
              href="/admin/edit?id={readerDocument.id}"
              class="reader-action-btn"
              title="Edit document"
              aria-label="Edit document"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </a>
          {/if}
          <button class="reader-close-btn" onclick={closeReader} aria-label="Close reader">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
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
          <div class="reader-paragraphs" class:rtl={readerIsRTL}>
            {#each readerParagraphs as paragraph, i}
              <div
                class="reader-paragraph-wrapper {paragraph.paragraph_index === readerCurrentIndex ? 'current' : ''}"
                class:rtl={readerIsRTL}
                data-paragraph-index={paragraph.paragraph_index}
                onclick={() => { readerCurrentIndex = paragraph.paragraph_index; }}
              >
                <span class="para-num">{paragraph.paragraph_index + 1}</span>
                <p class="reader-paragraph" dir={readerIsRTL ? 'rtl' : 'ltr'}>
                  {#if paragraph.paragraph_index === readerCurrentIndex && readerKeyPhrase}
                    {@html formatText(applyHighlighting(paragraph.text, readerKeyPhrase, readerCoreTerms))}
                  {:else}
                    {@html formatText(paragraph.text)}
                  {/if}
                </p>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Translation View Overlay -->
      {#if showTranslationView && readerDocument}
        <div class="translation-overlay">
          <TranslationView
            documentId={readerDocument.id}
            onClose={() => showTranslationView = false}
          />
        </div>
      {/if}

      <!-- Audio Player Overlay -->
      {#if showAudioPlayer && readerDocument}
        <div class="audio-overlay">
          <AudioPlayer
            documentId={readerDocument.id}
            documentTitle={readerDocument.title}
            onClose={() => showAudioPlayer = false}
          />
        </div>
      {/if}
    </div>
  </div>
{/if}

<div class="chat-container" role="application" aria-label="SifterSearch - Interfaith Library Search">
  <!-- Skip to main content link for keyboard users -->
  <a href="#main-content" class="skip-link">Skip to main content</a>

  <!-- Navigation Bar -->
  <NavBar currentPage="search" />

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
    {#if searchMode && (input.trim() || searchResults.length > 0 || searchLoading)}
      <!-- Quick Search Results - only show when actively searching -->
      <div class="quick-search-results">
        {#if searchLoading && searchResults.length === 0}
          <!-- Only show loading spinner when we have NO results yet -->
          <div class="text-muted text-sm flex items-center gap-2 p-4">
            <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
            Searching...
          </div>
        {:else if searchResults.length > 0}
          <!-- Show results with optional loading indicator -->
          <div class="text-xs text-muted px-4 py-2 flex items-center gap-2">
            {#if searchLoading}
              <svg class="w-3 h-3 animate-spin opacity-60" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
            {/if}
            {formatNumber(totalHits)} results in {searchTime}ms
          </div>
          {#each searchResults as result, i ((result.doc_id || result.document_id) + '-' + result.paragraph_index)}
            {@const text = result.highlightedExcerpt || result.excerpt || result.text || ''}
            {@const title = result.title || 'Untitled'}
            {@const author = result.author}
            {@const religion = result.religion || ''}
            {@const rawCollection = result.collection || ''}
            {@const collection = rawCollection.includes(' > ') ? rawCollection.split(' > ')[0] : rawCollection}
            {@const language = result.language || 'en'}
            {@const isRTL = ['ar', 'fa', 'he', 'ur'].includes(language)}

            <div
              class="source-card clickable"
              onclick={() => openReaderFromSearch(result)}
              onkeydown={(e) => e.key === 'Enter' && openReaderFromSearch(result)}
              role="button"
              tabindex="0"
              animate:flip={{ duration: 250 }}
              in:fade={{ duration: 150 }}
              out:fade={{ duration: 100 }}
            >
              <!-- Paper-like text area -->
              <div class="source-paper" class:rtl={isRTL}>
                <span class="para-num">{result.paragraph_index != null ? result.paragraph_index + 1 : ''}</span>
                <p class="source-text" dir={isRTL ? 'rtl' : 'ltr'}>{@html formatText(text)}</p>
                <!-- Copy to clipboard button -->
                <button
                  class="copy-btn"
                  class:copied={copiedResultId === (result.id || result.doc_id)}
                  onclick={(e) => copyResultToClipboard(e, result)}
                  title="Copy to clipboard"
                >
                  {#if copiedResultId === (result.id || result.doc_id)}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  {:else}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  {/if}
                </button>
              </div>

              <!-- Compact citation line - floated right -->
              <div class="citation-line">
                <span class="citation-meta">
                  {#if author}{author} — {/if}{title}
                </span>
              </div>
            </div>
          {/each}

          <!-- Load More button -->
          {#if hasMoreResults}
            <button
              class="load-more-btn"
              onclick={loadMoreResults}
              disabled={loadingMore}
            >
              {#if loadingMore}
                <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
                Loading...
              {:else}
                Load more ({totalHits - searchResults.length} remaining)
              {/if}
            </button>
          {/if}
        {:else}
          <div class="text-muted text-center py-8">No results found</div>
        {/if}
      </div>
    {:else if messages.length === 0}
      <div class="welcome-screen">
        <img src="/ocean.svg" alt="Ocean Library" class="welcome-logo" />
        <h2 class="welcome-title"><a href="https://oceanlibrary.com" target="_blank" rel="noopener" class="ocean-link">Ocean 2.0 Library</a> Manager with AI Research</h2>
        <p class="welcome-desc">
          {APP_DESCRIPTION}
        </p>

        <!-- Library Stats - always show with cached or default values -->
        <div class="stats-container">
          <div class="stats-card">
            {#if displayStats.serverVersion}
              <span class="version-pill">v{displayStats.serverVersion}</span>
            {/if}
            <h3 class="stats-title">Library Contents</h3>
            <!-- Row 1: Key metrics -->
            <div class="stats-grid">
              <div class="stat">
                <span class="stat-label">Religions</span>
                <span class="stat-value">{displayStats.religions || 0}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Collections</span>
                <span class="stat-value">{displayStats.collections || 0}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Documents</span>
                <span class="stat-value">{formatNumber(displayStats.totalDocuments)}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Paragraphs</span>
                <span class="stat-value">{formatNumber(displayStats.totalPassages)}</span>
              </div>
            </div>
            <!-- Religion tags with document counts -->
            {#if displayStats.religionCounts && Object.keys(displayStats.religionCounts).length > 0}
              <div class="religion-tags">
                {#each Object.entries(displayStats.religionCounts) as [religion, count]}
                  <span class="religion-tag">
                    {religion}
                    <span class="tag-count">{count}</span>
                  </span>
                {/each}
              </div>
            {/if}
              <!-- Import progress (current batch) -->
              {#if libraryStats?.importProgress}
                <div class="ingestion-progress importing">
                  <div class="ingestion-header">
                    <span class="ingestion-label">Importing documents</span>
                    <span class="ingestion-percent">{libraryStats.importProgress.percentComplete}%</span>
                  </div>
                  <div class="ingestion-bar">
                    <div class="ingestion-fill" style="width: {libraryStats.importProgress.percentComplete}%"></div>
                  </div>
                  <div class="ingestion-detail">
                    {formatNumber(libraryStats.importProgress.completed)} / {formatNumber(libraryStats.importProgress.total)} documents
                    {#if libraryStats.importProgress.failed > 0}
                      <span class="failed-count">({libraryStats.importProgress.failed} failed)</span>
                    {/if}
                  </div>
                </div>
              {/if}
              <!-- Ingestion progress (docs parsed vs total) -->
              {#if libraryStats?.ingestionProgress && libraryStats.ingestionProgress.percentComplete < 100}
                <div class="ingestion-progress ingesting">
                  <div class="ingestion-header">
                    <span class="ingestion-label">Content parsed</span>
                    <span class="ingestion-percent">{libraryStats.ingestionProgress.percentComplete}%</span>
                  </div>
                  <div class="ingestion-bar">
                    <div class="ingestion-fill" style="width: {libraryStats.ingestionProgress.percentComplete}%"></div>
                  </div>
                  <div class="ingestion-detail">
                    {formatNumber(libraryStats.ingestionProgress.docsWithContent)} / {formatNumber(libraryStats.ingestionProgress.totalDocs)} documents
                    {#if libraryStats.ingestionProgress.docsPending > 0}
                      <span class="pending-count">({libraryStats.ingestionProgress.docsPending} pending)</span>
                    {/if}
                  </div>
                </div>
              {/if}
              <!-- Meilisearch indexing progress - show when actively indexing -->
              {#if libraryStats?.indexingProgress?.percentComplete != null && libraryStats.indexingProgress.percentComplete < 100 && libraryStats.indexingProgress.totalWithContent > 0}
                <div class="ingestion-progress indexing">
                  <div class="ingestion-header">
                    <span class="ingestion-label">Indexed in search</span>
                    <span class="ingestion-percent">{libraryStats.indexingProgress.percentComplete}%</span>
                  </div>
                  <div class="ingestion-bar">
                    <div class="ingestion-fill" style="width: {libraryStats.indexingProgress.percentComplete}%"></div>
                  </div>
                  <div class="ingestion-detail">
                    {formatNumber(libraryStats.indexingProgress.indexed)} / {formatNumber(libraryStats.indexingProgress.totalWithContent)} documents
                  </div>
                </div>
              {/if}
            {#if serverOffline}
              <div class="stats-footer offline">
                <span class="offline-status">Server offline - showing cached data</span>
              </div>
            {/if}
              {#if libraryStats?.pipelineStatus && (libraryStats.pipelineStatus.ingestionQueuePending > 0 || libraryStats.pipelineStatus.paragraphsNeedingEmbeddings > 0 || libraryStats.pipelineStatus.paragraphsPendingSync > 0)}
                <div class="pipeline-status">
                  <div class="pipeline-header">
                    <svg class="pipeline-dot" fill="currentColor" viewBox="0 0 8 8">
                      <circle cx="4" cy="4" r="3" />
                    </svg>
                    <span>Processing Pipeline</span>
                  </div>
                  <div class="pipeline-items">
                    {#if libraryStats.pipelineStatus.ingestionQueuePending > 0}
                      <div class="pipeline-item">
                        <span class="pipeline-icon">📥</span>
                        <span class="pipeline-label">Ingestion Queue:</span>
                        <span class="pipeline-count">{formatWithCommas(libraryStats.pipelineStatus.ingestionQueuePending)} pending</span>
                      </div>
                    {/if}
                    {#if libraryStats.pipelineStatus.paragraphsNeedingEmbeddings > 0}
                      {@const uniqueNeeded = libraryStats.pipelineStatus.uniqueEmbeddingsNeeded || libraryStats.pipelineStatus.paragraphsNeedingEmbeddings}
                      {@const estimatedSeconds = Math.ceil(uniqueNeeded / 6)}
                      {@const hours = Math.floor(estimatedSeconds / 3600)}
                      {@const minutes = Math.floor((estimatedSeconds % 3600) / 60)}
                      {@const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
                      <div class="pipeline-item">
                        <span class="pipeline-icon">🔢</span>
                        <span class="pipeline-label">Embeddings:</span>
                        <span class="pipeline-count">{formatWithCommas(libraryStats.pipelineStatus.paragraphsNeedingEmbeddings)} needed, ~{timeStr} remaining</span>
                      </div>
                    {/if}
                    {#if libraryStats.pipelineStatus.paragraphsPendingSync > 0}
                      <div class="pipeline-item">
                        <span class="pipeline-icon">🔍</span>
                        <span class="pipeline-label">Search Index:</span>
                        <span class="pipeline-count">{formatWithCommas(libraryStats.pipelineStatus.paragraphsPendingSync)} pending sync</span>
                      </div>
                    {/if}
                    {#if libraryStats.pipelineStatus.oversizedSkipped > 0}
                      <div class="pipeline-item warning">
                        <span class="pipeline-icon">⚠️</span>
                        <span class="pipeline-label">Oversized:</span>
                        <span class="pipeline-count">{formatWithCommas(libraryStats.pipelineStatus.oversizedSkipped)} skipped (need re-ingestion)</span>
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
              {#if libraryStats?.translationProgress && (libraryStats.translationProgress.processing > 0 || libraryStats.translationProgress.pending > 0)}
                <div class="indexing-indicator translating">
                  <div class="indexing-header">
                    <svg class="indexing-dot" fill="currentColor" viewBox="0 0 8 8">
                      <circle cx="4" cy="4" r="3" />
                    </svg>
                    <span>Translating documents</span>
                  </div>
                  <div class="indexing-status">
                    {#if libraryStats.translationProgress.processing > 0}
                      <span class="status-item processing">{libraryStats.translationProgress.processing} translating</span>
                    {/if}
                    {#if libraryStats.translationProgress.pending > 0}
                      <span class="status-item pending">{libraryStats.translationProgress.pending} queued</span>
                    {/if}
                    {#if libraryStats.translationProgress.totalItems > 0}
                      <span class="status-item progress">{libraryStats.translationProgress.totalProgress}/{libraryStats.translationProgress.totalItems} paragraphs</span>
                    {/if}
                  </div>
                </div>
              {/if}
              <!-- Admin-only AI Usage Ticker (bottom of stats box) -->
              {#if isAdmin && aiUsageStatus}
                <div class="admin-ai-ticker">
                  {#if aiUsageStatus.paused}
                    <a href="/admin/ai-usage" class="ai-paused-alert">
                      <svg class="alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>AI Paused - ${aiUsageStatus.dailyLimit} limit exceeded</span>
                    </a>
                  {:else}
                    <a href="/admin/ai-usage" class="ai-cost-ticker">
                      <span class="ticker-label">AI 24h:</span>
                      <span class="ticker-value">${(aiUsageStatus.today?.cost || 0).toFixed(2)}</span>
                      {#if aiUsageStatus.topCallers?.length > 0}
                        {#each aiUsageStatus.topCallers as caller, i}
                          <span class="ticker-divider">|</span>
                          <span class="ticker-caller">{caller.caller}</span>
                          <span class="ticker-value">${(caller.cost || 0).toFixed(2)}</span>
                        {/each}
                      {/if}
                    </a>
                  {/if}
                </div>
              {/if}
          </div>
        </div>

        <div class="suggestions">
          {#each displayedSuggestions as suggestion}
            <button
              onclick={() => { input = suggestion; searchMode ? performQuickSearch() : sendMessage(); }}
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
                <details class="my-2 rounded-lg bg-[var(--surface-1-alpha)] border border-[var(--border-default)] text-sm">
                  <summary class="flex items-center gap-2 px-3 py-2 cursor-pointer text-[var(--text-muted)] font-medium list-none [&::-webkit-details-marker]:hidden">
                    <svg class="w-4 h-4 stroke-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="11" cy="11" r="8"/>
                      <path d="M21 21l-4.35-4.35"/>
                    </svg>
                    Research Strategy
                    <span class="px-2 py-0.5 rounded bg-[var(--accent-primary)] text-white text-xs font-semibold uppercase">{researchPlan.type}</span>
                    {#if researchPlan.cached}
                      <span class="px-2 py-0.5 rounded bg-green-500 text-white text-xs font-semibold uppercase" title="Served from cache">Cached</span>
                    {/if}
                    {#if researchPlan.twoPass}
                      <span class="px-2 py-0.5 rounded bg-amber-500 text-white text-xs font-semibold uppercase" title="Two-pass exhaustive search">2-Pass</span>
                    {/if}
                    {#if researchPlan.planningTimeMs || researchPlan.searchTimeMs || researchPlan.analyzerTimeMs}
                      <div class="ml-auto flex items-center gap-1.5 text-xs font-mono">
                        {#if researchPlan.planningTimeMs}
                          <span class="px-2 py-0.5 rounded bg-[var(--surface-elevated)] text-[var(--text-muted)]" title="AI planning time (creating search strategy)">
                            Plan: {formatTime(researchPlan.planningTimeMs)}
                          </span>
                        {/if}
                        {#if researchPlan.searchTimeMs}
                          <span class="px-2 py-0.5 rounded bg-[var(--surface-elevated)] text-[var(--text-muted)]" title="Search execution (embeddings + Meilisearch)">
                            Search: {formatTime(researchPlan.searchTimeMs)}
                          </span>
                        {/if}
                        {#if researchPlan.analyzerTimeMs}
                          <span class="px-2 py-0.5 rounded bg-[var(--surface-elevated)] text-[var(--text-muted)]" title="AI analysis, ranking, and highlighting">
                            Analyze: {formatTime(researchPlan.analyzerTimeMs)}
                          </span>
                        {/if}
                      </div>
                    {/if}
                  </summary>
                  <div class="p-3 flex flex-col gap-3 border-t border-[var(--border-default)]">
                    {#if researchPlan.reasoning}
                      <p class="text-[var(--text-secondary)] italic leading-relaxed">{researchPlan.reasoning}</p>
                    {/if}

                    {#if researchPlan.assumptions?.length > 0}
                      <div class="flex flex-col gap-1.5">
                        <span class="text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wide">Challenging assumptions:</span>
                        <ul class="m-0 pl-5 text-[var(--text-secondary)] text-[0.8125rem]">
                          {#each researchPlan.assumptions as assumption}
                            <li class="mb-1">{assumption}</li>
                          {/each}
                        </ul>
                      </div>
                    {/if}

                    {#if researchPlan.traditions?.length > 0}
                      <div class="flex flex-col gap-1.5">
                        <span class="text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wide">Traditions covered:</span>
                        <div class="flex flex-wrap gap-1.5">
                          {#each researchPlan.traditions as tradition}
                            <span class="px-2 py-0.5 rounded-full bg-[var(--accent-primary)] text-white text-xs opacity-90">{tradition}</span>
                          {/each}
                        </div>
                      </div>
                    {/if}

                    {#if researchPlan.queries?.length > 0}
                      <div class="flex flex-col gap-1.5">
                        <span class="text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wide">Search queries ({researchPlan.queries.length}):</span>
                        <div class="flex flex-col gap-2">
                          {#each researchPlan.queries as q, i}
                            <div class="bg-[var(--surface-elevated)] rounded-md px-3 py-2 border border-[var(--border-default)]">
                              <div class="flex items-center gap-2 flex-wrap">
                                <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--accent-primary)] text-white text-[0.6875rem] font-semibold shrink-0">{i + 1}</span>
                                <span class="text-[var(--text-primary)] font-medium flex-1">{q.query}</span>
                                <span class="px-1.5 py-0.5 rounded bg-[var(--surface-1-alpha)] text-[var(--text-muted)] text-[0.6875rem] uppercase">{q.mode}</span>
                                {#if q.angle && q.angle !== 'direct'}
                                  <span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[0.6875rem] italic">{q.angle}</span>
                                {/if}
                              </div>
                              {#if q.rationale}
                                <p class="mt-1.5 ml-7 text-[var(--text-muted)] text-[0.8125rem] italic">{q.rationale}</p>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      </div>
                    {/if}

                    {#if researchPlan.twoPass && researchPlan.pass2}
                      <div class="flex flex-col gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
                        <div class="flex items-center gap-2">
                          <span class="text-amber-700 dark:text-amber-400 text-xs font-semibold uppercase tracking-wide">Two-Pass Search</span>
                          <span class="text-[var(--text-muted)] text-xs">Pass 1: {researchPlan.pass1?.hits || 0} hits • Pass 2: {researchPlan.pass2?.hits || 0} new hits</span>
                        </div>
                        {#if researchPlan.pass2.gaps?.length > 0}
                          <div class="text-[0.8125rem]">
                            <span class="text-[var(--text-muted)]">Gaps identified:</span>
                            <span class="text-[var(--text-secondary)]">{researchPlan.pass2.gaps.join(', ')}</span>
                          </div>
                        {/if}
                        {#if researchPlan.pass2.reasoning}
                          <p class="text-[var(--text-secondary)] text-[0.8125rem] italic">{researchPlan.pass2.reasoning}</p>
                        {/if}
                      </div>
                    {/if}

                    {#if researchPlan.surprises?.length > 0}
                      <div class="flex flex-col gap-1.5">
                        <span class="text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wide">Watch for surprises:</span>
                        <ul class="m-0 pl-5 text-[var(--text-secondary)] text-[0.8125rem] [&>li::marker]:content-['⚡_']">
                          {#each researchPlan.surprises as surprise}
                            <li class="mb-1">{surprise}</li>
                          {/each}
                        </ul>
                      </div>
                    {/if}

                    {#if researchPlan.followUp?.length > 0}
                      <div class="flex flex-col gap-1.5">
                        <span class="text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wide">Suggested follow-ups:</span>
                        <div class="flex flex-wrap gap-1.5">
                          {#each researchPlan.followUp as followUpQuery}
                            <button
                              type="button"
                              class="px-2 py-1 rounded-full bg-[var(--surface-elevated)] text-[var(--text-secondary)] text-[0.8125rem] border border-[var(--border-default)] cursor-pointer hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] transition-colors"
                              onclick={() => { input = followUpQuery; handleSubmit(new Event('submit')); }}
                            >{followUpQuery}</button>
                          {/each}
                        </div>
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
                    {@const language = result.language || 'en'}
                    {@const isRTL = ['ar', 'fa', 'he', 'ur'].includes(language)}

                    <div class="source-card {expanded ? 'expanded' : 'collapsed'}" role="article">
                      <!-- Collapsed: single line with number, AI summary (or fallback), title, expand arrow -->
                      {#if !expanded}
                        <button class="source-summary-header" onclick={() => toggleResult(message.id || msgIndex, i)}>
                          <span class="source-num">{i + 1}</span>
                          <span class="source-summary-text">{summary || truncateAtSentence(plainText, 100)}</span>
                          <span class="source-summary-author">{author || 'Unknown'}</span>
                          <svg class="source-expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      {:else}
                        <!-- Expanded: full paper card view -->
                        <button class="source-collapse-btn px-3 py-2 sm:px-4" onclick={() => toggleResult(message.id || msgIndex, i)}>
                          <span class="source-num">{i + 1}</span>
                          <span class="source-summary-expanded">{summary || truncateAtSentence(plainText, 120)}</span>
                          <svg class="source-expand-icon open" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        <!-- Paper-like text area with off-white background -->
                        <div class="source-paper p-3 sm:p-4 sm:px-5" class:rtl={isRTL}>
                          <span class="para-num">{result.paragraph_index != null ? result.paragraph_index + 1 : ''}</span>
                          <p class="source-text" dir={isRTL ? 'rtl' : 'ltr'}>{@html formatText(highlightedText)}</p>
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
                    <span class="result-excerpt">{@html formatText(truncateAtSentence(text.replace(/<[^>]*>/g, ''), 150))}</span>
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
    <!-- QR code on the left (includes referral link) -->
    <a href={getReferralUrl(getUserId())} class="qr-link" title="Share SifterSearch" aria-label="QR code for sharing SifterSearch">
      <img src={qrCodeUrl || '/qr-siftersearch.svg'} alt="QR code for sharing siftersearch.com" class="qr-code" />
    </a>
    <!-- Input form with chat toggle and search button inside -->
    <form onsubmit={(e) => { e.preventDefault(); if (!searchMode) sendMessage(); }} class="input-form" aria-label="Search form">
      <label for="search-input" class="sr-only">{searchMode ? 'Quick search' : 'Search sacred texts'}</label>
      <div class="input-wrapper">
        <!-- Chat toggle for AI chat mode -->
        <button type="button" class="chat-toggle-btn {!searchMode ? 'active' : ''}" onclick={toggleSearchMode} title={searchMode ? 'Switch to AI Chat' : 'Switch to Quick Search'}>
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
        </button>
        <input
          id="search-input"
          bind:this={inputEl}
          bind:value={input}
          oninput={searchMode ? handleSearchInput : undefined}
          onkeydown={searchMode ? undefined : handleKeydown}
          placeholder={searchMode ? 'Type to search instantly...' : 'Search sacred texts...'}
          disabled={loading && !searchMode}
          class="search-input"
          type="search"
          autocomplete="off"
          aria-describedby="search-status"
        />
        {#if !searchMode}
          <button type="submit" disabled={!input.trim() || loading || !libraryConnected} aria-label={loading ? 'Searching...' : 'Search'} class="submit-btn">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        {/if}
      </div>
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

  .ocean-link {
    color: inherit;
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .ocean-link:hover {
    color: var(--accent-primary);
    text-decoration: underline;
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
    position: relative;
    background-color: light-dark(rgba(255, 255, 255, 0.35), rgba(30, 41, 59, 0.35));
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-default);
    backdrop-filter: blur(12px);
    box-shadow: 0 4px 12px light-dark(rgba(0,0,0,0.06), rgba(0,0,0,0.2));
  }

  .version-pill {
    position: absolute;
    top: -0.4rem;
    right: 0.75rem;
    font-size: 0.65rem;
    font-weight: 500;
    color: var(--text-muted);
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.25rem;
    padding: 0.1rem 0.35rem;
    font-family: monospace;
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
    color: var(--accent-primary-light);
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
    color: var(--text-secondary);
    text-align: center;
    display: flex;
    justify-content: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .stats-footer.offline {
    color: var(--error);
  }

  .stats-footer .offline-status {
    color: var(--error);
  }

  .server-version {
    color: var(--text-secondary);
    font-weight: 500;
  }

  /* Admin AI Usage Ticker */
  .admin-ai-ticker {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-default);
  }

  .ai-paused-alert {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: color-mix(in srgb, var(--error) 15%, transparent);
    border: 1px solid var(--error);
    border-radius: 0.5rem;
    color: var(--error);
    font-size: 0.8rem;
    font-weight: 600;
    text-decoration: none;
    justify-content: center;
    animation: pulse-border 2s ease-in-out infinite;
  }

  .ai-paused-alert:hover {
    background: color-mix(in srgb, var(--error) 25%, transparent);
  }

  .ai-paused-alert .alert-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  @keyframes pulse-border {
    0%, 100% { border-color: var(--error); }
    50% { border-color: color-mix(in srgb, var(--error) 50%, transparent); }
  }

  .ai-cost-ticker {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--text-muted);
    font-size: 0.75rem;
    text-decoration: none;
    justify-content: center;
  }

  .ai-cost-ticker:hover {
    color: var(--text-secondary);
  }

  .ticker-label {
    color: var(--text-muted);
    font-weight: 500;
  }

  .ticker-item {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }

  .ticker-period {
    color: var(--text-muted);
  }

  .ticker-caller {
    color: var(--text-secondary);
    font-size: 0.7rem;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ticker-value {
    color: var(--text-primary);
    font-weight: 600;
    font-family: monospace;
  }

  .ticker-divider {
    color: var(--border-default);
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

  .indexing-percent {
    margin-left: auto;
    font-size: 0.6875rem;
    color: var(--text-muted);
  }

  .indexing-bar {
    height: 4px;
    background: var(--surface-2);
    border-radius: 2px;
    margin-top: 0.5rem;
    overflow: hidden;
  }

  .indexing-fill {
    height: 100%;
    background: var(--warning);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .indexing-indicator.translating {
    color: var(--accent);
  }

  /* Pipeline status display */
  .pipeline-status {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-default);
    font-size: 0.9375rem;  /* 25% larger than 0.75rem */
  }

  .pipeline-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-primary);
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .pipeline-dot {
    width: 0.75rem;
    height: 0.75rem;
    color: var(--warning);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .pipeline-items {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding-left: 0.125rem;
  }

  .pipeline-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--text-secondary);
  }

  .pipeline-item.warning {
    color: var(--warning);
  }

  .pipeline-icon {
    font-size: 0.875rem;
    width: 1.25rem;
    text-align: center;
  }

  .pipeline-label {
    color: var(--text-primary);
    font-weight: 500;
  }

  .pipeline-count {
    color: var(--text-secondary);
  }

  /* Ingestion progress bar */
  .ingestion-progress {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-default);
  }

  .ingestion-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.375rem;
  }

  .ingestion-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .ingestion-percent {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent-primary-light);
  }

  .ingestion-bar {
    height: 0.375rem;
    background: var(--surface-2);
    border-radius: 0.1875rem;
    overflow: hidden;
  }

  .ingestion-fill {
    height: 100%;
    background: var(--accent-primary-light);
    border-radius: 0.1875rem;
    transition: width 0.3s ease;
  }

  .ingestion-detail {
    margin-top: 0.25rem;
    font-size: 0.6875rem;
    color: var(--text-muted);
    text-align: center;
  }

  .ingestion-detail .failed-count {
    color: var(--error);
    margin-left: 0.25rem;
  }

  /* Importing variant - slightly different color */
  .ingestion-progress.importing .ingestion-fill {
    background: var(--info);
  }

  /* Ingesting variant - shows content parsing progress */
  .ingestion-progress.ingesting .ingestion-fill {
    background: var(--warning);
  }

  .ingestion-detail .pending-count {
    color: var(--warning);
    margin-left: 0.25rem;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .stats-unavailable {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.5rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 0.75rem;
  }

  .disconnected-icon {
    color: #ef4444;
    animation: pulse-disconnect 2s ease-in-out infinite;
  }

  .disconnected-text {
    font-size: 0.9375rem;
    font-weight: 600;
    color: #ef4444;
  }

  .disconnected-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  @keyframes pulse-disconnect {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
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
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
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
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
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

  /* Quick Search Results Container */
  .quick-search-results {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.5rem;
    overflow-y: auto;
    flex: 1;
  }

  /* Inline result number for citation bar */
  .source-num-inline {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.25rem;
    height: 1.25rem;
    padding: 0 0.25rem;
    border-radius: 0.25rem;
    background-color: var(--accent-primary);
    color: white;
    font-size: 0.6875rem;
    font-weight: 600;
    margin-right: 0.5rem;
  }

  /* Source Card - Paper-like hit card design */
  .source-card {
    background-color: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    overflow: hidden;
    transition: box-shadow 0.15s, border-color 0.15s;
    /* Ensure card expands to fit content when in flex container */
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
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

  /* Clickable source card for quick search */
  .source-card.clickable {
    cursor: pointer;
    transition: box-shadow 0.15s, border-color 0.15s, transform 0.1s;
  }
  .source-card.clickable:hover {
    border-color: var(--accent-primary);
    box-shadow: 0 2px 8px light-dark(rgba(0,0,0,0.08), rgba(0,0,0,0.2));
    transform: translateY(-1px);
  }
  .source-card.clickable:active {
    transform: translateY(0);
  }

  /* Load More Button */
  .load-more-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.75rem 1rem;
    margin-top: 0.5rem;
    background-color: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
  }
  .load-more-btn:hover:not(:disabled) {
    background-color: var(--surface-3);
    border-color: var(--border-strong, var(--border-default));
  }
  .load-more-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  /* Compact citation line - floated right */
  .citation-line {
    display: flex;
    align-items: center;
    justify-content: flex-end; /* Float content to right */
    padding: 0.25rem 0.75rem;
    background-color: #f0ece3; /* Slightly darker than card cream #faf8f3 */
    font-size: 0.75rem;
    color: #4a4a4a; /* Dark readable text on light background */
  }

  .citation-meta {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  /* Keep citation-arrow for AI chat results that still use it */
  .citation-arrow {
    flex-shrink: 0;
    width: 0.875rem;
    height: 0.875rem;
    color: #9ca3af; /* Muted arrow on light attribution bar */
    transition: color 0.15s;
  }
  .source-card.clickable:hover .citation-arrow {
    color: var(--accent-primary);
    /* no transform - prevents layout shift */
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

  .source-summary-author {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
    font-style: italic;
    padding-left: 0.5rem;
    border-left: 1px solid var(--border-subtle);
    white-space: nowrap;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
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
    position: relative;
    padding: 0.875rem 1rem 0.75rem 0.5rem; /* generous top/right/bottom padding */
    user-select: none; /* No text selection - use copy button */
    -webkit-user-select: none;
    cursor: pointer;
  }

  /* Floating paragraph number */
  .para-num {
    position: absolute;
    left: 0.5rem;
    top: 0.875rem;
    font-size: 0.65rem;
    font-family: system-ui, -apple-system, sans-serif;
    color: #9ca3af;
    user-select: none;
    pointer-events: none;
  }

  /* Copy to clipboard button - always visible */
  .copy-btn {
    position: absolute;
    right: 0.5rem;
    top: 0.5rem;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0.3rem;
    background: rgba(255, 255, 255, 0.8);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.375rem;
    color: #6b7280;
    cursor: pointer;
    transition: color 0.15s, background-color 0.15s, border-color 0.15s;
  }
  .copy-btn:hover {
    color: #374151;
    background-color: #ffffff;
    border-color: rgba(0, 0, 0, 0.2);
  }
  .copy-btn.copied {
    color: #16a34a;
    background-color: #ecfdf5;
    border-color: #16a34a;
  }

  .source-text {
    font-family: 'Amiri', Georgia, 'Times New Roman', serif;
    font-size: 1.25rem;
    line-height: 1.65;
    color: #1a1a1a; /* Always dark - displays on light cream background */
    margin: 0;
    margin-left: 2.5rem; /* Space for 4-digit paragraph numbers */
    margin-right: 2rem; /* Right space for copy button */
    user-select: none; /* No text selection - use copy button */
    -webkit-user-select: none;
    cursor: pointer; /* Indicates clickable card */
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
    font-family: 'Amiri', Georgia, serif;
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
    font-family: 'Amiri', Georgia, serif;
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
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--border-default);
    background-color: var(--surface-0-alpha);
    backdrop-filter: blur(8px);
    position: relative;
  }

  .qr-link {
    flex-shrink: 0;
    position: absolute;
    left: 1rem;
    z-index: 1;
    margin-top: -1.5rem; /* Overflow above the input bar */
  }

  .qr-code {
    width: 4rem;
    height: 4rem;
    border-radius: 0.5rem;
    opacity: 0.9;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    background: white;
    padding: 0.25rem;
  }

  .qr-link:hover .qr-code {
    opacity: 1;
    transform: scale(1.05);
  }

  .input-form {
    flex: 1;
    min-width: 0;
    max-width: 600px;
    margin: 0 auto; /* Center the form */
    margin-left: 5.5rem; /* Hard margin for QR code on left */
  }

  @media (min-width: 640px) {
    .input-form {
      margin-left: auto; /* Reset to centered on larger screens */
    }
  }

  /* Input wrapper - contains input and search button */
  .input-wrapper {
    display: flex;
    align-items: center;
    background-color: light-dark(rgba(255, 255, 255, 0.95), rgba(30, 41, 59, 0.9));
    border: 1px solid light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.2));
    border-radius: 0.75rem;
    overflow: hidden;
    transition: border-color 0.15s, box-shadow 0.15s;
    backdrop-filter: blur(12px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .input-wrapper:focus-within {
    border-color: var(--input-border-focus);
    box-shadow: 0 2px 12px rgba(7, 89, 133, 0.2);
  }

  /* Chat toggle button inside input */
  .chat-toggle-btn {
    padding: 0.5rem 0.625rem;
    margin: 0.375rem;
    color: var(--text-secondary);
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.08));
    border: 1px solid light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.15));
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .chat-toggle-btn:hover {
    color: var(--accent-primary);
    background-color: light-dark(rgba(7, 89, 133, 0.1), rgba(14, 165, 233, 0.15));
    border-color: var(--accent-primary);
  }
  .chat-toggle-btn.active {
    color: white;
    background-color: var(--accent-primary);
    border-color: var(--accent-primary);
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
    font-family: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
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

  .reader-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .reader-action-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    color: #666;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .reader-action-btn:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #1a1a1a;
  }

  .reader-action-btn.active {
    background: color-mix(in srgb, var(--accent-tertiary) 15%, transparent);
    color: var(--accent-tertiary);
    border-color: var(--accent-tertiary);
  }

  .translation-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--surface-0);
    z-index: 10;
    animation: slideIn 0.3s ease;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .audio-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--surface-0);
    z-index: 10;
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(100%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
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
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    transition: background-color 0.2s ease;
  }

  .reader-paragraph-wrapper:hover {
    background-color: rgba(0, 0, 0, 0.02);
  }

  /* Current/active paragraph - the one user clicked "Read More" on */
  .reader-paragraph-wrapper.current {
    background: linear-gradient(135deg, rgba(254, 249, 195, 0.4) 0%, rgba(254, 243, 199, 0.3) 100%);
    border-left: 3px solid #eab308;
    margin-left: -3px;
  }

  .reader-paragraph-wrapper .para-num {
    position: absolute;
    left: -2.5rem;
    top: 0.75rem;
  }

  .reader-paragraph {
    font-family: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
    font-size: 1.0625rem;
    line-height: 1.65;
    color: #1a1a1a;
    margin: 0;
    /* No special padding/border - match source-paper text style */
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
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

  /* RTL support for Arabic, Farsi, Hebrew, Urdu */
  .reader-paragraphs.rtl {
    padding-left: 0;
    padding-right: 2rem;
  }

  .reader-paragraph-wrapper.rtl {
    text-align: right;
  }

  .reader-paragraph-wrapper.rtl .para-num {
    left: auto;
    right: -2.5rem;
    text-align: left;
  }

  .reader-paragraph-wrapper.rtl.current {
    border-left: none;
    border-right: 3px solid #eab308;
    margin-left: 0;
    margin-right: -3px;
  }

  /* RTL text styling - Amiri for Arabic/Persian */
  [dir="rtl"] {
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1.125rem; /* Slightly larger for Arabic readability */
    line-height: 1.85;
  }

  /* RTL support for source paper in hit results */
  .source-paper.rtl {
    flex-direction: row-reverse;
  }

  .source-paper.rtl .para-num {
    left: auto;
    right: 0.75rem;
  }

  .source-paper.rtl .source-text {
    margin-left: 0;
    margin-right: 1.5rem;
    text-align: right;
    line-height: 1.5;
  }

  /* Inline agent badges for Meet the Team section */
  .inline-agent {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.1rem 0.4rem 0.1rem 0.25rem;
    border-radius: 1rem;
    font-size: 0.9em;
    white-space: nowrap;
    text-decoration: none;
    transition: all 0.15s;
  }

  .inline-agent:hover {
    transform: translateY(-1px);
    filter: brightness(1.1);
  }

  .inline-icon {
    width: 0.9rem;
    height: 0.9rem;
    flex-shrink: 0;
  }

  .inline-agent.sifter {
    background-color: color-mix(in srgb, var(--accent-primary) 15%, transparent);
    color: var(--accent-primary);
  }

  .inline-agent.researcher {
    background-color: color-mix(in srgb, var(--accent-secondary) 15%, transparent);
    color: var(--accent-secondary);
  }

  .inline-agent.analyzer {
    background-color: color-mix(in srgb, var(--accent-tertiary) 15%, transparent);
    color: var(--accent-tertiary);
  }

  .inline-agent.translator {
    background-color: color-mix(in srgb, var(--warning) 15%, transparent);
    color: var(--warning);
  }

  .inline-agent.narrator {
    background-color: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }

  .inline-agent.memory {
    background-color: color-mix(in srgb, var(--info) 15%, transparent);
    color: var(--info);
  }

  .inline-agent.librarian {
    background-color: color-mix(in srgb, #8B4513 15%, transparent);
    color: #8B4513;
  }

  .inline-agent.transcriber {
    background-color: color-mix(in srgb, #2E8B57 15%, transparent);
    color: #2E8B57;
  }

</style>
