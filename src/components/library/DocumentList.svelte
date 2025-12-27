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

  // RTL languages that need special handling
  const RTL_LANGUAGES = ['ar', 'fa', 'he', 'ur'];

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
          bilingualContent = await bilingualRes.json();
          loadingContent = false;
          return;
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

</script>

<style>
  /* Paper-like content area - matches source-paper styling from ChatInterface */
  .paper-content {
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 0.5rem;
    background: #faf8f3;
    overflow: hidden;
  }

  .paper-scroll {
    max-height: 300px;
    overflow-y: auto;
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
    margin: 0;
    font-family: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
    font-size: 0.9375rem;
    line-height: 1.65;
    color: #1a1a1a;
  }

  .empty-text {
    font-style: italic;
    color: #888;
    font-size: 0.875rem;
  }

  /* RTL text styling - Amiri for Arabic/Persian */
  [dir="rtl"] {
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1.0625rem; /* Slightly larger for Arabic readability */
    line-height: 1.8;
  }
</style>

<div class="flex flex-col gap-1">
  {#each documents as doc}
    {@const size = getSizeLabel(doc.paragraph_count)}
    {@const isExpanded = expandedDocId === doc.id}

    <div class="border rounded-lg overflow-hidden transition-colors
                {isExpanded ? 'border-accent' : 'border-border-subtle hover:border-border'}">
      <button
        class="w-full flex items-center gap-2 py-2.5 px-3 text-left cursor-pointer transition-colors
               {isExpanded ? 'bg-accent/10 border-b border-border-subtle' : 'bg-surface-1 hover:bg-surface-2'}"
        onclick={() => toggleDocument(doc)}
      >
        <span class="text-[0.625rem] text-muted w-4 shrink-0">{isExpanded ? '▼' : '▶'}</span>
        <div class="flex-1 min-w-0 flex items-baseline gap-2">
          <span class="text-sm font-medium text-primary truncate">{doc.title || 'Untitled'}</span>
          {#if doc.author}
            <span class="text-xs text-secondary shrink-0">{doc.author}</span>
          {/if}
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          {#if isAdmin && doc.authority}
            <span class="text-[0.6875rem] px-1.5 py-0.5 rounded bg-surface-2 text-muted" title="Authority score">{doc.authority}</span>
          {/if}
          {#if size}
            <span class="text-[0.6875rem] px-1.5 py-0.5 rounded bg-surface-2 text-muted">{size}</span>
          {/if}
        </div>
      </button>

      {#if isExpanded}
        <div class="p-4 bg-surface-0 border-t border-border-subtle">
          {#if loadingContent}
            <div class="flex items-center gap-2 py-4 text-muted text-sm">
              <span class="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin"></span>
              Loading content...
            </div>
          {:else if expandedContent?.error}
            <div class="p-3 bg-error/10 text-error rounded text-sm">Failed to load: {expandedContent.error}</div>
          {:else if expandedContent}
            <div class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 mb-4">
              {#if expandedContent.document?.author}
                <div class="flex flex-col gap-0.5">
                  <span class="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">Author</span>
                  <span class="text-sm text-primary">{expandedContent.document.author}</span>
                </div>
              {/if}
              {#if expandedContent.document?.year}
                <div class="flex flex-col gap-0.5">
                  <span class="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">Year</span>
                  <span class="text-sm text-primary">{expandedContent.document.year}</span>
                </div>
              {/if}
              {#if expandedContent.document?.language}
                <div class="flex flex-col gap-0.5">
                  <span class="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">Language</span>
                  <span class="text-sm text-primary">{expandedContent.document.language}</span>
                </div>
              {/if}
              {#if expandedContent.document?.paragraph_count}
                <div class="flex flex-col gap-0.5">
                  <span class="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">Paragraphs</span>
                  <span class="text-sm text-primary">{expandedContent.document.paragraph_count.toLocaleString()}</span>
                </div>
              {/if}
            </div>

            {#if isAdmin && expandedContent.assets?.length > 0}
              {@const originalFile = expandedContent.assets.find(a => a.asset_type === 'original')}
              {#if originalFile?.storage_url}
                <div class="mb-4">
                  <a
                    href={originalFile.storage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 text-accent text-[0.8125rem] font-medium rounded hover:bg-surface-3 transition-colors"
                  >
                    Edit Source
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                </div>
              {/if}
            {/if}

            <!-- Content display: bilingual or standard -->
            {#if bilingualContent}
              <BilingualView
                paragraphs={bilingualContent.paragraphs}
                isRTL={bilingualContent.document?.isRTL || isRTL(bilingualContent.document?.language)}
                maxHeight="300px"
                loading={loadingContent}
              />
            {:else}
              <div class="paper-content">
                <div class="paper-scroll">
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
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>
