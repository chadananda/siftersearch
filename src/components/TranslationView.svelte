<script>
  /**
   * TranslationView Component
   * Side-by-side view showing original text and translation
   * For patron+ users only
   */
  import { onMount } from 'svelte';
  import { services, documents } from '../lib/api.js';
  import { getAuthState } from '../lib/auth.svelte.js';

  const auth = getAuthState();

  // Props
  let { documentId = null, onClose = () => {} } = $props();

  // State
  let loading = $state(true);
  let error = $state(null);
  let document = $state(null);
  let paragraphs = $state([]);
  let translations = $state({});
  let selectedLanguage = $state('es');
  let translating = $state(false);
  let translationProgress = $state(0);
  let jobId = $state(null);
  let availableLanguages = $state({});
  let translationExists = $state(false);

  // Patron tiers that can use translation
  const PATRON_TIERS = ['patron', 'institutional', 'admin'];
  let canTranslate = $derived(
    auth.isAuthenticated &&
    PATRON_TIERS.includes(auth.user?.tier)
  );

  onMount(async () => {
    if (!documentId) {
      error = 'No document specified';
      loading = false;
      return;
    }

    try {
      // Load document and paragraphs
      const [docResult, langResult] = await Promise.all([
        documents.getSegments(documentId, { limit: 500 }),
        services.getLanguages()
      ]);

      document = docResult.document;
      paragraphs = docResult.segments || [];
      availableLanguages = langResult.languages || {};

      // Check if translation exists
      const existing = await services.checkTranslation(documentId, selectedLanguage);
      if (existing.exists) {
        translationExists = true;
        // Load cached translations
        if (existing.translations) {
          translations = existing.translations;
        }
      }
    } catch (err) {
      error = err.message || 'Failed to load document';
    } finally {
      loading = false;
    }
  });

  async function requestTranslation() {
    if (!canTranslate || translating) return;

    translating = true;
    translationProgress = 0;
    error = null;

    try {
      const result = await services.requestTranslation(documentId, selectedLanguage, {
        quality: 'standard'
      });

      if (result.status === 'already_exists') {
        translationExists = true;
        translating = false;
        // Reload to get cached translations
        const existing = await services.checkTranslation(documentId, selectedLanguage);
        if (existing.translations) {
          translations = existing.translations;
        }
        return;
      }

      jobId = result.jobId;
      // Poll for completion
      pollJobStatus();
    } catch (err) {
      error = err.message || 'Failed to request translation';
      translating = false;
    }
  }

  async function pollJobStatus() {
    if (!jobId) return;

    try {
      const status = await services.getTranslationStatus(jobId);

      if (status.status === 'completed') {
        translating = false;
        translationExists = true;
        // Load translations
        const existing = await services.checkTranslation(documentId, selectedLanguage);
        if (existing.translations) {
          translations = existing.translations;
        }
      } else if (status.status === 'failed') {
        error = status.error || 'Translation failed';
        translating = false;
      } else {
        // Update progress and continue polling
        translationProgress = status.progress || 0;
        setTimeout(pollJobStatus, 2000);
      }
    } catch (err) {
      error = err.message || 'Failed to check translation status';
      translating = false;
    }
  }

  async function onLanguageChange() {
    translations = {};
    translationExists = false;

    try {
      const existing = await services.checkTranslation(documentId, selectedLanguage);
      if (existing.exists) {
        translationExists = true;
        if (existing.translations) {
          translations = existing.translations;
        }
      }
    } catch (err) {
      // Ignore - just means no translation exists
    }
  }

  function copyTranslation(paragraphIndex) {
    const text = translations[paragraphIndex];
    if (text) {
      navigator.clipboard.writeText(text);
    }
  }
</script>

