<script>
  /**
   * BilingualView Component
   * Side-by-side display of original text and English translation
   * Supports RTL languages (Arabic, Farsi, Hebrew, Urdu)
   */

  let {
    paragraphs = [],
    isRTL = false,
    showOriginalOnly = false,
    maxHeight = '300px',
    loading = false
  } = $props();

  // Check if any translations exist
  let hasTranslations = $derived(paragraphs.some(p => p.translation));
</script>

<div class="bilingual-container" style="max-height: {maxHeight}">
  {#if loading}
    <div class="loading-state">
      <span class="spinner"></span>
      <span class="text-muted text-sm">Loading content...</span>
    </div>
  {:else if paragraphs.length === 0}
    <p class="text-muted text-sm italic p-4">No content available</p>
  {:else if !hasTranslations || showOriginalOnly}
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
    <!-- Two columns: original + translation -->
    <div class="bilingual-grid">
      <div class="column-header">
        <span class="header-label">Original</span>
        <span class="header-label">English Translation</span>
      </div>
      {#each paragraphs as para}
        <div class="bilingual-row">
          <div class="para-cell original" class:rtl={isRTL}>
            <span class="para-num">{para.index + 1}</span>
            <p class="para-text" dir={isRTL ? 'rtl' : 'ltr'}>{para.original}</p>
          </div>
          <div class="para-cell translation">
            {#if para.translation}
              <p class="para-text">{para.translation}</p>
            {:else}
              <p class="para-text text-muted italic">Translation pending...</p>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .bilingual-container {
    overflow-y: auto;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    background: var(--surface-1);
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Single column layout */
  .single-column {
    padding: 0.75rem;
  }

  .paragraph-row {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 0.375rem;
    margin-bottom: 0.25rem;
  }

  .paragraph-row:hover {
    background: var(--surface-2);
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
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border-default);
  }

  .header-label {
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    background: var(--surface-2);
  }

  .bilingual-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .bilingual-row:last-child {
    border-bottom: none;
  }

  .bilingual-row:hover .para-cell {
    background: var(--surface-2);
  }

  .para-cell {
    display: flex;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: var(--surface-0);
    min-height: 2.5rem;
  }

  .para-cell.original.rtl {
    flex-direction: row-reverse;
    text-align: right;
  }

  .para-num {
    flex-shrink: 0;
    width: 1.5rem;
    font-size: 0.6875rem;
    color: var(--text-muted);
    text-align: right;
    padding-top: 0.125rem;
  }

  .rtl .para-num {
    text-align: left;
  }

  .para-text {
    flex: 1;
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--text-primary);
  }

  .para-text.italic {
    font-style: italic;
  }

  /* RTL text styling */
  [dir="rtl"] {
    font-family: 'Amiri', 'Scheherazade New', 'Traditional Arabic', serif;
  }

  /* Responsive: stack on mobile */
  @media (max-width: 640px) {
    .column-header,
    .bilingual-row {
      grid-template-columns: 1fr;
    }

    .column-header .header-label:first-child {
      border-bottom: 1px solid var(--border-subtle);
    }

    .para-cell.translation {
      border-top: 1px dashed var(--border-subtle);
      background: var(--surface-1);
    }
  }
</style>
