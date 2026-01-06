<script>
  import { createEventDispatcher } from 'svelte';
  import BilingualView from './BilingualView.svelte';
  import { authenticatedFetch } from '../../lib/api.js';

  let { documents = [], selectedId = null, isAdmin = false } = $props();

  /**
   * Generate a URL-safe slug from a string (for religion/collection paths)
   * Matches the server-side slugifyPath function
   */
  function slugifyPath(str) {
    if (!str) return '';
    // Diacritics mapping
    const diacritics = {
      'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'ā': 'a',
      'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e', 'ē': 'e',
      'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i', 'ī': 'i',
      'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'ō': 'o',
      'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u', 'ū': 'u',
      'ñ': 'n', 'ç': 'c',
      'Á': 'a', 'À': 'a', 'Ä': 'a', 'Â': 'a', 'Ā': 'a',
      'É': 'e', 'È': 'e', 'Ë': 'e', 'Ê': 'e', 'Ē': 'e',
      'Í': 'i', 'Ì': 'i', 'Ï': 'i', 'Î': 'i', 'Ī': 'i',
      'Ó': 'o', 'Ò': 'o', 'Ö': 'o', 'Ô': 'o', 'Ō': 'o',
      'Ú': 'u', 'Ù': 'u', 'Ü': 'u', 'Û': 'u', 'Ū': 'u',
      'Ñ': 'n', 'Ç': 'c'
    };
    return str
      .toLowerCase()
      .split('').map(c => diacritics[c] || c).join('')
      .replace(/[''`']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');
  }

  /**
   * Generate a document slug from title/filename + language
   * Matches server-side generateDocSlug function
   */
  function generateDocSlug(doc) {
    // Use title if available, otherwise filename without extension
    let base = doc.title;
    if (!base && doc.filename) {
      base = doc.filename.replace(/\.[^.]+$/, '');
    }
    if (!base) return '';

    const slug = slugifyPath(base);

    // Add language suffix for non-English documents
    if (doc.language && doc.language !== 'en') {
      return `${slug}_${doc.language}`;
    }
    return slug;
  }

  /**
   * Get the semantic URL for a document
   */
  function getDocumentUrl(doc) {
    const docSlug = generateDocSlug(doc);
    if (!docSlug || !doc.religion || !doc.collection) {
      // Fallback to query param style if no slug
      return `/library/view?doc=${doc.id}`;
    }
    return `/library/${slugifyPath(doc.religion)}/${slugifyPath(doc.collection)}/${docSlug}`;
  }

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  const dispatch = createEventDispatcher();

  let expandedDocId = $state(null);
  let expandedContent = $state(null);
  let bilingualContent = $state(null);
  let loadingContent = $state(false);
  let translating = $state(null); // Document ID being translated
  let activeJobs = $state(new Map()); // docId → jobId for active translation jobs
  let pollingInterval = $state(null);


  // RTL languages that need special handling
  const RTL_LANGUAGES = ['ar', 'fa', 'he', 'ur'];

  // Language display names
  const LANG_NAMES = {
    en: 'English', ar: 'Arabic', fa: 'Persian', he: 'Hebrew', ur: 'Urdu',
    es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese'
  };

  function toggleDocument(doc) {
    if (expandedDocId === doc.id) {
      expandedDocId = null;
      expandedContent = null;
      bilingualContent = null;
    } else {
      expandedDocId = doc.id;
      expandedContent = null;
      bilingualContent = null;
      loadDocumentContent(doc);
    }
    dispatch('select', doc);
  }

  async function loadDocumentContent(doc) {
    loadingContent = true;
    try {
      // For non-English documents, try bilingual endpoint first
      const isNonEnglish = doc.language && doc.language !== 'en';

      if (isNonEnglish) {
        const bilingualRes = await authenticatedFetch(`${API_BASE}/api/library/documents/${doc.id}/bilingual?limit=100`);
        if (bilingualRes.ok) {
          const data = await bilingualRes.json();
          // Only use bilingual if it has paragraphs, otherwise fall back
          if (data.paragraphs?.length > 0) {
            bilingualContent = data;
            loadingContent = false;
            return;
          }
        }
      }

      // Fallback to standard content
      const res = await authenticatedFetch(`${API_BASE}/api/library/documents/${doc.id}?paragraphs=true`);
      if (!res.ok) throw new Error('Failed to load content');
      expandedContent = await res.json();
    } catch (err) {
      expandedContent = { error: err.message };
    } finally {
      loadingContent = false;
    }
  }

  function isRTL(language) {
    return RTL_LANGUAGES.includes(language);
  }


  function getLangName(code) {
    return LANG_NAMES[code] || code?.toUpperCase() || '';
  }

  // Track which documents have translation stats loaded
  let docTranslationStats = $state({}); // doc.id → { translated: n, total: n }
  let loadingStats = $state({}); // doc.id → true if loading

  // Load translation stats for non-English docs when documents change
  $effect(() => {
    // Debug: log all documents with their languages
    const nonEnglish = documents.filter(d => d.language && d.language !== 'en');
    console.log('[TranslationStats] Effect triggered', {
      totalDocs: documents.length,
      nonEnglishCount: nonEnglish.length,
      sampleLanguages: documents.slice(0, 5).map(d => ({ id: d.id, title: d.title?.slice(0, 20), lang: d.language })),
      statsLoaded: Object.keys(docTranslationStats).length
    });

    // Find non-English docs that need stats loaded
    const docsNeedingStats = documents.filter(doc =>
      doc.language && doc.language !== 'en' &&
      !docTranslationStats[doc.id] &&
      !loadingStats[doc.id]
    );

    if (docsNeedingStats.length > 0) {
      console.log('[TranslationStats] Loading stats for:', docsNeedingStats.slice(0, 10).map(d => ({
        id: d.id, title: d.title?.slice(0, 20), lang: d.language
      })));
      // Load stats for each (limit to first 10 to avoid overwhelming API)
      docsNeedingStats.slice(0, 10).forEach(doc => {
        loadTranslationStats(doc);
      });
    }
  });

  // Load translation stats for a single doc
  async function loadTranslationStats(doc) {
    if (!doc.language || doc.language === 'en' || docTranslationStats[doc.id] || loadingStats[doc.id]) {
      return;
    }
    loadingStats = { ...loadingStats, [doc.id]: true };
    try {
      // Fetch translation stats directly
      const url = `${API_BASE}/api/library/documents/${doc.id}/translation-stats`;
      console.log('[TranslationStats] Fetching:', url, 'for doc:', doc.title);
      const statsRes = await authenticatedFetch(url);
      if (statsRes.ok) {
        const stats = await statsRes.json();
        console.log('[TranslationStats] Response for', doc.id, ':', stats);
        docTranslationStats = {
          ...docTranslationStats,
          [doc.id]: {
            translated: stats.translated || 0,
            total: stats.total || 0
          }
        };
      } else {
        console.warn('[TranslationStats] Failed for', doc.id, '- status:', statsRes.status);
        // Mark as checked but no stats available
        docTranslationStats = { ...docTranslationStats, [doc.id]: { translated: 0, total: 0 } };
      }
    } catch (err) {
      console.error('[TranslationStats] Error for', doc.id, ':', err);
      // Mark as checked to prevent retry loops
      docTranslationStats = { ...docTranslationStats, [doc.id]: { translated: 0, total: 0 } };
    } finally {
      const { [doc.id]: _, ...rest } = loadingStats;
      loadingStats = rest;
    }
  }

  // Get translation percentage for a doc
  function getTranslationPercent(docId) {
    const stats = docTranslationStats[docId];
    console.log('[TranslationStats] getTranslationPercent for', docId, '→ stats:', stats);
    if (!stats || !stats.total) return null;
    const percent = Math.round((stats.translated / stats.total) * 100);
    console.log('[TranslationStats] Returning percent:', percent);
    return percent;
  }


  // Queue document for translation (background job)
  async function requestTranslation(docId) {
    translating = docId;
    try {
      const res = await authenticatedFetch(`${API_BASE}/api/library/documents/${docId}/queue-translation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to queue translation');
      }

      const data = await res.json();

      // Update local translation stats
      if (data.total) {
        docTranslationStats = {
          ...docTranslationStats,
          [docId]: {
            translated: data.progress || 0,
            total: data.total
          }
        };
      }

      // Track active job for polling
      if (data.jobId && data.status !== 'completed') {
        activeJobs = new Map(activeJobs).set(docId, data.jobId);
        startPolling();
      }

      console.log('Translation queued:', data);
    } catch (err) {
      console.error('Translation queue error:', err);
      alert(`Failed to queue translation: ${err.message}`);
    } finally {
      translating = null;
    }
  }

  // Poll for translation job status
  function startPolling() {
    if (pollingInterval) return; // Already polling

    pollingInterval = setInterval(async () => {
      if (activeJobs.size === 0) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        return;
      }

      // Check status for each active job
      for (const [docId, _jobId] of activeJobs) {
        try {
          const res = await authenticatedFetch(`${API_BASE}/api/library/documents/${docId}/translation-status`);
          if (res.ok) {
            const status = await res.json();

            // Update stats
            if (status.stats) {
              docTranslationStats = {
                ...docTranslationStats,
                [docId]: {
                  translated: status.stats.translated || 0,
                  total: status.stats.total || 0
                }
              };
            }

            // Remove from active jobs if completed or failed
            if (!status.job || status.job.status === 'completed' || status.job.status === 'failed') {
              const newJobs = new Map(activeJobs);
              newJobs.delete(docId);
              activeJobs = newJobs;
            }
          }
        } catch (err) {
          console.error('Polling error for', docId, err);
        }
      }
    }, 3000); // Poll every 3 seconds
  }

  // Cleanup polling on component destroy
  import { onDestroy } from 'svelte';
  onDestroy(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
  });