<div class="translation-view">
  <header class="translation-header">
    <div class="header-left">
      <h2>{document?.title || 'Translation View'}</h2>
      {#if document?.author}
        <span class="author">by {document.author}</span>
      {/if}
    </div>
    <div class="header-right">
      <select
        bind:value={selectedLanguage}
        onchange={onLanguageChange}
        disabled={translating}
        class="language-select"
      >
        {#each Object.entries(availableLanguages) as [code, name]}
          <option value={code}>{name}</option>
        {/each}
      </select>
      {#if canTranslate && !translationExists && !translating}
        <button onclick={requestTranslation} class="btn-primary">
          Translate
        </button>
      {/if}
      <button onclick={onClose} class="btn-close" aria-label="Close">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </header>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading document...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      <button onclick={() => error = null} class="btn-secondary">Dismiss</button>
    </div>
  {:else if !canTranslate}
    <div class="upgrade-notice">
      <h3>Patron Feature</h3>
      <p>Document translation requires a Patron subscription.</p>
    </div>
  {:else}
    {#if translating}
      <div class="progress-bar">
        <div class="progress-fill" style="width: {translationProgress}%"></div>
        <span class="progress-text">Translating... {translationProgress}%</span>
      </div>
    {/if}

    <div class="translation-content">
      <div class="column original">
        <h3 class="column-header">Original</h3>
        <div class="paragraphs">
          {#each paragraphs as para, i}
            <div class="paragraph" class:highlighted={translations[para.paragraph_index]}>
              <span class="para-num">{para.paragraph_index}</span>
              <p>{para.text}</p>
            </div>
          {/each}
        </div>
      </div>

      <div class="column translated">
        <h3 class="column-header">{availableLanguages[selectedLanguage] || 'Translation'}</h3>
        <div class="paragraphs">
          {#each paragraphs as para, i}
            <div class="paragraph" class:has-translation={translations[para.paragraph_index]}>
              <span class="para-num">{para.paragraph_index}</span>
              {#if translations[para.paragraph_index]}
                <p>{translations[para.paragraph_index]}</p>
                <button
                  class="copy-btn"
                  onclick={() => copyTranslation(para.paragraph_index)}
                  title="Copy translation"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              {:else if translationExists}
                <p class="pending">Loading...</p>
              {:else}
                <p class="pending">Not yet translated</p>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .translation-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface-0);
  }

  .translation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-default);
    background: var(--surface-1);
  }

  .header-left h2 {
    margin: 0;
    font-size: 1.125rem;
    color: var(--text-primary);
  }

  .author {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .language-select {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .btn-primary {
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-primary:hover {
    background: var(--accent-primary-hover);
  }

  .btn-secondary {
    padding: 0.5rem 1rem;
    background: var(--surface-2);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .btn-close {
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.5rem;
  }

  .btn-close:hover {
    background: var(--surface-2);
    color: var(--text-primary);
  }

  .loading, .error, .upgrade-notice {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    text-align: center;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error {
    color: var(--error);
  }

  .upgrade-notice h3 {
    margin: 0 0 0.5rem;
    color: var(--text-primary);
  }

  .upgrade-notice p {
    color: var(--text-secondary);
  }

  .progress-bar {
    position: relative;
    height: 2rem;
    background: var(--surface-1);
    border-bottom: 1px solid var(--border-default);
  }

  .progress-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: color-mix(in srgb, var(--accent-primary) 30%, transparent);
    transition: width 0.3s;
  }

  .progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.875rem;
    color: var(--text-primary);
    font-weight: 500;
  }

  .translation-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .column {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .column.original {
    border-right: 1px solid var(--border-default);
  }

  .column-header {
    padding: 0.75rem 1rem;
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    background: var(--surface-1);
    border-bottom: 1px solid var(--border-default);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .paragraphs {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .paragraph {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem;
    border-radius: 0.5rem;
    margin-bottom: 0.5rem;
    position: relative;
  }

  .paragraph:hover {
    background: var(--surface-1);
  }

  .paragraph.highlighted {
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  }

  .paragraph.has-translation {
    background: color-mix(in srgb, var(--success) 10%, transparent);
  }

  .para-num {
    flex-shrink: 0;
    width: 2rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: right;
    padding-top: 0.25rem;
  }

  .paragraph p {
    margin: 0;
    flex: 1;
    line-height: 1.6;
    color: var(--text-primary);
  }

  .paragraph p.pending {
    color: var(--text-muted);
    font-style: italic;
  }

  .copy-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    padding: 0.25rem;
    background: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 0.25rem;
    color: var(--text-secondary);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .paragraph:hover .copy-btn {
    opacity: 1;
  }

  .copy-btn:hover {
    background: var(--surface-3);
    color: var(--text-primary);
  }

  .w-4 { width: 1rem; }
  .h-4 { height: 1rem; }
  .w-5 { width: 1.25rem; }
  .h-5 { height: 1.25rem; }

  @media (max-width: 768px) {
    .translation-content {
      flex-direction: column;
    }

    .column.original {
      border-right: none;
      border-bottom: 1px solid var(--border-default);
    }
  }
</style>
