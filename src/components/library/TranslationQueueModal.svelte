<script>
  /**
   * TranslationQueueModal Component
   *
   * Allows admins to queue translation jobs for documents.
   * Generates both reading (literary) and study (literal + notes) translations together.
   */

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';

  let {
    isOpen = $bindable(false),
    documentId = '',
    documentTitle = '',
    documentLanguage = 'ar',
    onClose = () => {}
  } = $props();

  // Form state
  let targetLanguage = $state('en');
  let quality = $state('standard'); // 'standard' | 'high'
  let loading = $state(false);
  let error = $state(null);
  let success = $state(false);
  let jobId = $state(null);

  async function queueTranslation() {
    if (!documentId) return;

    loading = true;
    error = null;
    success = false;

    try {
      const res = await fetch(`${API_BASE}/api/services/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          documentId,
          targetLanguage,
          quality
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to queue translation');
      }

      const data = await res.json();
      jobId = data.jobId;
      success = true;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function handleClose() {
    isOpen = false;
    // Reset state
    error = null;
    success = false;
    jobId = null;
    onClose();
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }
</script>

{#if isOpen}
  <div class="modal-overlay" onclick={handleOverlayClick}>
    <div class="modal-content">
      <div class="modal-header">
        <h3>Queue Translation</h3>
        <button class="close-btn" onclick={handleClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {#if success}
        <div class="success-state">
          <svg class="success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
          <h4>Translation Queued</h4>
          <p>Job ID: <code>{jobId}</code></p>
          <p class="hint">Both reading and study translations will be generated. Check back soon.</p>
          <button class="primary-btn" onclick={handleClose}>Done</button>
        </div>
      {:else}
        <div class="modal-body">
          <div class="doc-info">
            <span class="doc-title">{documentTitle}</span>
            <span class="doc-lang">{documentLanguage.toUpperCase()} → {targetLanguage.toUpperCase()}</span>
          </div>

          <div class="translation-info">
            <p>This will generate both translation types:</p>
            <ul>
              <li><strong>Reading Translation</strong> — Literary, fluent English for casual reading</li>
              <li><strong>Study Translation</strong> — Literal translation with linguistic notes</li>
            </ul>
          </div>

          <div class="form-group">
            <label for="quality">Quality Level</label>
            <select id="quality" bind:value={quality}>
              <option value="standard">Standard</option>
              <option value="high">High (slower, more accurate)</option>
            </select>
          </div>

          {#if error}
            <div class="error-message">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
              {error}
            </div>
          {/if}
        </div>

        <div class="modal-footer">
          <button class="secondary-btn" onclick={handleClose} disabled={loading}>
            Cancel
          </button>
          <button class="primary-btn" onclick={queueTranslation} disabled={loading}>
            {#if loading}
              <svg class="spinner" viewBox="0 0 24 24" width="16" height="16">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
              </svg>
              Queueing...
            {:else}
              Queue Translation
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    background: var(--surface-1, white);
    border-radius: 0.75rem;
    max-width: 480px;
    width: 100%;
    max-height: 90vh;
    overflow: auto;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border-default, #e5e5e5);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .close-btn {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted, #666);
    border-radius: 0.375rem;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: var(--hover-overlay, rgba(0, 0, 0, 0.05));
    color: var(--text-primary, #1a1a1a);
  }

  .close-btn svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .modal-body {
    padding: 1.5rem;
  }

  .doc-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--surface-2, #f5f5f5);
    border-radius: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .doc-title {
    font-weight: 500;
    color: var(--text-primary, #1a1a1a);
    font-size: 0.875rem;
  }

  .doc-lang {
    font-size: 0.75rem;
    color: var(--text-muted, #666);
    padding: 0.25rem 0.5rem;
    background: var(--surface-3, #e5e5e5);
    border-radius: 0.25rem;
  }

  .form-group {
    margin-bottom: 1.25rem;
  }

  .form-group > label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary, #1a1a1a);
    margin-bottom: 0.5rem;
  }

  .translation-info {
    padding: 1rem;
    background: rgba(59, 130, 246, 0.05);
    border: 1px solid rgba(59, 130, 246, 0.15);
    border-radius: 0.5rem;
    margin-bottom: 1.25rem;
  }

  .translation-info p {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    color: var(--text-secondary, #444);
  }

  .translation-info ul {
    margin: 0;
    padding-left: 1.25rem;
  }

  .translation-info li {
    font-size: 0.8125rem;
    color: var(--text-secondary, #444);
    margin-bottom: 0.25rem;
  }

  .translation-info li:last-child {
    margin-bottom: 0;
  }

  .translation-info strong {
    color: var(--text-primary, #1a1a1a);
  }

  select {
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--border-default, #e5e5e5);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-primary, #1a1a1a);
    background: var(--surface-1, white);
    cursor: pointer;
  }

  select:focus {
    outline: none;
    border-color: var(--accent-primary, #3b82f6);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.2);
    border-radius: 0.5rem;
    color: #dc2626;
    font-size: 0.875rem;
  }

  .error-message svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border-default, #e5e5e5);
  }

  .primary-btn,
  .secondary-btn {
    padding: 0.625rem 1.25rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s;
  }

  .primary-btn {
    background: var(--accent-primary, #3b82f6);
    color: white;
    border: none;
  }

  .primary-btn:hover:not(:disabled) {
    background: var(--accent-hover, #2563eb);
  }

  .primary-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .secondary-btn {
    background: none;
    border: 1px solid var(--border-default, #e5e5e5);
    color: var(--text-secondary, #444);
  }

  .secondary-btn:hover:not(:disabled) {
    background: var(--hover-overlay, rgba(0, 0, 0, 0.05));
  }

  .secondary-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .success-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem;
    text-align: center;
  }

  .success-icon {
    width: 3rem;
    height: 3rem;
    color: #10b981;
    margin-bottom: 1rem;
  }

  .success-state h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
    color: var(--text-primary, #1a1a1a);
  }

  .success-state p {
    margin: 0 0 0.5rem 0;
    color: var(--text-secondary, #444);
    font-size: 0.875rem;
  }

  .success-state code {
    font-family: monospace;
    padding: 0.125rem 0.375rem;
    background: var(--surface-2, #f5f5f5);
    border-radius: 0.25rem;
    font-size: 0.8125rem;
  }

  .hint {
    color: var(--text-muted, #666);
    font-size: 0.8125rem;
    margin-bottom: 1rem !important;
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
