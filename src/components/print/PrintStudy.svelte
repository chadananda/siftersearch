<script>
  /**
   * PrintStudy Component
   * Client-side component for phrase-by-phrase print view
   * Shows aligned segments with color-coded matching
   */
  import { onMount } from 'svelte';
  import { generateQRCodeUrl } from '../../lib/qrcode.js';

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  const RTL_LANGUAGES = ['ar', 'fa', 'he', 'ur'];
  const LANGUAGE_NAMES = {
    en: 'English', ar: 'Arabic', fa: 'Persian', he: 'Hebrew', ur: 'Urdu'
  };


  // State
  let loading = $state(true);
  let error = $state(null);
  let document = $state(null);
  let paragraphs = $state([]);
  let params = $state({ doc: '', religion: '', collection: '' });
  let qrCodeUrl = $state(null);

  // Derived
  let isRTL = $derived(RTL_LANGUAGES.includes(document?.language));
  let languageDisplay = $derived(document?.language ? LANGUAGE_NAMES[document.language] || document.language : '');
  let segmentedCount = $derived(paragraphs.filter(p => p.segments?.length > 0).length);
  let canonicalUrl = $derived(
    typeof window !== 'undefined'
      ? `${window.location.origin}/print/study?doc=${params.doc}&religion=${params.religion}&collection=${params.collection}`
      : ''
  );

  onMount(async () => {
    // Parse URL params
    const urlParams = new URLSearchParams(window.location.search);
    params = {
      doc: urlParams.get('doc') || '',
      religion: urlParams.get('religion') || '',
      collection: urlParams.get('collection') || ''
    };

    if (!params.doc) {
      error = 'No document ID provided. Use ?doc=DOCUMENT_ID in the URL.';
      loading = false;
      return;
    }

    try {
      // Fetch document metadata
      const docRes = await fetch(`${API_BASE}/api/library/documents/${params.doc}`);
      if (docRes.ok) {
        document = await docRes.json();
      } else {
        throw new Error('Document not found');
      }

      // Fetch bilingual content with segments
      const bilingualRes = await fetch(`${API_BASE}/api/library/documents/${params.doc}/bilingual?limit=1000`);
      if (bilingualRes.ok) {
        const data = await bilingualRes.json();
        paragraphs = data.paragraphs || [];
      }

      // Generate QR code
      const url = `${window.location.origin}/print/study?doc=${params.doc}&religion=${params.religion}&collection=${params.collection}`;
      qrCodeUrl = await generateQRCodeUrl(url, { width: 100 });

      loading = false;
    } catch (e) {
      error = e.message;
      loading = false;
    }
  });
</script>

