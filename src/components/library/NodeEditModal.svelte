<script>
  /**
   * NodeEditModal Component
   * Inline modal overlay for editing religion/collection metadata
   */

  import { authenticatedFetch } from '../../lib/api.js';

  let {
    node = null,
    isOpen = false,
    onClose = () => {},
    onSave = () => {}
  } = $props();

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';

  // Form state
  let symbol = $state('');
  let description = $state('');
  let coverImageUrl = $state('');
  let saving = $state(false);
  let generating = $state(false);
  let error = $state('');

  // Determine node type
  const isReligion = $derived(node?.node_type === 'religion');
  const isCollection = $derived(node?.node_type === 'collection');
  const nodeTitle = $derived(node?.name || 'Unknown');

  // Initialize form when node changes
  $effect(() => {
    if (node && isOpen) {
      symbol = node.symbol || '';
      description = node.description || node.overview || '';
      coverImageUrl = node.cover_image_url || '';
      error = '';
    }
  });

  // Handle escape key
  function handleKeydown(e) {
    if (e.key === 'Escape' && isOpen) {
      onClose();
    }
  }

  // Generate description with AI
  async function generateDescription() {
    if (!node?.id) return;

    generating = true;
    error = '';

    try {
      const res = await authenticatedFetch(`${API_BASE}/api/library/nodes/${node.id}/generate-description`, {
        method: 'POST'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate description');
      }

      const data = await res.json();
      description = data.description;
    } catch (err) {
      error = err.message;
    } finally {
      generating = false;
    }
  }

  // Save changes
  async function handleSave() {
    if (!node?.id) return;

    saving = true;
    error = '';

    try {
      const updates = {
        description
      };

      if (isReligion) {
        updates.symbol = symbol;
      }

      if (isCollection) {
        updates.cover_image_url = coverImageUrl;
      }

      const res = await authenticatedFetch(`${API_BASE}/api/library/nodes/${node.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save changes');
      }

      const updatedNode = await res.json();
      onSave(updatedNode);
      onClose();
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen && node}
  <!-- Backdrop -->
  <div
    class="modal-backdrop"
    onclick={onClose}
    role="button"
    tabindex="-1"
    aria-label="Close modal"
  ></div>

  <!-- Modal -->
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-header">
      <h2 id="modal-title" class="modal-title">
        Edit: {nodeTitle}
      </h2>
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="modal-body">
      {#if error}
        <div class="error-banner">
          {error}
        </div>
      {/if}

      {#if isReligion}
        <div class="form-group">
          <label for="symbol" class="form-label">Symbol</label>
          <div class="symbol-input-row">
            <input
              id="symbol"
              type="text"
              class="form-input symbol-input"
              bind:value={symbol}
              placeholder="Enter Unicode symbol"
              maxlength="4"
            />
            <span class="symbol-preview" title="Preview">{symbol || '?'}</span>
          </div>
          <p class="form-hint">
            Unicode character or emoji (e.g., ☪, ✝, ☸, ॐ)
          </p>
        </div>
      {/if}

      <div class="form-group">
        <label for="description" class="form-label">Description</label>
        <textarea
          id="description"
          class="form-textarea"
          bind:value={description}
          placeholder="Enter a description..."
          rows="4"
        ></textarea>
        <div class="form-actions-inline">
          <button
            class="generate-btn"
            onclick={generateDescription}
            disabled={generating}
          >
            {#if generating}
              <span class="spinner"></span>
              Generating...
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              Generate with AI
            {/if}
          </button>
        </div>
      </div>

      {#if isCollection}
        <div class="form-group">
          <label for="cover-image" class="form-label">Cover Image URL</label>
          <input
            id="cover-image"
            type="url"
            class="form-input"
            bind:value={coverImageUrl}
            placeholder="https://example.com/image.jpg"
          />
          {#if coverImageUrl}
            <div class="image-preview">
              <img src={coverImageUrl} alt="Cover preview" onerror={(e) => e.target.style.display = 'none'} />
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" onclick={onClose} disabled={saving}>
        Cancel
      </button>
      <button class="btn btn-primary" onclick={handleSave} disabled={saving}>
        {#if saving}
          <span class="spinner"></span>
          Saving...
        {:else}
          Save Changes
        {/if}
      </button>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 100;
    animation: fadeIn 0.15s ease;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 32rem;
    max-height: 90vh;
    background: var(--surface-0);
    border-radius: 1rem;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
    z-index: 101;
    display: flex;
    flex-direction: column;
    animation: slideIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translate(-50%, -48%);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .modal-title {
    font-family: 'Libre Caslon Text', Georgia, serif;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    background: none;
    border: none;
    border-radius: 0.5rem;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    background: var(--surface-2);
    color: var(--text-primary);
  }

  .close-btn svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .error-banner {
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    background: var(--error-bg, #fef2f2);
    color: var(--error, #dc2626);
    border-radius: 0.5rem;
    font-size: 0.875rem;
  }

  .form-group {
    margin-bottom: 1.25rem;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  .form-input,
  .form-textarea {
    width: 100%;
    padding: 0.625rem 0.875rem;
    font-size: 0.9375rem;
    color: var(--text-primary);
    background: var(--surface-0);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .form-input:focus,
  .form-textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(139, 115, 85, 0.1);
  }

  .form-textarea {
    resize: vertical;
    min-height: 6rem;
    line-height: 1.5;
  }

  .symbol-input-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .symbol-input {
    flex: 1;
    max-width: 8rem;
    text-align: center;
    font-size: 1.25rem;
  }

  .symbol-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    font-size: 2rem;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
  }

  .form-hint {
    margin: 0.375rem 0 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .form-actions-inline {
    margin-top: 0.5rem;
  }

  .generate-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--accent);
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .generate-btn:hover:not(:disabled) {
    background: var(--surface-2);
  }

  .generate-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .generate-btn svg {
    width: 1rem;
    height: 1rem;
  }

  .image-preview {
    margin-top: 0.75rem;
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid var(--border-subtle);
  }

  .image-preview img {
    display: block;
    width: 100%;
    max-height: 8rem;
    object-fit: cover;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border-subtle);
    background: var(--surface-1);
    border-radius: 0 0 1rem 1rem;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.625rem 1.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .btn-secondary {
    color: var(--text-secondary);
    background: var(--surface-0);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--surface-2);
  }

  .btn-primary {
    color: white;
    background: var(--accent);
    border: 1px solid var(--accent);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Mobile adjustments */
  @media (max-width: 480px) {
    .modal {
      width: 95%;
      max-height: 95vh;
    }

    .modal-header {
      padding: 1rem;
    }

    .modal-body {
      padding: 1rem;
    }

    .modal-footer {
      padding: 1rem;
    }
  }
</style>
