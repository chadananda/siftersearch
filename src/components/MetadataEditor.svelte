<script>
  /**
   * MetadataEditor Component
   * Edit document metadata before approval
   */
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  let { metadata = {}, analysisResult = null, readonly = false } = $props();

  // Editable fields
  let title = $state(metadata.title || '');
  let author = $state(metadata.author || '');
  let year = $state(metadata.year || '');
  let language = $state(metadata.language || 'en');
  let religion = $state(metadata.religion || '');
  let collection = $state(metadata.collection || '');
  let description = $state(metadata.description || '');
  let tags = $state((metadata.tags || []).join(', '));

  // Religion options
  const RELIGIONS = [
    { value: '', label: 'Not specified' },
    { value: 'bahai', label: "Baha'i Faith" },
    { value: 'buddhism', label: 'Buddhism' },
    { value: 'christianity', label: 'Christianity' },
    { value: 'hinduism', label: 'Hinduism' },
    { value: 'islam', label: 'Islam' },
    { value: 'jainism', label: 'Jainism' },
    { value: 'judaism', label: 'Judaism' },
    { value: 'sikhism', label: 'Sikhism' },
    { value: 'zoroastrianism', label: 'Zoroastrianism' },
    { value: 'other', label: 'Other' }
  ];

  // Language options
  const LANGUAGES = [
    { value: 'en', label: 'English' },
    { value: 'ar', label: 'Arabic' },
    { value: 'fa', label: 'Persian' },
    { value: 'he', label: 'Hebrew' },
    { value: 'sa', label: 'Sanskrit' },
    { value: 'pa', label: 'Pali' },
    { value: 'zh', label: 'Chinese' },
    { value: 'ja', label: 'Japanese' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
    { value: 'other', label: 'Other' }
  ];

  function getMetadata() {
    return {
      title: title.trim(),
      author: author.trim(),
      year: year ? parseInt(year, 10) : null,
      language,
      religion: religion || null,
      collection: collection.trim() || null,
      description: description.trim() || null,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean)
    };
  }

  function handleSave() {
    dispatch('save', getMetadata());
  }

  function handleCancel() {
    dispatch('cancel');
  }

  // Confidence indicator
  function getConfidenceClass(value) {
    if (!value) return '';
    if (value >= 0.9) return 'high';
    if (value >= 0.7) return 'medium';
    return 'low';
  }
</script>