</script>

<div class="flex flex-col gap-1 w-full">
  {#each documents as doc (doc.id)}
    {@const isExpanded = expandedDocId === doc.id}
    {@const langName = getLangName(doc.language)}
    {@const isNonEnglish = doc.language && doc.language !== 'en'}
    {@const hasTranslations = isExpanded && bilingualContent?.paragraphs?.some(p => p.translation)}
    {@const docLang = bilingualContent?.document?.language || expandedContent?.document?.language || doc.language}
    {@const needsTranslation = isExpanded && docLang && docLang !== 'en' && !hasTranslations}
    {@const docStats = docTranslationStats[doc.id]}
    {@const translationPercent = docStats && docStats.total > 0 ? Math.round((docStats.translated / docStats.total) * 100) : null}
    {@const statsLoading = !!loadingStats[doc.id]}

    <div class="group border rounded-lg overflow-hidden transition-colors
                {isExpanded ? 'border-accent' : 'border-border-subtle hover:border-border'}">
      <!-- Title row -->
      <div
        class="w-full flex items-center gap-2 py-2.5 px-3 transition-colors
               {isExpanded ? 'bg-accent/10 border-b border-border-subtle' : 'bg-surface-1 hover:bg-surface-2'}"
      >
        <button
          class="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
          onclick={() => toggleDocument(doc)}
        >
          <span class="text-[0.625rem] text-muted w-4 shrink-0">{isExpanded ? '▼' : '▶'}</span>
          <div class="flex-1 min-w-0 flex items-baseline gap-2">
            <span class="text-sm font-medium text-primary truncate">{doc.title || 'Untitled'}</span>
            {#if doc.author}
              <span class="text-xs text-secondary shrink-0">{doc.author}</span>
            {/if}
          </div>
        </button>
        <div class="flex items-center gap-1.5 shrink-0">
          <!-- Language + Translation compound pill -->
          {#if langName && langName !== 'English'}
            <div class="inline-flex items-center rounded-sm overflow-hidden text-[0.6875rem] font-semibold border border-accent/40">
              <!-- Language section (left) -->
              <span class="px-2 py-0.5 bg-accent text-white">{langName}</span>

              <!-- Translation action/progress section (right) -->
              {#if statsLoading}
                <span class="px-2 py-0.5 bg-surface-1 text-primary flex items-center">
                  <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
                </span>
              {:else if translating === doc.id || activeJobs.has(doc.id)}
                <!-- Translating: show spinner + percent -->
                <span class="px-2 py-0.5 bg-warning text-white flex items-center gap-1">
                  <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
                  <span>{translationPercent ?? 0}%</span>
                </span>
              {:else if translationPercent === 100}
                <!-- Complete: show checkmark + 100% -->
                <span class="px-2 py-0.5 bg-success text-white flex items-center gap-1">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>100%</span>
                </span>
              {:else if translationPercent !== null && translationPercent > 0}
                <!-- Partially translated: show progress -->
                {#if isAdmin}
                  <button
                    onclick={(e) => { e.stopPropagation(); requestTranslation(doc.id); }}
                    class="px-2 py-0.5 bg-info/20 text-info hover:bg-info hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                    title="Continue translation"
                  >
                    <span>{translationPercent}%</span>
                  </button>
                {:else}
                  <span class="px-2 py-0.5 bg-info/20 text-info">{translationPercent}%</span>
                {/if}
              {:else if docStats}
                <!-- Stats loaded but 0% translated -->
                {#if isAdmin}
                  <button
                    onclick={(e) => { e.stopPropagation(); requestTranslation(doc.id); }}
                    class="px-2 py-0.5 bg-warning/20 text-warning hover:bg-warning hover:text-white transition-colors cursor-pointer"
                    title="Start translation (0%)"
                  >0%</button>
                {:else}
                  <span class="px-2 py-0.5 bg-warning/20 text-warning">0%</span>
                {/if}
              {:else if isAdmin}
                <!-- Not translated: admin can start translation -->
                <button
                  onclick={(e) => { e.stopPropagation(); requestTranslation(doc.id); }}
                  class="px-2 py-0.5 bg-surface-1 text-muted hover:bg-accent hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                  title="Translate to English"
                >
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>
                  </svg>
                </button>
              {:else}
                <!-- Not translated: show indicator for non-admins -->
                <span class="px-2 py-0.5 bg-surface-1 text-muted text-[0.625rem]">—</span>
              {/if}
            </div>
          {/if}

          {#if isExpanded}
            {#if isAdmin && (expandedContent?.assets?.length > 0 || bilingualContent?.document)}
              {@const originalFile = expandedContent?.assets?.find(a => a.asset_type === 'original')}
              {#if originalFile?.storage_url}
                <a
                  href={originalFile.storage_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="p-1.5 text-muted hover:text-accent rounded transition-colors cursor-pointer"
                  title="Edit source file"
                  onclick={(e) => e.stopPropagation()}
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              {/if}
            {/if}
          {/if}
          <!-- Edit button - admin only, visible on hover or when expanded -->
          {#if isAdmin}
            <a
              class="p-1.5 text-muted hover:text-accent rounded transition-all cursor-pointer
                     {isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}"
              href="/admin/edit?id={doc.id}"
              target="_blank"
              rel="noopener"
              onclick={(e) => e.stopPropagation()}
              title="Edit document"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </a>
          {/if}
          <!-- Open in new tab button - visible on hover or when expanded -->
          <a
            class="p-1.5 text-muted hover:text-accent rounded transition-all cursor-pointer
                   {isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}"
            href={getDocumentUrl(doc)}
            target="_blank"
            rel="noopener"
            onclick={(e) => e.stopPropagation()}
            title="Open in new tab"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </div>

      <!-- Expanded content -->
      {#if isExpanded}
        <div class="bg-surface-0 overflow-hidden relative">
          <!-- Content area -->
          <div>
            {#if loadingContent}
              <div class="flex items-center gap-2 py-4 px-3 text-muted text-sm">
                <span class="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin"></span>
                Loading content...
              </div>
            {:else if expandedContent?.error}
              <div class="p-3 bg-error/10 text-error rounded text-sm">Failed to load: {expandedContent.error}</div>
            {:else if bilingualContent}
              <BilingualView
                paragraphs={bilingualContent.paragraphs}
                isRTL={bilingualContent.document?.isRTL || isRTL(bilingualContent.document?.language)}
                maxHeight="300px"
                loading={loadingContent}
              />
            {:else if expandedContent}
              <div class="paper-content">
                <div class="paper-scroll" style="max-height: 300px">
                  {#if expandedContent.paragraphs?.length > 0}
                    {#each expandedContent.paragraphs as para, i}
                      {@const docLang = expandedContent.document?.language}
                      <div class="paper-paragraph" class:rtl={isRTL(docLang)}>
                        <span class="para-num">{i + 1}</span>
                        <p
                          class="para-text"
                          dir={isRTL(docLang) ? 'rtl' : 'ltr'}
                        >{para.text || para.content || ''}</p>
                      </div>
                    {/each}
                  {:else}
                    <p class="empty-text">No content available</p>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
          {#if isAdmin && doc.authority}
            <div class="absolute bottom-1 right-2 text-[0.625rem] px-1.5 py-0.5 rounded bg-black/50 text-white/70" title="Authority score">
              Authority: {doc.authority}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  /* Paper-like content area */
  .paper-content {
    width: 100%;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 0.5rem;
    background: #faf8f3;
    overflow: hidden;
    max-width: 100%;
  }

  .paper-scroll {
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1rem 1.25rem;
  }

  .paper-paragraph {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  .paper-paragraph:last-child {
    border-bottom: none;
  }

  .paper-paragraph:hover {
    background: rgba(0, 0, 0, 0.02);
    margin: 0 -0.5rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    border-radius: 0.25rem;
  }

  .paper-paragraph.rtl {
    flex-direction: row-reverse;
  }

  .para-num {
    flex-shrink: 0;
    width: 1.5rem;
    font-family: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
    font-size: 0.6875rem;
    color: #999;
    text-align: right;
    padding-top: 0.25rem;
  }

  .paper-paragraph.rtl .para-num {
    text-align: left;
    font-family: 'Amiri', 'Traditional Arabic', serif;
  }

  .para-text {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-family: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
    font-size: 0.9375rem;
    line-height: 1.65;
    color: #1a1a1a;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .empty-text {
    font-style: italic;
    color: #888;
    font-size: 0.875rem;
  }

  /* RTL text styling */
  [dir="rtl"] {
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1.0625rem;
    line-height: 1.8;
  }
</style>
