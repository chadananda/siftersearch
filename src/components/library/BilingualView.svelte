<script>
  /**
   * BilingualView Component
   * Side-by-side display of original text and English translation
   * Supports RTL languages (Arabic, Farsi, Hebrew, Urdu)
   * Uses AlignedParagraph for phrase-level interactive highlighting when segments available
   */

  import AlignedParagraph from './AlignedParagraph.svelte';

  let {
    paragraphs = [],
    isRTL = false,
    showOriginalOnly = false,
    maxHeight = '300px',
    loading = false,
    translatingIds = new Set()  // IDs of paragraphs currently being translated
  } = $props();

  // Check if any translations exist or if translation is in progress
  let hasTranslations = $derived(paragraphs.some(p => p.translation));
  let isTranslating = $derived(translatingIds.size > 0);

  // Should show two columns if we have translations OR translation is in progress
  let showBilingual = $derived(hasTranslations || isTranslating);

  // Check if paragraph has aligned segments for interactive highlighting
  function hasSegments(para) {
    return para.segments && Array.isArray(para.segments) && para.segments.length > 0;
  }
</script>

<div class="bilingual-container w-full" style="max-height: {maxHeight}">
  {#if loading}
    <div class="loading-state">
      <span class="spinner"></span>
      <span class="text-muted text-sm">Loading content...</span>
    </div>
  {:else if paragraphs.length === 0}
    <p class="text-muted text-sm italic p-4">No content available</p>
  {:else if !showBilingual || showOriginalOnly}
    <!-- Single column: original only -->
    <div class="single-column">
      {#each paragraphs as para}
        <div class="paragraph-row" class:rtl={isRTL}>
          <span class="para-num">{para.index + 1}</span>
          <p class="para-text" dir={isRTL ? 'rtl' : 'ltr'}>{para.original}</p>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Three columns: original + number + translation -->
    <div class="bilingual-grid">
      <div class="column-header">
        <span class="header-label">Original</span>
        <span class="header-label num-header"></span>
        <span class="header-label">English Translation</span>
      </div>
      {#each paragraphs as para}
        {@const isParaTranslating = translatingIds.has(para.id)}
        {#if hasSegments(para)}
          <!-- Interactive aligned view when segments available -->
          <div class="aligned-row">
            <div class="para-num-aligned">
              <span class="para-num">{para.index + 1}</span>
            </div>
            <AlignedParagraph
              segments={para.segments}
              direction={isRTL ? 'rtl' : 'ltr'}
              originalLabel=""
              translationLabel=""
            />
          </div>
        {:else}
          <!-- Standard bilingual row without segments -->
          <div class="bilingual-row">
            <div class="para-cell original" class:rtl={isRTL}>
              <p class="para-text" dir={isRTL ? 'rtl' : 'ltr'}>{para.original}</p>
            </div>
            <div class="para-num-cell">
              <span class="para-num">{para.index + 1}</span>
            </div>
            <div class="para-cell translation" class:translating={isParaTranslating}>
              {#if para.translation}
                <p class="para-text">{para.translation}</p>
              {:else if isParaTranslating}
                <div class="translating-indicator">
                  <span class="cell-spinner"></span>
                  <span class="translating-text">Translating...</span>
                </div>
              {:else}
                <p class="para-text text-muted italic">—</p>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Paper-like container - matches source-paper styling from ChatInterface */
  .bilingual-container {
    overflow-y: auto;
    overflow-x: hidden;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 0.5rem;
    background: #faf8f3;
    max-width: 100%;
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: #666;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid #ddd;
    border-top-color: #8b7355;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Single column layout - paper style */
  .single-column {
    padding: 1rem 1.25rem;
  }

  .paragraph-row {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  .paragraph-row:last-child {
    border-bottom: none;
  }

  .paragraph-row:hover {
    background: rgba(0, 0, 0, 0.02);
  }

  .paragraph-row.rtl {
    flex-direction: row-reverse;
  }

  /* Bilingual grid layout */
  .bilingual-grid {
    display: flex;
    flex-direction: column;
  }

  .column-header {
    display: grid;
    grid-template-columns: 1fr 2rem 1fr;
    gap: 1px;
    position: sticky;
    top: 0;
    z-index: 1;
    background: #f0ebe0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }

  .header-label {
    padding: 0.5rem 1rem;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #666;
    background: #f0ebe0;
  }

  .header-label.num-header {
    padding: 0.5rem 0;
  }

  .bilingual-row {
    display: grid;
    grid-template-columns: 1fr 2rem 1fr;
    gap: 1px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  /* Aligned row for interactive phrase highlighting */
  .aligned-row {
    display: grid;
    grid-template-columns: 2rem 1fr;
    gap: 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    padding: 0.875rem 1rem;
    background: #faf8f3;
  }

  .aligned-row:hover {
    background: rgba(0, 0, 0, 0.01);
  }

  .para-num-aligned {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 1.5rem; /* Align with first line of text below label */
  }

  .para-num-cell {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 0.875rem 0;
    background: #f5f2ea;
  }

  .bilingual-row:last-child {
    border-bottom: none;
  }

  .bilingual-row:hover .para-cell {
    background: rgba(0, 0, 0, 0.02);
  }

  .para-cell {
    display: flex;
    padding: 0.875rem 1rem;
    background: #faf8f3;
    min-height: 2.5rem;
  }

  .para-cell.original.rtl {
    text-align: right;
  }

  .para-num {
    font-family: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
    font-size: 0.6875rem;
    color: #999;
    text-align: center;
    padding-top: 0.25rem;
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

  .para-text.italic {
    font-style: italic;
    color: #888;
  }

  /* Translation in progress indicator - smooth transitions */
  .para-cell.translating {
    background: rgba(8, 145, 178, 0.05);
    transition: background 0.4s ease;
  }

  .para-cell.translation {
    transition: background 0.4s ease, opacity 0.3s ease;
  }

  .translating-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #666;
    font-size: 0.875rem;
    animation: fadeIn 0.3s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .cell-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(8, 145, 178, 0.2);
    border-top-color: #0891b2;
    border-radius: 50%;
    animation: spin 1s ease-in-out infinite;
  }

  .translating-text {
    font-style: italic;
    color: #0891b2;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }

  /* Smooth appearance of new translation text */
  .para-cell.translation .para-text {
    animation: slideIn 0.4s ease-out;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-8px); }
    to { opacity: 1; transform: translateX(0); }
  }

  /* RTL text styling - Amiri for Arabic/Persian */
  [dir="rtl"] {
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1.25rem; /* Larger for Arabic/Farsi readability - English is more compact */
    line-height: 1.85;
  }

  /* Responsive: stack on mobile */
  @media (max-width: 640px) {
    .column-header,
    .bilingual-row {
      grid-template-columns: 1fr;
    }

    .column-header .header-label:first-child {
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    }

    .column-header .num-header {
      display: none;
    }

    .para-num-cell {
      display: none;
    }

    .para-cell.original {
      position: relative;
      padding-left: 2.5rem;
    }

    .para-cell.original::before {
      content: attr(data-num);
      position: absolute;
      left: 0.5rem;
      top: 0.875rem;
      font-family: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
      font-size: 0.6875rem;
      color: #999;
    }

    .para-cell.translation {
      border-top: 1px dashed rgba(0, 0, 0, 0.1);
      background: #f5f2ea;
    }
  }
</style>
