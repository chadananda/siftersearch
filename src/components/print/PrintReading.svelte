<script>
  /**
   * PrintReading Component
   * Client-side component for paragraph-by-paragraph print view
   * Fetches document and bilingual content, renders for printing
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
  let canonicalUrl = $derived(
    typeof window !== 'undefined'
      ? `${window.location.origin}/print/reading?doc=${params.doc}&religion=${params.religion}&collection=${params.collection}`
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

      // Fetch bilingual content
      const bilingualRes = await fetch(`${API_BASE}/api/library/documents/${params.doc}/bilingual?limit=500`);
      if (bilingualRes.ok) {
        const data = await bilingualRes.json();
        paragraphs = data.paragraphs || [];
      }

      // Generate QR code
      const url = `${window.location.origin}/print/reading?doc=${params.doc}&religion=${params.religion}&collection=${params.collection}`;
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
        <div class="view-badge">Reading Edition</div>
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

  <!-- Content -->
  <main class="print-content">
    <div class="column-headers">
      <div class="col-header" class:rtl={isRTL}>Original {isRTL ? '(RTL)' : ''}</div>
      <div class="col-header num-header"></div>
      <div class="col-header">English Translation</div>
    </div>

    <div class="paragraphs-container">
      {#each paragraphs as para}
        <div class="paragraph-row avoid-break">
          {#if para.heading}
            <div class="paragraph-heading" class:rtl={isRTL}>
              {para.heading}
            </div>
          {/if}

          <div class="paragraph-content">
            <div class="para-cell original" class:rtl={isRTL} dir={isRTL ? 'rtl' : 'ltr'}>
              {para.original}
            </div>
            <div class="para-num-cell">
              <span class="para-num">{para.index + 1}</span>
            </div>
            <div class="para-cell translation">
              {#if para.translation}
                {para.translation}
              {:else}
                <span class="no-translation">[Translation not available]</span>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </main>

  <!-- Footer -->
  <footer class="print-footer">
    <p class="footer-url">{canonicalUrl}</p>
    <p class="footer-note">Generated from SifterSearch Library</p>
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

  /* Content */
  .print-content {
    padding: 0 1in;
  }

  .column-headers {
    display: grid;
    grid-template-columns: 1fr 2rem 1fr;
    border-bottom: 2px solid #8b7355;
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
  }

  .col-header {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #666;
  }

  .col-header.rtl {
    text-align: right;
  }

  .num-header {
    text-align: center;
  }

  .paragraph-row {
    border-bottom: 1px solid #eee;
  }

  .paragraph-row:last-child {
    border-bottom: none;
  }

  .paragraph-heading {
    padding: 0.75rem 0 0.25rem;
    font-weight: 700;
    font-size: 1rem;
    color: #333;
  }

  .paragraph-heading.rtl {
    text-align: right;
    direction: rtl;
  }

  .paragraph-content {
    display: grid;
    grid-template-columns: 1fr 2rem 1fr;
    padding: 0.75rem 0;
  }

  .para-cell {
    padding: 0 0.5rem;
    line-height: 1.7;
  }

  .para-cell.original {
    border-right: 1px solid #eee;
  }

  .para-cell.original.rtl {
    text-align: right;
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1.15rem;
    line-height: 2;
  }

  .para-cell.translation {
    border-left: 1px solid #eee;
  }

  .para-num-cell {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 0.25rem;
  }

  .para-num {
    font-size: 0.65rem;
    color: #999;
  }

  .no-translation {
    font-style: italic;
    color: #999;
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

    .paragraph-row {
      page-break-inside: avoid;
    }
  }
</style>
