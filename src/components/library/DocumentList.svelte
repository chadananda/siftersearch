<script>
  import { createEventDispatcher } from 'svelte';
  import BilingualView from './BilingualView.svelte';
  import ReaderModal from '../common/ReaderModal.svelte';
  import { getAccessToken } from '../../lib/api.js';

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
   * Get the semantic URL for a document
   */
  function getDocumentUrl(doc) {
    if (!doc.slug || !doc.religion || !doc.collection) {
      // Fallback to query param style if no slug
      return `/library/view?doc=${doc.id}`;
    }
    return `/library/${slugifyPath(doc.religion)}/${slugifyPath(doc.collection)}/${doc.slug}`;
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

  // Fullscreen modal state
  let modalOpen = $state(false);
  let modalDoc = $state(null);
  let modalParagraphs = $state([]);
  let modalBilingual = $state(null);
  let modalLoading = $state(false);
  let modalSourceUrl = $state(null);

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
        const bilingualRes = await fetch(`${API_BASE}/api/library/documents/${doc.id}/bilingual?limit=100`);
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
      const res = await fetch(`${API_BASE}/api/library/documents/${doc.id}?paragraphs=true`);
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
  let docTranslationStats = $state(new Map()); // doc.id → { translated: n, total: n }
  let loadingStats = $state(new Set());

  // Load translation stats for non-English docs
  async function loadTranslationStats(doc) {
    if (!doc.language || doc.language === 'en' || docTranslationStats.has(doc.id) || loadingStats.has(doc.id)) {
      return;
    }
    loadingStats = new Set([...loadingStats, doc.id]);
    try {
      const res = await fetch(`${API_BASE}/api/library/documents/${doc.id}/bilingual?limit=1`);
      if (res.ok) {
        const data = await res.json();
        const total = data.total || 0;
        const translated = data.paragraphs?.filter(p => p.translation)?.length || 0;
        // Get full stats by fetching all paragraphs counts
        const statsRes = await fetch(`${API_BASE}/api/library/documents/${doc.id}/translation-stats`);
        if (statsRes.ok) {
          const stats = await statsRes.json();
          docTranslationStats = new Map(docTranslationStats).set(doc.id, stats);
        } else {
          // Fallback: estimate based on initial data
          docTranslationStats = new Map(docTranslationStats).set(doc.id, { translated: 0, total });
        }
      }
    } catch {
      // Ignore errors
    } finally {
      const newSet = new Set(loadingStats);
      newSet.delete(doc.id);
      loadingStats = newSet;
    }
  }

  // Get translation percentage for a doc
  function getTranslationPercent(docId) {
    const stats = docTranslationStats.get(docId);
    if (!stats || !stats.total) return null;
    return Math.round((stats.translated / stats.total) * 100);
  }

  // Svelte action to load translation stats when element mounts
  function loadStatsOnMount(node, { doc }) {
    loadTranslationStats(doc);
    return {
      destroy() {}
    };
  }

  async function openReader(doc, autoTranslate = false) {
    modalDoc = {
      id: doc.id,
      title: doc.title,
      author: doc.author,
      religion: doc.religion,
      collection: doc.collection,
      language: doc.language || 'en',
      autoTranslate  // Flag to auto-start translation
    };
    modalOpen = true;
    modalLoading = true;
    modalParagraphs = [];
    modalBilingual = null;
    modalSourceUrl = null;

    try {
      const isNonEnglish = doc.language && doc.language !== 'en';

      if (isNonEnglish) {
        const bilingualRes = await fetch(`${API_BASE}/api/library/documents/${doc.id}/bilingual?limit=500`);
        if (bilingualRes.ok) {
          const data = await bilingualRes.json();
          if (data.paragraphs?.length > 0) {
            modalBilingual = data;
            modalLoading = false;
            return;
          }
        }
      }

      const res = await fetch(`${API_BASE}/api/library/documents/${doc.id}?paragraphs=true`);
      if (!res.ok) throw new Error('Failed to load content');
      const data = await res.json();
      modalParagraphs = data.paragraphs || [];

      // Get source URL from assets
      const originalFile = data.assets?.find(a => a.asset_type === 'original');
      if (originalFile?.storage_url) {
        modalSourceUrl = originalFile.storage_url;
      }
    } catch (err) {
      console.error('Failed to load document:', err);
      modalParagraphs = [];
    } finally {
      modalLoading = false;
    }
  }

  function closeModal() {
    modalOpen = false;
    modalDoc = null;
    modalParagraphs = [];
    modalBilingual = null;
    modalSourceUrl = null;
  }

  // Queue document for translation (background job)
  async function requestTranslation(docId) {
    translating = docId;
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/api/library/documents/${docId}/queue-translation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({}),
        credentials: 'include'
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to queue translation');
      }

      const data = await res.json();

      // Update local translation stats
      if (data.total) {
        docTranslationStats = new Map(docTranslationStats).set(docId, {
          translated: data.progress || 0,
          total: data.total
        });
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
          const res = await fetch(`${API_BASE}/api/library/documents/${docId}/translation-status`);
          if (res.ok) {
            const status = await res.json();

            // Update stats
            if (status.stats) {
              docTranslationStats = new Map(docTranslationStats).set(docId, {
                translated: status.stats.translated || 0,
                total: status.stats.total || 0
              });
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

  // Request translation from modal - just open the modal and let ReaderModal handle it
  async function handleModalTranslate(docId) {
    const doc = documents.find(d => d.id === docId);
    if (doc) {
      await openReader(doc);
      // ReaderModal has its own translate button that handles this properly
    }
  }

</script>

<div class="flex flex-col gap-1 w-full">
  {#each documents as doc (doc.id)}
    {@const isExpanded = expandedDocId === doc.id}
    {@const langName = getLangName(doc.language)}
    {@const isNonEnglish = doc.language && doc.language !== 'en'}
    {@const hasTranslations = isExpanded && bilingualContent?.paragraphs?.some(p => p.translation)}
    {@const docLang = bilingualContent?.document?.language || expandedContent?.document?.language || doc.language}
    {@const needsTranslation = isExpanded && docLang && docLang !== 'en' && !hasTranslations}
    {@const translationPercent = getTranslationPercent(doc.id)}
    {@const statsLoading = loadingStats.has(doc.id)}

    <!-- Load translation stats for non-English docs when they become visible -->
    {#if isNonEnglish && !docTranslationStats.has(doc.id) && !loadingStats.has(doc.id)}
      <div class="hidden" use:loadStatsOnMount={{ doc }}></div>
    {/if}

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
          <!-- Open document page link -->
          <a
            href={getDocumentUrl(doc)}
            class="p-1.5 text-muted hover:text-accent rounded transition-all cursor-pointer
                   {isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}"
            onclick={(e) => e.stopPropagation()}
            title="Open document page"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
          <!-- Fullscreen button - visible on hover or when expanded -->
          <button
            class="p-1.5 text-muted hover:text-accent rounded transition-all cursor-pointer
                   {isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}"
            onclick={(e) => { e.stopPropagation(); openReader(doc); }}
            title="View in modal"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          </button>
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

<!-- Fullscreen Reader Modal -->
<ReaderModal
  open={modalOpen}
  document={modalDoc}
  paragraphs={modalParagraphs}
  loading={modalLoading}
  bilingualContent={modalBilingual}
  sourceUrl={modalSourceUrl}
  onClose={closeModal}
  onTranslate={handleModalTranslate}
/>

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
