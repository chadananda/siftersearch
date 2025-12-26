<script>
  import { createEventDispatcher } from 'svelte';
  import { marked } from 'marked';

  let { documents = [], selectedId = null, isAdmin = false } = $props();

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  const dispatch = createEventDispatcher();

  // Accordion: only one document expanded at a time
  let expandedDocId = $state(null);
  let expandedContent = $state(null);
  let loadingContent = $state(false);

  function toggleDocument(doc) {
    if (expandedDocId === doc.id) {
      // Collapse
      expandedDocId = null;
      expandedContent = null;
    } else {
      // Expand new document
      expandedDocId = doc.id;
      expandedContent = null;
      loadDocumentContent(doc.id);
    }
    dispatch('select', doc);
  }

  async function loadDocumentContent(docId) {
    loadingContent = true;
    try {
      const res = await fetch(`${API_BASE}/api/library/documents/${docId}?paragraphs=true`);
      if (!res.ok) throw new Error('Failed to load content');
      const data = await res.json();
      expandedContent = data;
    } catch (err) {
      console.error('Content load error:', err);
      expandedContent = { error: err.message };
    } finally {
      loadingContent = false;
    }
  }

  function getEditUrl(doc) {
    // Build path to source file (if we have file_path)
    if (doc.file_path) {
      return doc.file_path;
    }
    return null;
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'indexed': return { icon: '✓', color: 'success', label: 'Indexed' };
      case 'processing': return { icon: '⏳', color: 'warning', label: 'Processing' };
      case 'unindexed': return { icon: '○', color: 'muted', label: 'Not indexed' };
      default: return { icon: '?', color: 'muted', label: 'Unknown' };
    }
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
    if (authority >= 10) return { label: '★★★', title: 'Sacred Text', class: 'text-accent' };
    if (authority >= 9) return { label: '★★☆', title: 'Authoritative', class: 'text-accent' };
    if (authority >= 8) return { label: '★☆☆', title: 'Institutional', class: 'text-success' };
    if (authority >= 7) return { label: '◆', title: 'Official', class: 'text-success' };
    if (authority >= 5) return { label: '◇', title: 'Published', class: 'text-secondary' };
    if (authority >= 3) return { label: '○', title: 'Research', class: 'text-muted' };
    return { label: '·', title: 'Unofficial', class: 'text-muted' };
  }

  function renderParagraphs(paragraphs) {
    if (!paragraphs || paragraphs.length === 0) return '<p class="text-muted">No content available</p>';
    return paragraphs.map(p => `<p>${p.text || p.content || ''}</p>`).join('');
  }
</script>

