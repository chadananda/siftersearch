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

  function getAuthorityInfo(authority) {
    if (!authority) return null;
    if (authority >= 10) return { label: '★★★', class: 'text-accent' };
    if (authority >= 9) return { label: '★★☆', class: 'text-accent' };
    if (authority >= 8) return { label: '★☆☆', class: 'text-success' };
    if (authority >= 7) return { label: '◆', class: 'text-success' };
    if (authority >= 5) return { label: '◇', class: 'text-secondary' };
    if (authority >= 3) return { label: '○', class: 'text-muted' };
    return { label: '·', class: 'text-muted' };
  }
</script>

<div class="flex flex-col gap-1">
  {#each documents as doc}
    {@const size = getSizeLabel(doc.paragraph_count)}
    {@const auth = getAuthorityInfo(doc.authority)}
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
          {#if auth}
            <span class="text-[0.6875rem] font-semibold px-1.5 py-0.5 rounded {auth.class}">{auth.label}</span>
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
              <div class="border border-border-subtle rounded-lg bg-surface-1">
                <div class="max-h-[300px] overflow-y-auto p-4">
                  {#if expandedContent.paragraphs?.length > 0}
                    {#each expandedContent.paragraphs as para}
                      {@const docLang = expandedContent.document?.language}
                      <p
                        class="mb-3 last:mb-0 text-sm leading-relaxed text-secondary"
                        dir={isRTL(docLang) ? 'rtl' : 'ltr'}
                        class:text-right={isRTL(docLang)}
                      >{para.text || para.content || ''}</p>
                    {/each}
                  {:else}
                    <p class="text-muted text-sm italic">No content available</p>
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
