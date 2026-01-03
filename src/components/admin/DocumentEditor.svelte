<script>
  /**
   * DocumentEditor Component
   * CodeMirror 6 based editor for editing library documents
   * Supports markdown with YAML frontmatter, RTL languages
   */
  import { onMount, onDestroy } from 'svelte';
  import { getAuthState } from '../../lib/auth.svelte.js';
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
  let content = $state('');
  let originalContent = $state('');
  let document = $state(null);
  let filePath = $state('');
  let editorContainer = $state(null);
  let editorView = $state(null);

  // Derived
  let dirty = $derived(content !== originalContent);
  let isRTL = $derived(document?.language && ['ar', 'fa', 'he', 'ur'].includes(document.language));

  // Load document
  async function loadDocument() {
    if (!documentId) {
      error = 'No document ID provided. Use ?id=DOCUMENT_ID in the URL.';
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
      content = data.content;
      originalContent = data.content;
      document = data.document;
      filePath = data.filePath;

      // Initialize editor after content loads
      await initEditor();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Initialize CodeMirror
  async function initEditor() {
    if (!editorContainer) return;

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
      doc: content,
      extensions: [
        basicSetup,
        markdown(),
        sifterTheme,
        rtlExtension,
        saveKeymap,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            content = update.state.doc.toString();
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
      const res = await authenticatedFetch(`${API_BASE}/api/library/documents/${documentId}/raw`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Failed to save document (${res.status})`);
      }

      const data = await res.json();
      originalContent = content;
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

  onMount(() => {
    // Parse document ID from URL query parameter
    const params = new URLSearchParams(window.location.search);
    documentId = params.get('id') || '';

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
          <h1 class="doc-title">{document?.title || 'Untitled'}</h1>
          <span class="doc-meta">
            {document?.religion}{document?.collection ? ` / ${document.collection}` : ''}
            {#if document?.language}
              <span class="lang-badge">{document.language.toUpperCase()}</span>
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

    <!-- File path indicator -->
    <div class="file-path">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span class="path-text">{filePath}</span>
    </div>

    <!-- Editor container -->
    <div class="editor-container" bind:this={editorContainer}></div>

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

  /* File path */
  .file-path {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--surface-1);
    border-bottom: 1px solid var(--border-default);
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .file-path svg {
    width: 0.875rem;
    height: 0.875rem;
    flex-shrink: 0;
  }

  .path-text {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
</style>
