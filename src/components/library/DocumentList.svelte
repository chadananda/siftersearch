<script>
  import { createEventDispatcher } from 'svelte';
  import BilingualView from './BilingualView.svelte';

  let { documents = [], selectedId = null, isAdmin = false } = $props();

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  const dispatch = createEventDispatcher();

  let expandedDocId = $state(null);
  let expandedContent = $state(null);
  let bilingualContent = $state(null);
  let loadingContent = $state(false);
  let translating = $state(null); // Document ID being translated

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

  function getSizeLabel(count) {
    if (!count) return '';
    if (count < 50) return 'Brief';
    if (count < 200) return 'Medium';
    if (count < 500) return 'Long';
    return 'Book';
  }

  function getLangName(code) {
    return LANG_NAMES[code] || code?.toUpperCase() || '';
  }

  function openReader(docId) {
    // Navigate to main page with reader deep link
    window.location.href = `/?read=${docId}`;
  }

  // Request translation for a document
  async function requestTranslation(docId) {
    translating = docId;
    try {
      const res = await fetch(`${API_BASE}/api/admin/server/populate-translations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          documentId: docId,
          force: false
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Translation request failed');
      }

      const data = await res.json();
      console.log('Translation started:', data);

      // Reload the document content to get new translations
      const doc = documents.find(d => d.id === docId);
      if (doc) {
        await loadDocumentContent(doc);
      }
    } catch (err) {
      console.error('Translation error:', err);
      alert(`Translation failed: ${err.message}`);
    } finally {
      translating = null;
    }
  }

</script>

<div class="flex flex-col gap-1 w-full">
  {#each documents as doc (doc.id)}
    {@const size = getSizeLabel(doc.paragraph_count)}
    {@const isExpanded = expandedDocId === doc.id}
    {@const langName = getLangName(doc.language)}
    {@const hasTranslations = isExpanded && bilingualContent?.paragraphs?.some(p => p.translation)}
    {@const docLang = bilingualContent?.document?.language || expandedContent?.document?.language || doc.language}
    {@const needsTranslation = isExpanded && docLang && docLang !== 'en' && !hasTranslations}

    <div class="border rounded-lg overflow-hidden transition-colors
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
          {#if needsTranslation}
            <span class="text-[0.6875rem] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500" title="Translation not available">No translation</span>
          {/if}
          {#if langName && langName !== 'English'}
            <span class="text-[0.6875rem] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{langName}</span>
          {/if}
          {#if isAdmin && doc.authority}
            <span class="text-[0.6875rem] px-1.5 py-0.5 rounded bg-surface-2 text-muted" title="Authority score">{doc.authority}</span>
          {/if}
          {#if size}
            <span class="text-[0.6875rem] px-1.5 py-0.5 rounded bg-surface-2 text-muted">{size}</span>
          {/if}
          {#if isExpanded}
            {#if isAdmin && needsTranslation}
              <button
                class="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition-colors"
                onclick={(e) => { e.stopPropagation(); requestTranslation(doc.id); }}
                disabled={translating === doc.id}
                title="Translate document to English"
              >
                {#if translating === doc.id}
                  <svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
                {:else}
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>
                  </svg>
                {/if}
                Translate
              </button>
            {/if}
            {#if isAdmin && (expandedContent?.assets?.length > 0 || bilingualContent?.document)}
              {@const originalFile = expandedContent?.assets?.find(a => a.asset_type === 'original')}
              {#if originalFile?.storage_url}
                <a
                  href={originalFile.storage_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="p-1.5 text-muted hover:text-accent rounded transition-colors"
                  title="Edit source file"
                  onclick={(e) => e.stopPropagation()}
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              {/if}
            {/if}
            <button
              class="p-1.5 text-muted hover:text-accent rounded transition-colors"
              onclick={(e) => { e.stopPropagation(); openReader(doc.id); }}
              title="View fullscreen"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
          {/if}
        </div>
      </div>

      <!-- Expanded content -->
      {#if isExpanded}
        <div class="bg-surface-0 overflow-hidden">

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
