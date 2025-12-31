<script>
  import { tick } from 'svelte';
  import { getAuthState } from '../../lib/auth.svelte.js';
  import { getAccessToken } from '../../lib/api.js';
  import BilingualView from '../library/BilingualView.svelte';

  let {
    open = false,
    document = null,
    paragraphs = [],
    loading = false,
    currentIndex = -1,  // -1 means no specific paragraph selected
    keyPhrase = '',
    coreTerms = [],
    bilingualContent = null,
    sourceUrl = null,
    onClose = () => {},
    onTranslate = null
  } = $props();

  const auth = getAuthState();
  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  const BATCH_SIZE = 10;

  // RTL languages
  const RTL_LANGUAGES = ['ar', 'fa', 'he', 'ur'];

  // State
  let animating = $state(false);
  let containerEl = $state(null);

  // Translation progress state
  let translating = $state(false);
  let translationProgress = $state({ completed: 0, total: 0 });
  let translatingIds = $state(new Set());  // Paragraph IDs currently being translated
  let liveTranslations = $state({});  // id → translation text (object for better Svelte reactivity)

  // Derived
  let isRTL = $derived(RTL_LANGUAGES.includes(document?.language));
  let isAdmin = $derived(auth.user?.tier === 'admin' || auth.user?.tier === 'superadmin');
  // Show translate button if: non-English doc AND (no translations OR some paragraphs lack translations)
  let needsTranslation = $derived(
    document?.language &&
    document.language !== 'en' &&
    !translating &&
    (!bilingualContent?.paragraphs?.length || !bilingualContent.paragraphs.every(p => p.translation))
  );
  let sourceDomain = $derived(sourceUrl ? new URL(sourceUrl).hostname.replace('www.', '') : null);

  // Merged paragraphs with live translations - reactive to liveTranslations changes
  let mergedParagraphs = $derived(
    bilingualContent?.paragraphs?.map(p => ({
      ...p,
      translation: liveTranslations[p.id] || p.translation
    })) ?? []
  );

  // Progress percentage
  let progressPercent = $derived(
    translationProgress.total > 0
      ? Math.round((translationProgress.completed / translationProgress.total) * 100)
      : 0
  );

  // Format text with highlights
  function formatText(text) {
    if (!text) return '';
    return text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }

  // Apply highlighting to current paragraph
  function applyHighlighting(text, phrase, terms) {
    if (!text || (!phrase && (!terms || terms.length === 0))) return text;
    let result = text;
    if (phrase) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
    }
    if (terms && terms.length > 0) {
      terms.forEach(term => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(`(${escaped})`, 'gi'), '<mark><b>$1</b></mark>');
      });
    }
    return result;
  }

  // Handle escape key
  function handleKeydown(e) {
    if (e.key === 'Escape' && open) {
      onClose();
    }
  }

  // Reset translation state when modal closes
  $effect(() => {
    if (!open) {
      translating = false;
      translationProgress = { completed: 0, total: 0 };
      translatingIds = new Set();
      liveTranslations = {};
    }
  });

  // Batch translation function
  async function startTranslation() {
    if (!document?.id || !bilingualContent?.paragraphs) {
      console.log('[Translation] No document or paragraphs', { docId: document?.id, hasParagraphs: !!bilingualContent?.paragraphs });
      return;
    }

    // Debug: log all paragraphs
    console.log('[Translation] All paragraphs:', bilingualContent.paragraphs.slice(0, 3).map(p => ({
      id: p.id,
      index: p.index,
      hasTranslation: !!p.translation,
      original: p.original?.substring(0, 50)
    })));

    // Find paragraphs that need translation
    const untranslatedParas = bilingualContent.paragraphs.filter(p => p && !p.translation && p.id);
    console.log('[Translation] Untranslated paragraphs:', untranslatedParas.length, 'sample IDs:', untranslatedParas.slice(0, 3).map(p => p.id));

    if (untranslatedParas.length === 0) {
      console.log('[Translation] No paragraphs need translation');
      return;
    }

    translating = true;
    translationProgress = { completed: 0, total: untranslatedParas.length };

    // Process in batches
    for (let i = 0; i < untranslatedParas.length; i += BATCH_SIZE) {
      const batch = untranslatedParas.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map(p => p.id);

      // Mark these as translating
      translatingIds = new Set([...translatingIds, ...batchIds]);

      try {
        const token = getAccessToken();
        const res = await fetch(`${API_BASE}/api/library/documents/${document.id}/translate-batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
          },
          credentials: 'include',
          body: JSON.stringify({ paragraphIds: batchIds })
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.error('Batch translation failed:', errorData);
          // Continue with next batch even if this one fails
        } else {
          const data = await res.json();
          console.log('[Translation] Batch response:', data);
          // Update live translations as they come in
          if (data.translations && data.translations.length > 0) {
            const newTranslations = { ...liveTranslations };
            data.translations.forEach(t => {
              if (t.success && t.translation) {
                newTranslations[t.id] = t.translation;
                console.log('[Translation] Added translation for paragraph', t.id);
              }
            });
            liveTranslations = newTranslations;
            const batchSuccess = data.successCount ?? data.translations.filter(t => t.success).length;
            translationProgress = {
              ...translationProgress,
              completed: translationProgress.completed + batchSuccess
            };
            console.log('[Translation] Progress:', translationProgress.completed, '/', translationProgress.total);
          } else {
            console.log('[Translation] No translations in response:', data);
          }
        }
      } catch (err) {
        console.error('Translation batch error:', err);
      }

      // Remove from translating set
      const newSet = new Set(translatingIds);
      batchIds.forEach(id => newSet.delete(id));
      translatingIds = newSet;
    }

    translating = false;
  }

  // Scroll to current paragraph when opened (only if a specific paragraph is selected)
  $effect(() => {
    if (open && !loading && paragraphs.length > 0 && containerEl) {
      animating = true;
      tick().then(() => {
        requestAnimationFrame(() => {
          // Only scroll to specific paragraph if currentIndex >= 0
          if (containerEl && currentIndex >= 0) {
            containerEl.style.scrollBehavior = 'auto';
            const paragraphEl = containerEl.querySelector(`[data-paragraph-index="${currentIndex}"]`);
            if (paragraphEl) {
              const containerHeight = containerEl.clientHeight;
              const paragraphTop = paragraphEl.offsetTop;
              const paragraphHeight = paragraphEl.offsetHeight;
              const scrollTop = paragraphTop - (containerHeight / 2) + (paragraphHeight / 2);
              containerEl.scrollTop = Math.max(0, scrollTop);
            }
            containerEl.style.scrollBehavior = 'smooth';
          }
          setTimeout(() => { animating = false; }, 400);
        });
      });
    }
  });

  // Auto-start translation if document has autoTranslate flag
  $effect(() => {
    if (open && !loading && document?.autoTranslate && bilingualContent?.paragraphs && !translating) {
      // Check if there are untranslated paragraphs
      const hasUntranslated = bilingualContent.paragraphs.some(p => !p.translation);
      if (hasUntranslated) {
        startTranslation();
      }
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    class="reader-overlay {animating ? 'animating' : ''}"
    role="dialog"
    aria-modal="true"
    aria-label="Full document reader"
  >
    <div class="reader-modal">
      <!-- Reader Header -->
      <header class="reader-header">
        <div class="reader-book-header">
          <!-- Religion badge with decorative icon -->
          <div class="reader-religion-badge">
            {#if document?.religion === "Baha'i" || document?.religion === "Baháʼí"}
              <svg viewBox="0 0 100 100" class="religion-icon">
                <polygon points="50,5 61,35 95,35 68,55 79,90 50,70 21,90 32,55 5,35 39,35" fill="currentColor" opacity="0.15"/>
                <text x="50" y="58" text-anchor="middle" font-size="24" fill="currentColor">✦</text>
              </svg>
            {:else if document?.religion === "Christianity" || document?.religion === "Christian"}
              <svg viewBox="0 0 100 100" class="religion-icon">
                <text x="50" y="60" text-anchor="middle" font-size="36" fill="currentColor">✝</text>
              </svg>
            {:else if document?.religion === "Islam" || document?.religion === "Islamic"}
              <svg viewBox="0 0 100 100" class="religion-icon">
                <text x="50" y="60" text-anchor="middle" font-size="36" fill="currentColor">☪</text>
              </svg>
            {:else if document?.religion === "Judaism" || document?.religion === "Jewish"}
              <svg viewBox="0 0 100 100" class="religion-icon">
                <text x="50" y="60" text-anchor="middle" font-size="36" fill="currentColor">✡</text>
              </svg>
            {:else if document?.religion === "Hinduism" || document?.religion === "Hindu"}
              <svg viewBox="0 0 100 100" class="religion-icon">
                <text x="50" y="60" text-anchor="middle" font-size="36" fill="currentColor">ॐ</text>
              </svg>
            {:else if document?.religion === "Buddhism" || document?.religion === "Buddhist"}
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
              {#if document?.religion}
                <span class="reader-religion-tag">{document.religion}</span>
              {/if}
              {#if document?.collection}
                <span class="reader-collection-sep">›</span>
                <span class="reader-collection-name">{document.collection}</span>
              {/if}
            </div>
            <h2 class="reader-book-title">{document?.title || 'Document'}</h2>
            {#if document?.author}
              <p class="reader-book-author">by {document.author}</p>
            {/if}
            {#if sourceUrl}
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" class="reader-source-link" title="Open source at {sourceDomain}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                {sourceDomain || 'View Source'}
              </a>
            {/if}
          </div>
        </div>

        <div class="reader-actions">
          <!-- Translation progress bar -->
          {#if translating}
            <div class="translation-progress">
              <div class="progress-info">
                <svg class="progress-spinner" viewBox="0 0 24 24" width="16" height="16">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" opacity="0.2"/>
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
                </svg>
                <span class="progress-text">Translating {translationProgress.completed}/{translationProgress.total}</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: {progressPercent}%"></div>
              </div>
            </div>
          {:else if auth.isAuthenticated && needsTranslation}
            <!-- Translate button (logged-in users, non-English docs with untranslated paragraphs) -->
            <button
              class="reader-action-btn"
              onclick={startTranslation}
              title="Translate document to English"
              aria-label="Translate document"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>
              </svg>
            </button>
          {/if}
          <!-- Edit source link for admins -->
          {#if isAdmin && sourceUrl}
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="reader-action-btn"
              title="Edit source file"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </a>
          {/if}
          <button class="reader-close-btn" onclick={onClose} aria-label="Close reader">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <!-- Reader Content -->
      <div class="reader-content" bind:this={containerEl}>
        {#if loading}
          <div class="reader-loading">
            <div class="reader-loading-spinner"></div>
            <p>Loading document...</p>
          </div>
        {:else if bilingualContent?.paragraphs?.length > 0 || translating}
          <BilingualView
            paragraphs={mergedParagraphs}
            isRTL={bilingualContent?.document?.isRTL || isRTL}
            maxHeight="none"
            loading={false}
            {translatingIds}
          />
        {:else if paragraphs.length === 0}
          <div class="reader-empty">
            <p>No content available for this document.</p>
          </div>
        {:else}
          <div class="reader-paragraphs" class:rtl={isRTL}>
            {#each paragraphs as paragraph, i}
              {@const paraIndex = paragraph.paragraph_index ?? i}
              {@const isCurrent = currentIndex >= 0 && paraIndex === currentIndex}
              <div
                class="reader-paragraph-wrapper {isCurrent ? 'current' : ''}"
                class:rtl={isRTL}
                data-paragraph-index={paraIndex}
              >
                <span class="para-num">{paraIndex + 1}</span>
                <p class="reader-paragraph" dir={isRTL ? 'rtl' : 'ltr'}>
                  {#if isCurrent && keyPhrase}
                    {@html formatText(applyHighlighting(paragraph.text || paragraph.content, keyPhrase, coreTerms))}
                  {:else}
                    {@html formatText(paragraph.text || paragraph.content)}
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

<style>
  /* Full-screen Reader Modal Styles */
  .reader-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.95);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .reader-overlay.animating {
    animation: readerExpand 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes readerExpand {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }

  .reader-modal {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #faf8f3;
    color: #1a1a1a;
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

  .reader-religion-badge {
    flex-shrink: 0;
    width: 3.5rem;
    height: 3.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(145deg, #fff 0%, #f0ede6 100%);
    border-radius: 0.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8);
    border: 1px solid rgba(0, 0, 0, 0.06);
  }

  .religion-icon {
    width: 2rem;
    height: 2rem;
    color: #8b7355;
  }

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
    text-decoration: none;
  }

  .reader-action-btn:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #1a1a1a;
  }

  /* Translation progress - smooth animations */
  .translation-progress {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 160px;
    padding-right: 0.5rem;
    animation: fadeInProgress 0.3s ease-out;
  }

  @keyframes fadeInProgress {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .progress-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: #666;
  }

  .progress-spinner {
    animation: readerSpin 1.2s ease-in-out infinite;
    color: var(--accent-primary, #0891b2);
  }

  .progress-text {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    transition: opacity 0.2s ease;
  }

  .progress-bar {
    height: 4px;
    background: rgba(0, 0, 0, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent-primary, #0891b2), #06b6d4);
    border-radius: 2px;
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
  }

  .progress-fill::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
    animation: shimmer 1.5s infinite;
  }

  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
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

  .reader-loading, .reader-empty {
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
    margin: 0 auto;
    padding-left: 2rem;
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

  .reader-paragraph-wrapper.current {
    background: linear-gradient(135deg, rgba(254, 249, 195, 0.4) 0%, rgba(254, 243, 199, 0.3) 100%);
    border-left: 3px solid #eab308;
    margin-left: -3px;
  }

  .reader-paragraph-wrapper .para-num {
    position: absolute;
    left: -2.5rem;
    top: 0.75rem;
    font-family: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
    font-size: 0.6875rem;
    color: #999;
  }

  .reader-paragraph {
    font-family: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
    font-size: 1.0625rem;
    line-height: 1.65;
    color: #1a1a1a;
    margin: 0;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }

  .reader-paragraph :global(mark) {
    background-color: #fef9c3 !important;
    padding: 0.15em 0.3em;
    border-radius: 0.25em;
    color: #1a1a1a !important;
  }

  .reader-paragraph :global(mark b), .reader-paragraph :global(b) {
    font-weight: 700;
    color: inherit;
  }

  /* RTL support */
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

  [dir="rtl"] {
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1.125rem;
    line-height: 1.85;
  }

  /* Mobile responsive */
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
</style>