<div class="document-list">
  {#each documents as doc}
    {@const status = getStatusIcon(doc.status)}
    {@const size = getSizeLabel(doc.paragraph_count)}
    {@const auth = getAuthorityInfo(doc.authority)}
    {@const isExpanded = expandedDocId === doc.id}

    <div class="document-item" class:expanded={isExpanded}>
      <!-- Document row header -->
      <button
        class="document-row"
        class:expanded={isExpanded}
        onclick={() => toggleDocument(doc)}
      >
        <span class="expand-indicator">{isExpanded ? '▼' : '▶'}</span>

        <div class="doc-main">
          <span class="doc-title">{doc.title || 'Untitled'}</span>
          {#if doc.author}
            <span class="doc-author">{doc.author}</span>
          {/if}
        </div>

        <div class="doc-badges">
          {#if auth}
            <span class="badge authority {auth.class}" title="{auth.title}">{auth.label}</span>
          {/if}
          {#if size}
            <span class="badge size" title="{doc.paragraph_count?.toLocaleString()} paragraphs">{size}</span>
          {/if}
        </div>
      </button>

      <!-- Expanded content -->
      {#if isExpanded}
        <div class="document-expanded">
          {#if loadingContent}
            <div class="loading">
              <span class="spinner"></span>
              Loading content...
            </div>
          {:else if expandedContent?.error}
            <div class="error">Failed to load content: {expandedContent.error}</div>
          {:else if expandedContent}
            <!-- Metadata section -->
            <div class="metadata-grid">
              {#if expandedContent.document?.author}
                <div class="meta-item">
                  <span class="meta-label">Author</span>
                  <span class="meta-value">{expandedContent.document.author}</span>
                </div>
              {/if}
              {#if expandedContent.document?.year}
                <div class="meta-item">
                  <span class="meta-label">Year</span>
                  <span class="meta-value">{expandedContent.document.year}</span>
                </div>
              {/if}
              {#if expandedContent.document?.language}
                <div class="meta-item">
                  <span class="meta-label">Language</span>
                  <span class="meta-value">{expandedContent.document.language}</span>
                </div>
              {/if}
              {#if expandedContent.document?.paragraph_count}
                <div class="meta-item">
                  <span class="meta-label">Paragraphs</span>
                  <span class="meta-value">{expandedContent.document.paragraph_count.toLocaleString()}</span>
                </div>
              {/if}
              {#if expandedContent.document?.status}
                <div class="meta-item">
                  <span class="meta-label">Status</span>
                  <span class="meta-value">{expandedContent.document.status}</span>
                </div>
              {/if}
            </div>

            <!-- Admin: Edit source link -->
            {#if isAdmin && expandedContent.assets?.length > 0}
              {@const originalFile = expandedContent.assets.find(a => a.asset_type === 'original')}
              {#if originalFile?.storage_url}
                <div class="admin-actions">
                  <a
                    href={originalFile.storage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="edit-link"
                  >
                    Edit Source
                    <svg class="external-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                </div>
              {/if}
            {/if}

            <!-- Content preview -->
            <div class="content-preview">
              <div class="content-scroll">
                {#if expandedContent.paragraphs?.length > 0}
                  {#each expandedContent.paragraphs as para}
                    <p class="paragraph">{para.text || para.content || ''}</p>
                  {/each}
                {:else}
                  <p class="no-content">No content available</p>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .document-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .document-item {
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    overflow: hidden;
    transition: border-color 0.15s ease;
  }

  .document-item:hover {
    border-color: var(--border-default);
  }

  .document-item.expanded {
    border-color: var(--accent-primary);
  }

  /* Document row header */
  .document-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: var(--surface-1);
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .document-row:hover {
    background: var(--surface-2);
  }

  .document-row.expanded {
    background: color-mix(in srgb, var(--accent-primary) 10%, var(--surface-1));
    border-bottom: 1px solid var(--border-subtle);
  }

  .expand-indicator {
    font-size: 0.625rem;
    color: var(--text-muted);
    width: 1rem;
    flex-shrink: 0;
  }

  .doc-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .doc-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .doc-author {
    font-size: 0.75rem;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .doc-badges {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-shrink: 0;
  }

  .badge {
    font-size: 0.6875rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
  }

  .badge.authority {
    font-weight: 600;
  }

  .badge.size {
    background: var(--surface-2);
    color: var(--text-muted);
  }

  /* Expanded content */
  .document-expanded {
    padding: 1rem;
    background: var(--surface-0);
    border-top: 1px solid var(--border-subtle);
  }

  .loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    color: var(--text-muted);
    font-size: 0.875rem;
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

  .error {
    padding: 0.75rem;
    background: color-mix(in srgb, var(--error) 10%, transparent);
    color: var(--error);
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  .metadata-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .meta-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .meta-value {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .admin-actions {
    margin-bottom: 1rem;
  }

  .edit-link {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    background: var(--surface-2);
    color: var(--accent-primary);
    font-size: 0.8125rem;
    font-weight: 500;
    text-decoration: none;
    border-radius: 0.375rem;
    transition: background 0.15s ease;
  }

  .edit-link:hover {
    background: var(--surface-3);
  }

  .external-icon {
    width: 0.875rem;
    height: 0.875rem;
  }

  .content-preview {
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    background: var(--surface-1);
  }

  .content-scroll {
    max-height: 300px;
    overflow-y: auto;
    padding: 1rem;
  }

  .paragraph {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .paragraph:last-child {
    margin-bottom: 0;
  }

  .no-content {
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.875rem;
  }

  /* Text color utility classes */
  :global(.text-accent) { color: var(--accent-primary); }
  :global(.text-success) { color: var(--success); }
  :global(.text-secondary) { color: var(--text-secondary); }
  :global(.text-muted) { color: var(--text-muted); }
</style>
