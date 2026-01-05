<script>
  /**
   * DocumentEditor Component
   * CodeMirror 6 based editor for editing library documents
   * Supports markdown with YAML frontmatter, RTL languages
   * Two tabs: Metadata (form) and Content (CodeMirror)
   */
  import { onMount, onDestroy } from 'svelte';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';
  import { authenticatedFetch } from '../../lib/api.js';

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  const auth = getAuthState();

  // Get document ID from URL query parameter
  let documentId = $state('');

  // State
  let loading = $state(true);
  let saving = $state(false);
  let error = $state(null);
  let saveError = $state(null);
  let saveSuccess = $state(false);
  let rawContent = $state('');
  let originalContent = $state('');
  let document = $state(null);
  let filePath = $state('');
  let editorContainer = $state(null);
  let editorView = $state(null);
  let activeTab = $state('content'); // 'metadata' or 'content'

  // Parsed frontmatter and body
  let metadata = $state({});
  let bodyContent = $state('');
  let originalMetadata = $state({});
  let originalBodyContent = $state('');

  // Metadata field definitions
  const METADATA_FIELDS = [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'author', label: 'Author', type: 'text' },
    { key: 'language', label: 'Language', type: 'select', options: ['en', 'ar', 'fa', 'he', 'ur', 'es', 'fr', 'de', 'ru', 'zh'] },
    { key: 'religion', label: 'Religion', type: 'text' },
    { key: 'collection', label: 'Collection', type: 'text' },
    { key: 'year', label: 'Year', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'tags', label: 'Tags', type: 'text', help: 'Comma-separated list' }
  ];

  // Common optional fields that can be added
  const OPTIONAL_FIELDS = [
    { key: 'translator', label: 'Translator' },
    { key: 'source', label: 'Source URL' },
    { key: 'original_language', label: 'Original Language' },
    { key: 'publication', label: 'Publication' },
    { key: 'volume', label: 'Volume' },
    { key: 'page', label: 'Page' },
    { key: 'isbn', label: 'ISBN' },
    { key: 'doi', label: 'DOI' },
    { key: 'notes', label: 'Notes' },
    { key: 'category', label: 'Category' },
    { key: 'subcategory', label: 'Subcategory' },
    { key: 'era', label: 'Era/Period' },
    { key: 'location', label: 'Location' },
    { key: 'recipient', label: 'Recipient' }
  ];

  // State for add field dropdown
  let showAddField = $state(false);
  let newFieldKey = $state('');

  // Derived
  let dirty = $derived(
    JSON.stringify(metadata) !== JSON.stringify(originalMetadata) ||
    bodyContent !== originalBodyContent
  );
  let isRTL = $derived(metadata?.language && ['ar', 'fa', 'he', 'ur'].includes(metadata.language));
  let editorInitialized = $state(false);

  // Parse YAML frontmatter from content
  function parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
      return { metadata: {}, body: content };
    }

    const yamlStr = match[1];
    const body = match[2];

    // Simple YAML parser for flat key-value pairs
    const meta = {};
    for (const line of yamlStr.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        let value = line.slice(colonIdx + 1).trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        // Handle arrays (simple comma-separated in brackets)
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        }
        meta[key] = value;
      }
    }

    return { metadata: meta, body };
  }

  // Serialize metadata back to YAML frontmatter
  function serializeFrontmatter(meta, body) {
    const lines = ['---'];
    for (const [key, value] of Object.entries(meta)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        lines.push(`${key}: [${value.map(v => `"${v}"`).join(', ')}]`);
      } else if (typeof value === 'string' && (value.includes(':') || value.includes('#') || value.includes('\n'))) {
        lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    lines.push('---');
    lines.push('');
    return lines.join('\n') + body;
  }

  // Initialize editor when container becomes available and content is loaded
  $effect(() => {
    if (activeTab === 'content' && editorContainer && bodyContent && !editorInitialized && !loading && !error) {
      editorInitialized = true;
      initEditor();
    }
  });

  // Reinitialize editor when switching to content tab
  $effect(() => {
    if (activeTab === 'content' && editorContainer && !editorView && bodyContent && !loading && !error) {
      initEditor();
    }
  });

  // Load document
  async function loadDocument() {
    if (!documentId) {
      error = 'No document ID provided. Use ?id=DOCUMENT_ID in the URL.';
      loading = false;
      return;
    }

    // Check if user is authenticated and has admin access
    if (!auth.isAuthenticated) {
      error = 'You must be logged in to edit documents.';
      loading = false;
      return;
    }

    const isAdmin = ['admin', 'superadmin', 'editor'].includes(auth.user?.tier);
    if (!isAdmin) {
      error = 'You do not have permission to edit documents.';
      loading = false;
      return;
    }

    try {
      const res = await authenticatedFetch(`${API_BASE}/api/library/documents/${documentId}/raw`);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Failed to load document (${res.status})`);
      }

      const data = await res.json();
      rawContent = data.content;
      originalContent = data.content;
      document = data.document;
      filePath = data.filePath;

      // Parse frontmatter
      const parsed = parseFrontmatter(data.content);
      metadata = { ...parsed.metadata };
      bodyContent = parsed.body;
      originalMetadata = { ...parsed.metadata };
      originalBodyContent = parsed.body;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Initialize CodeMirror
  async function initEditor() {
    if (!editorContainer) return;

    // Destroy existing editor if any
    if (editorView) {
      editorView.destroy();
      editorView = null;
    }

    // Dynamically import CodeMirror modules
    const { EditorView, basicSetup } = await import('codemirror');
    const { EditorState } = await import('@codemirror/state');
    const { markdown } = await import('@codemirror/lang-markdown');
    const { keymap } = await import('@codemirror/view');

    // Create custom theme that matches our design system
    const sifterTheme = EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '14px'
      },
      '.cm-content': {
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        padding: '1rem'
      },
      '.cm-line': {
        padding: '0 0.5rem'
      },
      '.cm-gutters': {
        backgroundColor: 'var(--surface-1)',
        borderRight: '1px solid var(--border-default)',
        color: 'var(--text-muted)'
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--surface-2)'
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(139, 115, 85, 0.05)'
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: 'var(--accent-primary)'
      },
      '&.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: 'rgba(139, 115, 85, 0.2)'
      }
    });

    // RTL support
    const rtlExtension = isRTL ? EditorView.contentAttributes.of({ dir: 'auto' }) : [];

    // Save keyboard shortcut
    const saveKeymap = keymap.of([{
      key: 'Mod-s',
      run: () => {
        saveDocument();
        return true;
      }
    }]);

    // Create editor state
    const state = EditorState.create({
      doc: bodyContent,
      extensions: [
        basicSetup,
        markdown(),
        sifterTheme,
        rtlExtension,
        saveKeymap,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            bodyContent = update.state.doc.toString();
          }
        }),
        EditorView.lineWrapping
      ]
    });

    // Create editor view
    editorView = new EditorView({
      state,
      parent: editorContainer
    });
  }

  // Save document
  async function saveDocument() {
    if (saving || !dirty) return;

    saving = true;
    saveError = null;
    saveSuccess = false;

    try {
      // Recombine frontmatter and body
      const content = serializeFrontmatter(metadata, bodyContent);

      const res = await authenticatedFetch(`${API_BASE}/api/library/documents/${documentId}/raw`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Failed to save document (${res.status})`);
      }

      originalContent = content;
      originalMetadata = { ...metadata };
      originalBodyContent = bodyContent;
      saveSuccess = true;

      // Clear success message after 3 seconds
      setTimeout(() => { saveSuccess = false; }, 3000);
    } catch (err) {
      saveError = err.message;
    } finally {
      saving = false;
    }
  }

  // Warn about unsaved changes
  function handleBeforeUnload(e) {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  // Handle metadata field change
  function handleMetadataChange(key, value) {
    metadata = { ...metadata, [key]: value };
  }

  // Add a new metadata field
  function addMetadataField(key) {
    if (key && !metadata.hasOwnProperty(key)) {
      metadata = { ...metadata, [key]: '' };
    }
    showAddField = false;
    newFieldKey = '';
  }

  // Remove a metadata field
  function removeMetadataField(key) {
    const { [key]: _, ...rest } = metadata;
    metadata = rest;
  }

  // Get available fields to add (not already in metadata)
  function getAvailableFields() {
    const existingKeys = new Set([
      ...METADATA_FIELDS.map(f => f.key),
      ...Object.keys(metadata)
    ]);
    return OPTIONAL_FIELDS.filter(f => !existingKeys.has(f.key));
  }

  onMount(async () => {
    // Parse document ID from URL query parameter
    const params = new URLSearchParams(window.location.search);
    documentId = params.get('id') || '';

    // Initialize auth before loading document (sets access token)
    await initAuth();

    loadDocument();
    window.addEventListener('beforeunload', handleBeforeUnload);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    }
    if (editorView) {
      editorView.destroy();
    }
  });