<div class="metadata-editor">
  <div class="editor-header">
    <h3>Document Metadata</h3>
    {#if analysisResult?.confidence}
      <span class="confidence-badge {getConfidenceClass(analysisResult.confidence)}">
        AI Confidence: {Math.round(analysisResult.confidence * 100)}%
      </span>
    {/if}
  </div>

  <div class="fields-grid">
    <div class="field full-width">
      <label for="meta-title">Title *</label>
      <input
        id="meta-title"
        type="text"
        bind:value={title}
        placeholder="Document title"
        disabled={readonly}
        required
      />
      {#if analysisResult?.title_confidence}
        <span class="field-confidence {getConfidenceClass(analysisResult.title_confidence)}">
          {Math.round(analysisResult.title_confidence * 100)}%
        </span>
      {/if}
    </div>

    <div class="field">
      <label for="meta-author">Author</label>
      <input
        id="meta-author"
        type="text"
        bind:value={author}
        placeholder="Author name"
        disabled={readonly}
      />
    </div>

    <div class="field">
      <label for="meta-year">Year</label>
      <input
        id="meta-year"
        type="number"
        bind:value={year}
        placeholder="Publication year"
        min="1"
        max={new Date().getFullYear()}
        disabled={readonly}
      />
    </div>

    <div class="field">
      <label for="meta-language">Language</label>
      <select id="meta-language" bind:value={language} disabled={readonly}>
        {#each LANGUAGES as lang}
          <option value={lang.value}>{lang.label}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label for="meta-religion">Religious Tradition</label>
      <select id="meta-religion" bind:value={religion} disabled={readonly}>
        {#each RELIGIONS as rel}
          <option value={rel.value}>{rel.label}</option>
        {/each}
      </select>
    </div>

    <div class="field full-width">
      <label for="meta-collection">Collection</label>
      <input
        id="meta-collection"
        type="text"
        bind:value={collection}
        placeholder="e.g., Writings of the Báb"
        disabled={readonly}
      />
    </div>

    <div class="field full-width">
      <label for="meta-description">Description</label>
      <textarea
        id="meta-description"
        bind:value={description}
        placeholder="Brief description of the document"
        rows="3"
        disabled={readonly}
      ></textarea>
    </div>

    <div class="field full-width">
      <label for="meta-tags">Tags</label>
      <input
        id="meta-tags"
        type="text"
        bind:value={tags}
        placeholder="Comma-separated tags"
        disabled={readonly}
      />
      <span class="field-hint">Separate tags with commas</span>
    </div>
  </div>

  {#if analysisResult}
    <div class="analysis-info">
      <h4>AI Analysis</h4>
      <div class="analysis-grid">
        {#if analysisResult.document_type}
          <div class="analysis-item">
            <span class="label">Document Type:</span>
            <span class="value">{analysisResult.document_type}</span>
          </div>
        {/if}
        {#if analysisResult.word_count}
          <div class="analysis-item">
            <span class="label">Word Count:</span>
            <span class="value">{analysisResult.word_count.toLocaleString()}</span>
          </div>
        {/if}
        {#if analysisResult.detected_language}
          <div class="analysis-item">
            <span class="label">Detected Language:</span>
            <span class="value">{analysisResult.detected_language}</span>
          </div>
        {/if}
        {#if analysisResult.quality_score}
          <div class="analysis-item">
            <span class="label">Quality Score:</span>
            <span class="value quality-{getConfidenceClass(analysisResult.quality_score)}">
              {Math.round(analysisResult.quality_score * 100)}%
            </span>
          </div>
        {/if}
      </div>

      {#if analysisResult.warnings?.length}
        <div class="analysis-warnings">
          <h5>Warnings</h5>
          <ul>
            {#each analysisResult.warnings as warning}
              <li>{warning}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}

  {#if !readonly}
    <div class="editor-actions">
      <button type="button" class="btn-secondary" onclick={handleCancel}>
        Cancel
      </button>
      <button
        type="button"
        class="btn-primary"
        onclick={handleSave}
        disabled={!title.trim()}
      >
        Save Metadata
      </button>
    </div>
  {/if}
</div>

<style>
  .metadata-editor {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.5rem;
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .editor-header h3 {
    margin: 0;
    font-size: 1.125rem;
    color: var(--text-primary);
  }

  .confidence-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .confidence-badge.high {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }

  .confidence-badge.medium {
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    color: var(--warning);
  }

  .confidence-badge.low {
    background: color-mix(in srgb, var(--error) 15%, transparent);
    color: var(--error);
  }

  .fields-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    position: relative;
  }

  .field.full-width {
    grid-column: 1 / -1;
  }

  .field label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .field input,
  .field select,
  .field textarea {
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: inherit;
  }

  .field input:focus,
  .field select:focus,
  .field textarea:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .field input:disabled,
  .field select:disabled,
  .field textarea:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .field textarea {
    resize: vertical;
    min-height: 80px;
  }

  .field-confidence {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    font-size: 0.625rem;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
  }

  .field-confidence.high {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }

  .field-confidence.medium {
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    color: var(--warning);
  }

  .field-confidence.low {
    background: color-mix(in srgb, var(--error) 15%, transparent);
    color: var(--error);
  }

  .field-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .analysis-info {
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border-default);
  }

  .analysis-info h4 {
    margin: 0 0 1rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .analysis-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.75rem;
  }

  .analysis-item {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .analysis-item .label {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .analysis-item .value {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .value.quality-high {
    color: var(--success);
  }

  .value.quality-medium {
    color: var(--warning);
  }

  .value.quality-low {
    color: var(--error);
  }

  .analysis-warnings {
    margin-top: 1rem;
    padding: 0.75rem;
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    border-radius: 0.5rem;
  }

  .analysis-warnings h5 {
    margin: 0 0 0.5rem;
    font-size: 0.8125rem;
    color: var(--warning);
  }

  .analysis-warnings ul {
    margin: 0;
    padding-left: 1.25rem;
  }

  .analysis-warnings li {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
  }

  .analysis-warnings li:last-child {
    margin-bottom: 0;
  }

  .editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border-default);
  }

  .btn-primary, .btn-secondary {
    padding: 0.625rem 1.25rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-primary {
    background: var(--accent-primary);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--surface-2);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
  }

  .btn-secondary:hover {
    background: var(--surface-3);
  }

  @media (max-width: 640px) {
    .fields-grid {
      grid-template-columns: 1fr;
    }

    .field.full-width {
      grid-column: 1;
    }
  }
</style>
