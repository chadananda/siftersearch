<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { marked } from 'marked';
  import { getAccessToken } from '../../lib/api.js';

  let { document = null, isAdmin = false } = $props();

  const dispatch = createEventDispatcher();
  const API_BASE = import.meta.env.PUBLIC_API_URL || '';

  // State
  let activeTab = $state('metadata');
  let loading = $state(false);
  let saving = $state(false);
  let error = $state(null);

  // Document detail data
  let paragraphs = $state([]);
  let assets = $state([]);
  let contentData = $state(null);

  // Editable metadata
  let editableDoc = $state({});
  let hasChanges = $state(false);
  let showPrintMenu = $state(false);

  // Tabs configuration
  let tabs = $derived([
    { id: 'metadata', label: 'Metadata', icon: 'info' },
    { id: 'content', label: 'Content', icon: 'file-text' },
    ...(isAdmin ? [
      { id: 'compare', label: 'Compare', icon: 'git-compare' },
      { id: 'assets', label: 'Assets', icon: 'folder' }
    ] : [])
  ]);

  // Initialize editable doc when document changes
  $effect(() => {
    if (document) {
      editableDoc = { ...document };
      hasChanges = false;
      loadDetails();
    }
  });

  async function loadDetails() {
    loading = true;
    error = null;

    try {
      const res = await fetch(`${API_BASE}/api/library/documents/${document.id}?includeParagraphs=true&paragraphLimit=500`);
      if (!res.ok) throw new Error('Failed to load document details');
      const data = await res.json();
      paragraphs = data.paragraphs || [];
      assets = data.assets || [];
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function loadCompareContent() {
    if (!isAdmin || contentData) return;

    loading = true;
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/api/library/documents/${document.id}/content`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load content comparison');
      contentData = await res.json();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function saveMetadata() {
    saving = true;
    error = null;

    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/api/library/documents/${document.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: editableDoc.title,
          author: editableDoc.author,
          religion: editableDoc.religion,
          collection: editableDoc.collection,
          language: editableDoc.language,
          year: editableDoc.year,
          description: editableDoc.description
        })
      });

      if (!res.ok) throw new Error('Failed to save changes');

      hasChanges = false;
      dispatch('update', editableDoc);
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  async function reindexDocument() {
    if (!confirm('Re-index this document from the original file? This will replace all indexed content.')) {
      return;
    }

    saving = true;
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/api/library/documents/${document.id}/reindex`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to queue re-index');

      alert('Document queued for re-indexing');
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  function close() {
    dispatch('close');
  }

  function openPrintView(type) {
    const params = new URLSearchParams({
      doc: document.id,
      religion: document.religion || '',
      collection: document.collection || ''
    });
    window.open(`/print/${type}?${params.toString()}`, '_blank');
    showPrintMenu = false;
  }

  function handleClickOutside(event) {
    if (showPrintMenu && !event.target.closest('.print-dropdown')) {
      showPrintMenu = false;
    }
  }

  // Close print menu on outside click
  $effect(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
    }
  });

  function handleMetadataChange() {
    hasChanges = JSON.stringify(editableDoc) !== JSON.stringify(document);
  }

  function renderMarkdown(text) {
    if (!text) return '';
    return marked.parse(text);
  }

  // Load compare content when tab changes to compare
  $effect(() => {
    if (activeTab === 'compare' && isAdmin) {
      loadCompareContent();
    }
  });
</script>

<div class="detail-overlay" onclick={close}>
  <div class="detail-panel" onclick={(e) => e.stopPropagation()}>
    <!-- Header -->
    <header class="detail-header">
      <button class="back-button" onclick={close}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <h2 class="detail-title">{document?.title || 'Document'}</h2>
      {#if isAdmin && hasChanges}
        <button class="save-button" onclick={saveMetadata} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      {/if}
      <div class="print-dropdown">
        <button class="print-button" onclick={() => showPrintMenu = !showPrintMenu} title="Print options">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9V2h12v7"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
        </button>
        {#if showPrintMenu}
          <div class="print-menu">
            <button class="print-menu-item" onclick={() => openPrintView('reading')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              <div class="print-menu-text">
                <span class="print-menu-title">Reading Edition</span>
                <span class="print-menu-desc">Side-by-side paragraphs</span>
              </div>
            </button>
            <button class="print-menu-item" onclick={() => openPrintView('study')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              <div class="print-menu-text">
                <span class="print-menu-title">Study Edition</span>
                <span class="print-menu-desc">Phrase-by-phrase alignment</span>
              </div>
            </button>
          </div>
        {/if}
      </div>
      <button class="close-button" onclick={close}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </header>

    <!-- Tabs -->
    <nav class="detail-tabs">
      {#each tabs as tab}
        <button
          class="tab-button"
          class:active={activeTab === tab.id}
          onclick={() => activeTab = tab.id}
        >
          {tab.label}
        </button>
      {/each}
    </nav>

    <!-- Tab content -->
    <div class="detail-content">
      {#if loading && paragraphs.length === 0}
        <div class="loading-state">
          <svg class="spinner" viewBox="0 0 24 24" width="32" height="32">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
          </svg>
          Loading...
        </div>
      {:else if error}
        <div class="error-state">{error}</div>
      {:else if activeTab === 'metadata'}
        <!-- Metadata Tab - Compact table view with editable fields for admins -->
        <div class="metadata-table">
          <table class="w-full text-sm">
            <tbody>
              <tr class="border-b border-border">
                <th class="py-2 px-3 text-left text-xs font-semibold text-secondary uppercase w-28">Author</th>
                <td class="py-2 px-3 text-primary">
                  {#if isAdmin}
                    <input type="text" bind:value={editableDoc.author} oninput={handleMetadataChange}
                      class="w-full bg-transparent border-none p-0 text-sm focus:outline-none focus:ring-0" />
                  {:else}
                    {document?.author || '—'}
                  {/if}
                </td>
              </tr>
              <tr class="border-b border-border">
                <th class="py-2 px-3 text-left text-xs font-semibold text-secondary uppercase">Religion</th>
                <td class="py-2 px-3 text-primary">
                  {#if isAdmin}
                    <input type="text" bind:value={editableDoc.religion} oninput={handleMetadataChange}
                      class="w-full bg-transparent border-none p-0 text-sm focus:outline-none focus:ring-0" />
                  {:else}
                    {document?.religion || '—'}
                  {/if}
                </td>
              </tr>
              <tr class="border-b border-border">
                <th class="py-2 px-3 text-left text-xs font-semibold text-secondary uppercase">Collection</th>
                <td class="py-2 px-3 text-primary">
                  {#if isAdmin}
                    <input type="text" bind:value={editableDoc.collection} oninput={handleMetadataChange}
                      class="w-full bg-transparent border-none p-0 text-sm focus:outline-none focus:ring-0" />
                  {:else}
                    {document?.collection || '—'}
                  {/if}
                </td>
              </tr>
              {#if isAdmin}
                <tr class="border-b border-border">
                  <th class="py-2 px-3 text-left text-xs font-semibold text-secondary uppercase">Authority</th>
                  <td class="py-2 px-3 text-primary">{document?.authority || 5}</td>
                </tr>
              {/if}
              <tr class="border-b border-border">
                <th class="py-2 px-3 text-left text-xs font-semibold text-secondary uppercase">Language</th>
                <td class="py-2 px-3 text-primary">
                  {#if isAdmin}
                    <input type="text" bind:value={editableDoc.language} oninput={handleMetadataChange}
                      class="w-full bg-transparent border-none p-0 text-sm focus:outline-none focus:ring-0" />
                  {:else}
                    {document?.language || '—'}
                  {/if}
                </td>
              </tr>
              {#if document?.year}
                <tr class="border-b border-border">
                  <th class="py-2 px-3 text-left text-xs font-semibold text-secondary uppercase">Year</th>
                  <td class="py-2 px-3 text-primary">
                    {#if isAdmin}
                      <input type="number" bind:value={editableDoc.year} oninput={handleMetadataChange}
                        class="w-full bg-transparent border-none p-0 text-sm focus:outline-none focus:ring-0" />
                    {:else}
                      {document?.year}
                    {/if}
                  </td>
                </tr>
              {/if}
              <tr class="border-b border-border">
                <th class="py-2 px-3 text-left text-xs font-semibold text-secondary uppercase">Size</th>
                <td class="py-2 px-3 text-muted">{document?.paragraph_count?.toLocaleString() || 0} paragraphs</td>
              </tr>
              {#if document?.description}
                <tr>
                  <th class="py-2 px-3 text-left text-xs font-semibold text-secondary uppercase align-top">Description</th>
                  <td class="py-2 px-3 text-secondary whitespace-pre-wrap">
                    {#if isAdmin}
                      <textarea bind:value={editableDoc.description} oninput={handleMetadataChange} rows="3"
                        class="w-full bg-surface-1 border border-border rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"></textarea>
                    {:else}
                      {document?.description}
                    {/if}
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>

      {:else if activeTab === 'content'}
        <!-- Content Tab - Endless scroller style -->
        <div class="content-scroll">
          {#each paragraphs as para, i}
            <div class="content-block" data-index={para.paragraph_index}>
              {#if para.heading}
                <h3 class="text-base font-semibold text-primary mb-2">{para.heading}</h3>
              {/if}
              <div class="text-sm text-secondary leading-relaxed prose prose-sm max-w-none">{@html renderMarkdown(para.text)}</div>
            </div>
          {/each}
          {#if paragraphs.length === 0}
            <div class="empty-content">No content available</div>
          {/if}
        </div>

      {:else if activeTab === 'compare' && isAdmin}
        <!-- Compare Tab -->
        <div class="compare-view">
          {#if loading}
            <div class="loading-state">Loading comparison...</div>
          {:else if contentData}
            <div class="compare-header">
              <div class="compare-col-header">Indexed Content ({contentData.paragraphCount} paragraphs)</div>
              <div class="compare-col-header">Original File {contentData.originalAsset ? `(${contentData.originalAsset.fileName})` : '(not available)'}</div>
            </div>
            <div class="compare-grid">
              <div class="compare-col indexed">
                <pre>{contentData.indexed || 'No indexed content'}</pre>
              </div>
              <div class="compare-col original">
                {#if contentData.original}
                  <pre>{contentData.original}</pre>
                {:else}
                  <div class="no-original">Original file not available</div>
                {/if}
              </div>
            </div>
            <div class="compare-actions">
              <button class="action-button" onclick={reindexDocument} disabled={saving}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                Re-index from Original
              </button>
            </div>
          {:else}
            <div class="empty-content">Unable to load comparison data</div>
          {/if}
        </div>

      {:else if activeTab === 'assets' && isAdmin}
        <!-- Assets Tab -->
        <div class="assets-list">
          {#each assets as asset}
            <div class="asset-item">
              <div class="asset-icon">
                {#if asset.asset_type === 'cover'}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                {/if}
              </div>
              <div class="asset-info">
                <div class="asset-name">{asset.file_name || asset.asset_type}</div>
                <div class="asset-meta">
                  <span class="asset-type">{asset.asset_type}</span>
                  {#if asset.file_size}
                    <span class="asset-size">{(asset.file_size / 1024).toFixed(1)} KB</span>
                  {/if}
                  {#if asset.content_type}
                    <span class="asset-mime">{asset.content_type}</span>
                  {/if}
                </div>
              </div>
              {#if asset.storage_url}
                <a href={asset.storage_url} target="_blank" rel="noopener" class="asset-link">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              {/if}
            </div>
          {/each}
          {#if assets.length === 0}
            <div class="empty-content">No assets available</div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .detail-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 200;
    display: flex;
    justify-content: flex-end;
  }

  .detail-panel {
    width: 100%;
    max-width: 600px;
    height: 100%;
    background: var(--surface-solid);
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
    animation: slideIn 0.2s ease;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .detail-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    border-bottom: 1px solid var(--border-default);
  }

  .back-button,
  .close-button {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    border-radius: 0.5rem;
  }

  .back-button:hover,
  .close-button:hover {
    background: var(--hover-overlay);
    color: var(--text-primary);
  }

  .back-button svg,
  .close-button svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .detail-title {
    flex: 1;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .save-button {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: white;
    background: var(--accent-primary);
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .save-button:hover:not(:disabled) {
    background: var(--accent-primary-hover);
  }

  .save-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Print dropdown */
  .print-dropdown {
    position: relative;
  }

  .print-button {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    border-radius: 0.5rem;
  }

  .print-button:hover {
    background: var(--hover-overlay);
    color: var(--text-primary);
  }

  .print-button svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .print-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.5rem;
    background: var(--surface-solid);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 220px;
    z-index: 100;
    overflow: hidden;
  }

  .print-menu-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .print-menu-item:hover {
    background: var(--hover-overlay);
  }

  .print-menu-item:not(:last-child) {
    border-bottom: 1px solid var(--border-subtle);
  }

  .print-menu-item svg {
    width: 1.25rem;
    height: 1.25rem;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .print-menu-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .print-menu-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .print-menu-desc {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .detail-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-default);
    padding: 0 1rem;
  }

  .tab-button {
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-button:hover {
    color: var(--text-primary);
  }

  .tab-button.active {
    color: var(--accent-primary);
    border-bottom-color: var(--accent-primary);
  }

  .detail-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .loading-state,
  .error-state,
  .empty-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--text-muted);
    text-align: center;
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .error-state {
    color: var(--error);
  }

  /* Metadata table */
  .metadata-table {
    background: var(--surface-1);
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid var(--border-default);
  }

  /* Content scroll - endless scroller style */
  .content-scroll {
    display: flex;
    flex-direction: column;
  }

  .content-block {
    padding: 1rem 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .content-block:last-child {
    border-bottom: none;
  }

  .content-block :global(p) {
    margin: 0 0 0.5em 0;
  }

  .content-block :global(p:last-child) {
    margin-bottom: 0;
  }

  /* Compare view */
  .compare-view {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .compare-header {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .compare-col-header {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .compare-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    min-height: 300px;
  }

  .compare-col {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    overflow: auto;
    max-height: 400px;
  }

  .compare-col pre {
    margin: 0;
    padding: 0.75rem;
    font-size: 0.75rem;
    font-family: ui-monospace, monospace;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .no-original {
    padding: 2rem;
    text-align: center;
    color: var(--text-muted);
  }

  .compare-actions {
    display: flex;
    justify-content: flex-end;
  }

  .action-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--accent-primary);
    background: none;
    border: 1px solid var(--accent-primary);
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .action-button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  }

  .action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-button svg {
    width: 1rem;
    height: 1rem;
  }

  /* Assets list */
  .assets-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .asset-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
  }

  .asset-icon {
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    border-radius: 0.5rem;
    color: var(--text-secondary);
  }

  .asset-icon svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .asset-info {
    flex: 1;
    min-width: 0;
  }

  .asset-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .asset-meta {
    display: flex;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
  }

  .asset-type {
    text-transform: uppercase;
    font-weight: 500;
  }

  .asset-link {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent-primary);
    border-radius: 0.5rem;
    transition: background 0.15s ease;
  }

  .asset-link:hover {
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  }

  .asset-link svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  @media (max-width: 640px) {
    .detail-panel {
      max-width: 100%;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .compare-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