</script>

<div class="editor-wrapper">
  {#if loading}
    <div class="loading-state">
      <svg class="spinner" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
      </svg>
      <span>Loading document...</span>
    </div>
  {:else if error}
    <div class="error-state">
      <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span class="error-message">{error}</span>
      <a href="/admin/documents" class="back-link">Back to Documents</a>
    </div>
  {:else}
    <!-- Header -->
    <header class="editor-header">
      <div class="header-left">
        <a href="/admin/documents" class="back-button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </a>
        <div class="doc-info">
          <h1 class="doc-title">{metadata?.title || document?.title || 'Untitled'}</h1>
          <span class="doc-meta">
            {metadata?.religion || document?.religion}{(metadata?.collection || document?.collection) ? ` / ${metadata?.collection || document?.collection}` : ''}
            {#if metadata?.language || document?.language}
              <span class="lang-badge">{(metadata?.language || document?.language).toUpperCase()}</span>
            {/if}
            {#if dirty}
              <span class="dirty-badge">Unsaved changes</span>
            {/if}
          </span>
        </div>
      </div>
      <div class="header-right">
        {#if saveSuccess}
          <span class="save-success">Saved!</span>
        {/if}
        {#if saveError}
          <span class="save-error">{saveError}</span>
        {/if}
        <button
          class="save-button"
          onclick={saveDocument}
          disabled={saving || !dirty}
        >
          {#if saving}
            <svg class="button-spinner" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
            </svg>
            Saving...
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            Save
          {/if}
        </button>
      </div>
    </header>

    <!-- Tabs -->
    <div class="tabs-bar">
      <button
        class="tab"
        class:active={activeTab === 'metadata'}
        onclick={() => activeTab = 'metadata'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        Metadata
      </button>
      <button
        class="tab"
        class:active={activeTab === 'content'}
        onclick={() => activeTab = 'content'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Content
      </button>
      <div class="tab-spacer"></div>
      <span class="file-path-inline">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        {filePath}
      </span>
    </div>

    <!-- Tab content -->
    <div class="tab-content">
      {#if activeTab === 'metadata'}
        <div class="metadata-editor">
          <div class="metadata-form">
            {#each METADATA_FIELDS as field}
              <div class="form-field">
                <label for={field.key}>
                  {field.label}
                  {#if field.required}<span class="required">*</span>{/if}
                </label>
                {#if field.type === 'textarea'}
                  <textarea
                    id={field.key}
                    value={metadata[field.key] || ''}
                    oninput={(e) => handleMetadataChange(field.key, e.target.value)}
                    rows="3"
                  ></textarea>
                {:else if field.type === 'select'}
                  <select
                    id={field.key}
                    value={metadata[field.key] || ''}
                    onchange={(e) => handleMetadataChange(field.key, e.target.value)}
                  >
                    <option value="">Select...</option>
                    {#each field.options as opt}
                      <option value={opt}>{opt.toUpperCase()}</option>
                    {/each}
                  </select>
                {:else}
                  <input
                    type="text"
                    id={field.key}
                    value={metadata[field.key] || ''}
                    oninput={(e) => handleMetadataChange(field.key, e.target.value)}
                  />
                {/if}
                {#if field.help}
                  <span class="field-help">{field.help}</span>
                {/if}
              </div>
            {/each}

            <!-- Show other metadata fields not in the form -->
            {#each Object.entries(metadata).filter(([k]) => !METADATA_FIELDS.some(f => f.key === k)) as [key, value]}
              <div class="form-field custom-field">
                <div class="field-header">
                  <label for={key}>{OPTIONAL_FIELDS.find(f => f.key === key)?.label || key}</label>
                  <button
                    type="button"
                    class="remove-field-btn"
                    onclick={() => removeMetadataField(key)}
                    title="Remove field"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                <input
                  type="text"
                  id={key}
                  value={typeof value === 'object' ? JSON.stringify(value) : value}
                  oninput={(e) => handleMetadataChange(key, e.target.value)}
                />
              </div>
            {/each}

            <!-- Add field section -->
            <div class="add-field-section">
              {#if showAddField}
                <div class="add-field-form">
                  <select
                    bind:value={newFieldKey}
                    onchange={() => newFieldKey && addMetadataField(newFieldKey)}
                  >
                    <option value="">Select a field to add...</option>
                    {#each getAvailableFields() as field}
                      <option value={field.key}>{field.label}</option>
                    {/each}
                    <option value="__custom__">+ Custom field...</option>
                  </select>
                  {#if newFieldKey === '__custom__'}
                    <div class="custom-field-input">
                      <input
                        type="text"
                        placeholder="Field name (e.g., my_field)"
                        onkeydown={(e) => {
                          if (e.key === 'Enter' && e.target.value) {
                            addMetadataField(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                          }
                        }}
                      />
                      <span class="field-hint">Press Enter to add</span>
                    </div>
                  {/if}
                  <button
                    type="button"
                    class="cancel-add-btn"
                    onclick={() => { showAddField = false; newFieldKey = ''; }}
                  >
                    Cancel
                  </button>
                </div>
              {:else}
                <button
                  type="button"
                  class="add-field-btn"
                  onclick={() => showAddField = true}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add Field
                </button>
              {/if}
            </div>
          </div>
        </div>
      {:else}
        <div class="editor-container" bind:this={editorContainer}></div>
      {/if}
    </div>

    <!-- Keyboard hints -->
    <div class="keyboard-hints">
      <span class="hint"><kbd>Cmd/Ctrl</kbd> + <kbd>S</kbd> Save</span>
    </div>
  {/if}
</div>

<style>
  .editor-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface-0);
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    height: 100%;
    color: var(--text-muted);
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-icon {
    width: 2.5rem;
    height: 2.5rem;
    color: var(--error);
  }

  .error-message {
    color: var(--error);
    font-weight: 500;
  }

  .back-link {
    color: var(--accent-primary);
    text-decoration: none;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  /* Header */
  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--surface-1);
    border-bottom: 1px solid var(--border-default);
    gap: 1rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    flex: 1;
  }

  .back-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.375rem;
    color: var(--text-secondary);
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .back-button:hover {
    background: var(--surface-2);
    color: var(--text-primary);
  }

  .back-button svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .doc-info {
    min-width: 0;
  }

  .doc-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .doc-meta {
    font-size: 0.75rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .lang-badge {
    display: inline-flex;
    padding: 0.125rem 0.375rem;
    background: var(--surface-2);
    border-radius: 0.25rem;
    font-size: 0.625rem;
    font-weight: 600;
  }

  .dirty-badge {
    display: inline-flex;
    padding: 0.125rem 0.375rem;
    background: var(--warning-bg, rgba(245, 158, 11, 0.1));
    color: var(--warning, #f59e0b);
    border-radius: 0.25rem;
    font-size: 0.625rem;
    font-weight: 600;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  .save-success {
    font-size: 0.875rem;
    color: var(--success, #10b981);
    font-weight: 500;
  }

  .save-error {
    font-size: 0.75rem;
    color: var(--error);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .save-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .save-button:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .save-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .save-button svg {
    width: 1rem;
    height: 1rem;
  }

  .button-spinner {
    animation: spin 1s linear infinite;
  }

  /* Tabs */
  .tabs-bar {
    display: flex;
    align-items: center;
    gap: 0;
    background: var(--surface-1);
    border-bottom: 1px solid var(--border-default);
    padding: 0 1rem;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -1px;
  }

  .tab:hover {
    color: var(--text-primary);
    background: var(--surface-2);
  }

  .tab.active {
    color: var(--accent-primary);
    border-bottom-color: var(--accent-primary);
  }

  .tab svg {
    width: 1rem;
    height: 1rem;
  }

  .tab-spacer {
    flex: 1;
  }

  .file-path-inline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-path-inline svg {
    width: 0.875rem;
    height: 0.875rem;
    flex-shrink: 0;
  }

  /* Tab content */
  .tab-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Metadata editor */
  .metadata-editor {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    background: var(--surface-0);
  }

  .metadata-form {
    max-width: 600px;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .form-field label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .form-field .required {
    color: var(--error);
  }

  .form-field input,
  .form-field select,
  .form-field textarea {
    padding: 0.625rem 0.75rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    color: var(--text-primary);
    transition: border-color 0.2s;
  }

  .form-field input:focus,
  .form-field select:focus,
  .form-field textarea:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .form-field textarea {
    resize: vertical;
    min-height: 80px;
  }

  .field-help {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  /* Custom field with remove button */
  .custom-field .field-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .remove-field-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    background: none;
    border: none;
    border-radius: 0.25rem;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .remove-field-btn:hover {
    background: var(--error);
    color: white;
  }

  .remove-field-btn svg {
    width: 0.875rem;
    height: 0.875rem;
  }

  /* Add field section */
  .add-field-section {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px dashed var(--border-default);
  }

  .add-field-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--surface-1);
    border: 1px dashed var(--border-default);
    border-radius: 0.375rem;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-field-btn:hover {
    background: var(--surface-2);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .add-field-btn svg {
    width: 1rem;
    height: 1rem;
  }

  .add-field-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .add-field-form select {
    padding: 0.625rem 0.75rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .custom-field-input {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .custom-field-input input {
    padding: 0.625rem 0.75rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .field-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .cancel-add-btn {
    align-self: flex-start;
    padding: 0.375rem 0.75rem;
    background: var(--surface-2);
    border: none;
    border-radius: 0.25rem;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cancel-add-btn:hover {
    background: var(--surface-3);
    color: var(--text-primary);
  }

  /* Editor container */
  .editor-container {
    flex: 1;
    overflow: hidden;
  }

  .editor-container :global(.cm-editor) {
    height: 100%;
  }

  .editor-container :global(.cm-scroller) {
    overflow: auto;
  }

  /* Keyboard hints */
  .keyboard-hints {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: var(--surface-1);
    border-top: 1px solid var(--border-default);
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .hint {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  kbd {
    display: inline-flex;
    padding: 0.125rem 0.375rem;
    background: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 0.25rem;
    font-family: inherit;
    font-size: 0.625rem;
  }

  @media (max-width: 640px) {
    .file-path-inline {
      display: none;
    }

    .metadata-editor {
      padding: 1rem;
    }
  }
</style>