{#if loading}
  <div class="loading-state">
    <div class="spinner"></div>
    <p>Loading document...</p>
  </div>
{:else if error}
  <div class="error-state">
    <p class="error-title">Error</p>
    <p class="error-message">{error}</p>
  </div>
{:else if document}
  <!-- Header -->
  <header class="print-header">
    <div class="header-content">
      <div class="header-main">
        <h1 class="document-title">{document.title}</h1>
        <div class="document-meta">
          {#if document.author}
            <span class="meta-author">{document.author}</span>
          {/if}
          {#if params.collection}
            <span class="meta-separator">&middot;</span>
            <span class="meta-collection">{params.collection}</span>
          {/if}
          {#if params.religion}
            <span class="meta-separator">&middot;</span>
            <span class="meta-religion">{params.religion}</span>
          {/if}
          {#if languageDisplay}
            <span class="meta-separator">&middot;</span>
            <span class="meta-language">{languageDisplay}</span>
          {/if}
        </div>
        <div class="view-badge">Study Edition (Phrase-by-Phrase)</div>
      </div>
      {#if qrCodeUrl}
        <div class="header-qr">
          <img src={qrCodeUrl} alt="QR Code" class="qr-image" width="80" height="80" />
          <span class="qr-label">Scan for digital version</span>
        </div>
      {/if}
    </div>
    <div class="header-divider"></div>
  </header>

  <!-- Legend -->
  <div class="legend no-print">
    <span class="legend-title">Study Guide:</span>
    <span class="legend-item">Each row shows an aligned phrase pair — original and translation side by side</span>
  </div>

  {#if segmentedCount === 0}
    <div class="no-segments-notice no-print">
      <p>This document does not have phrase-level alignment available yet.</p>
      <p>Showing paragraph-level translations instead.</p>
    </div>
  {/if}

  <!-- Content -->
  <main class="print-content">
    <div class="paragraphs-container">
      {#each paragraphs as para}
        <div class="paragraph-block avoid-break">
          <div class="para-number">
            <span class="para-badge">{para.index + 1}</span>
          </div>

          {#if para.heading}
            <div class="paragraph-heading" class:rtl={isRTL}>
              {para.heading}
            </div>
          {/if}

          {#if para.segments && para.segments.length > 0}
            <!-- Phrase-by-phrase numbered segments -->
            <div class="segment-table">
              <div class="segment-header">
                <div class="segment-header-num">#</div>
                <div class="segment-header-col" class:rtl={isRTL}>Original</div>
                <div class="segment-header-col">Translation</div>
              </div>
              {#each para.segments as seg}
                <div class="segment-row">
                  <div class="segment-num">{para.index + 1}.{seg.id}</div>
                  <div class="segment-original" class:rtl={isRTL} dir={isRTL ? 'rtl' : 'ltr'}>
                    {seg.original}
                  </div>
                  <div class="segment-translation">
                    {seg.translation}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <!-- Fallback: paragraph-level -->
            <div class="fallback-content">
              <div class="fallback-row">
                <div class="fallback-cell original" class:rtl={isRTL} dir={isRTL ? 'rtl' : 'ltr'}>
                  <div class="fallback-label">Original</div>
                  <div class="fallback-text">{para.original}</div>
                </div>
                <div class="fallback-cell translation">
                  <div class="fallback-label">Translation</div>
                  <div class="fallback-text">
                    {para.translation || '[Translation not available]'}
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </main>

  <!-- Footer -->
  <footer class="print-footer">
    <p class="footer-url">{canonicalUrl}</p>
    <p class="footer-note">Generated from SifterSearch Library - Phrase Study Edition</p>
  </footer>
{/if}

<style>
  /* Loading & Error States */
  .loading-state, .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 50vh;
    color: #666;
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid #ddd;
    border-top-color: #8b7355;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-title {
    font-weight: 700;
    font-size: 1.25rem;
    color: #dc2626;
    margin-bottom: 0.5rem;
  }

  /* Header */
  .print-header {
    padding: 1in 1in 0.5in;
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .header-main {
    flex: 1;
  }

  .document-title {
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 0.5rem;
    color: #1a1a1a;
  }

  .document-meta {
    font-size: 0.9rem;
    color: #555;
    margin-bottom: 0.75rem;
  }

  .meta-separator {
    margin: 0 0.5rem;
    color: #999;
  }

  .meta-author {
    font-style: italic;
  }

  .meta-collection, .meta-religion {
    font-variant: small-caps;
    letter-spacing: 0.02em;
  }

  .view-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: #f0ebe0;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #8b7355;
  }

  .header-qr {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .qr-image {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 4px;
    background: white;
  }

  .qr-label {
    font-size: 0.6rem;
    color: #888;
    text-align: center;
    max-width: 80px;
  }

  .header-divider {
    margin-top: 1rem;
    height: 2px;
    background: linear-gradient(to right, #8b7355 0%, #8b7355 30%, transparent 100%);
  }

  /* Legend & Notice */
  .legend {
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 0.5rem 1rem;
    margin: 0 1in 1rem;
    font-size: 0.75rem;
    color: #666;
  }

  .legend-title {
    font-weight: 600;
    margin-right: 0.5rem;
  }

  .no-segments-notice {
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 4px;
    padding: 1rem;
    margin: 0 1in 1rem;
    text-align: center;
    font-size: 0.875rem;
    color: #856404;
  }

  .no-segments-notice p {
    margin: 0.25rem 0;
  }

  /* Content */
  .print-content {
    padding: 0 1in;
  }

  .paragraphs-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .paragraph-block {
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    padding: 1rem;
    background: #fafafa;
  }

  .para-number {
    margin-bottom: 0.5rem;
  }

  .para-badge {
    display: inline-block;
    background: #8b7355;
    color: white;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
  }

  .paragraph-heading {
    font-weight: 700;
    font-size: 1rem;
    margin-bottom: 0.75rem;
    color: #333;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #ddd;
  }

  .paragraph-heading.rtl {
    text-align: right;
    direction: rtl;
  }

  /* Segment Table */
  .segment-table {
    display: flex;
    flex-direction: column;
    border: 1px solid #ddd;
    border-radius: 4px;
    overflow: hidden;
  }

  .segment-header {
    display: grid;
    grid-template-columns: 2.5rem 1fr 1fr;
    background: #8b7355;
    color: white;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .segment-header-num {
    padding: 0.35rem 0.25rem;
    text-align: center;
    border-right: 1px solid rgba(255,255,255,0.2);
  }

  .segment-header-col {
    padding: 0.35rem 0.75rem;
  }

  .segment-header-col:first-of-type {
    border-right: 1px solid rgba(255,255,255,0.2);
  }

  .segment-header-col.rtl {
    text-align: right;
  }

  .segment-row {
    display: grid;
    grid-template-columns: 2.5rem 1fr 1fr;
    border-bottom: 1px solid #eee;
  }

  .segment-row:last-child {
    border-bottom: none;
  }

  .segment-row:nth-child(even) {
    background: #f9f9f9;
  }

  .segment-num {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 0.5rem 0.25rem;
    font-size: 0.65rem;
    font-weight: 700;
    color: #888;
    background: #f0f0f0;
    border-right: 1px solid #ddd;
  }

  .segment-original,
  .segment-translation {
    padding: 0.5rem 0.75rem;
    line-height: 1.7;
  }

  .segment-original {
    border-right: 1px solid #eee;
  }

  .segment-original.rtl {
    text-align: right;
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1.1rem;
    line-height: 2;
  }

  /* Fallback */
  .fallback-content {
    background: white;
    border-radius: 4px;
    padding: 0.75rem;
  }

  .fallback-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .fallback-cell {
    padding: 0.5rem;
  }

  .fallback-cell.original.rtl {
    text-align: right;
    direction: rtl;
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1.1rem;
  }

  .fallback-label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #888;
    margin-bottom: 0.25rem;
  }

  .fallback-text {
    line-height: 1.7;
  }

  /* Footer */
  .print-footer {
    margin-top: 2rem;
    padding: 1rem 1in;
    border-top: 1px solid #ddd;
    text-align: center;
    font-size: 0.75rem;
    color: #888;
  }

  .footer-url {
    font-family: monospace;
    margin-bottom: 0.25rem;
  }

  .footer-note {
    font-style: italic;
  }

  /* Print optimizations */
  @media print {
    .print-header {
      padding: 0 0 0.5in;
    }

    .print-content {
      padding: 0;
    }

    .print-footer {
      padding: 1rem 0;
    }

    .paragraph-block {
      page-break-inside: avoid;
      border-color: #ccc;
    }

    .legend, .no-segments-notice {
      display: none;
    }

    .segment-header {
      background: #666 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .segment-row:nth-child(even) {
      background: #f5f5f5 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .segment-table {
      border-color: #999;
    }

    .no-print {
      display: none !important;
    }
  }
</style>
