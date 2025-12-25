<script>
  /**
   * ContributeForm Component
   * Upload documents to the library
   */
  import { librarian } from '../lib/api.js';
  import { getAuthState } from '../lib/auth.svelte.js';

  const auth = getAuthState();

  // Source type tabs
  let sourceType = $state('upload');

  // Form state
  let files = $state([]);
  let url = $state('');
  let isbn = $state('');
  let religion = $state('');
  let collection = $state('');

  // Upload state
  let uploading = $state(false);
  let uploadProgress = $state(0);
  let uploadResults = $state([]);
  let error = $state(null);

  // Drag state
  let isDragging = $state(false);

  // Religion options
  const RELIGIONS = [
    { value: '', label: 'Auto-detect' },
    { value: 'bahai', label: "Baha'i Faith" },
    { value: 'buddhism', label: 'Buddhism' },
    { value: 'christianity', label: 'Christianity' },
    { value: 'hinduism', label: 'Hinduism' },
    { value: 'islam', label: 'Islam' },
    { value: 'jainism', label: 'Jainism' },
    { value: 'judaism', label: 'Judaism' },
    { value: 'sikhism', label: 'Sikhism' },
    { value: 'zoroastrianism', label: 'Zoroastrianism' },
    { value: 'other', label: 'Other / Multiple' }
  ];

  // Accepted file types
  const ACCEPTED_TYPES = [
    'application/pdf',
    'application/epub+zip',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  const ACCEPTED_EXTENSIONS = ['.pdf', '.epub', '.txt', '.md', '.docx'];

  function handleDragEnter(e) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(e) {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      isDragging = false;
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleDrop(e) {
    e.preventDefault();
    isDragging = false;

    const droppedFiles = Array.from(e.dataTransfer.files).filter(file =>
      ACCEPTED_TYPES.includes(file.type) ||
      ACCEPTED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))
    );

    if (droppedFiles.length > 0) {
      files = [...files, ...droppedFiles];
    }
  }

  function handleFileSelect(e) {
    const selectedFiles = Array.from(e.target.files);
    files = [...files, ...selectedFiles];
    e.target.value = ''; // Reset input
  }

  function removeFile(index) {
    files = files.filter((_, i) => i !== index);
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function handleSubmit() {
    error = null;
    uploadResults = [];

    if (sourceType === 'upload' && files.length === 0) {
      error = 'Please select at least one file to upload';
      return;
    }

    if (sourceType === 'url' && !url.trim()) {
      error = 'Please enter a URL';
      return;
    }

    if (sourceType === 'isbn' && !isbn.trim()) {
      error = 'Please enter an ISBN';
      return;
    }

    uploading = true;
    uploadProgress = 0;

    try {
      const options = { religion: religion || undefined, collection: collection || undefined };

      if (sourceType === 'upload') {
        const totalFiles = files.length;
        for (let i = 0; i < files.length; i++) {
          try {
            const result = await librarian.uploadFile(files[i], options);
            uploadResults = [...uploadResults, {
              name: files[i].name,
              success: true,
              id: result.id
            }];
          } catch (err) {
            uploadResults = [...uploadResults, {
              name: files[i].name,
              success: false,
              error: err.message
            }];
          }
          uploadProgress = ((i + 1) / totalFiles) * 100;
        }
        files = [];
      } else if (sourceType === 'url') {
        const result = await librarian.addUrl(url.trim(), options);
        uploadResults = [{
          name: url.trim(),
          success: true,
          id: result.id
        }];
        url = '';
      } else if (sourceType === 'isbn') {
        const result = await librarian.addIsbn(isbn.trim(), options);
        uploadResults = [{
          name: `ISBN: ${isbn.trim()}`,
          success: true,
          id: result.id
        }];
        isbn = '';
      }

      uploadProgress = 100;
    } catch (err) {
      error = err.message || 'Upload failed';
    } finally {
      uploading = false;
    }
  }

  let canContribute = $derived(
    auth.isAuthenticated &&
    ['approved', 'patron', 'institutional', 'admin'].includes(auth.user?.tier)
  );
</script>

<div class="contribute-form">
  {#if !auth.isAuthenticated}
    <div class="access-notice">
      <svg class="notice-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      <h2>Sign In Required</h2>
      <p>Please sign in to contribute documents to the library.</p>
      <a href="/" class="btn-primary">Go to Home</a>
    </div>
  {:else if !canContribute}
    <div class="access-notice">
      <svg class="notice-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h2>Pending Approval</h2>
      <p>Your account needs to be approved before you can contribute documents.</p>
      <p class="note">An admin will review your account shortly.</p>
    </div>
  {:else}
    <header class="page-header">
      <h1>Contribute to the Library</h1>
      <p class="subtitle">Help expand our collection of religious and philosophical texts</p>
    </header>

    <!-- Source Type Tabs -->
    <div class="source-tabs">
      <button
        class="tab"
        class:active={sourceType === 'upload'}
        onclick={() => sourceType = 'upload'}
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Upload File
      </button>
      <button
        class="tab"
        class:active={sourceType === 'url'}
        onclick={() => sourceType = 'url'}
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        From URL
      </button>
      <button
        class="tab"
        class:active={sourceType === 'isbn'}
        onclick={() => sourceType = 'isbn'}
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        By ISBN
      </button>
    </div>

    <!-- Upload Form -->
    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="upload-form">
      {#if sourceType === 'upload'}
        <!-- Drop Zone -->
        <div
          class="drop-zone"
          class:dragging={isDragging}
          class:has-files={files.length > 0}
          ondragenter={handleDragEnter}
          ondragleave={handleDragLeave}
          ondragover={handleDragOver}
          ondrop={handleDrop}
        >
          {#if files.length === 0}
            <svg class="drop-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p class="drop-text">
              Drag and drop files here, or
              <label class="browse-link">
                browse
                <input
                  type="file"
                  multiple
                  accept={ACCEPTED_EXTENSIONS.join(',')}
                  onchange={handleFileSelect}
                  class="hidden-input"
                />
              </label>
            </p>
            <p class="file-types">Supported: PDF, EPUB, TXT, MD, DOCX</p>
          {:else}
            <div class="file-list">
              {#each files as file, index}
                <div class="file-item">
                  <svg class="file-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div class="file-info">
                    <span class="file-name">{file.name}</span>
                    <span class="file-size">{formatFileSize(file.size)}</span>
                  </div>
                  <button type="button" class="remove-btn" onclick={() => removeFile(index)}>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              {/each}
              <label class="add-more">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Add more files
                <input
                  type="file"
                  multiple
                  accept={ACCEPTED_EXTENSIONS.join(',')}
                  onchange={handleFileSelect}
                  class="hidden-input"
                />
              </label>
            </div>
          {/if}
        </div>
      {:else if sourceType === 'url'}
        <div class="input-group">
          <label for="url-input">Document URL</label>
          <input
            id="url-input"
            type="url"
            bind:value={url}
            placeholder="https://example.com/document.pdf"
          />
          <p class="input-hint">Enter the URL of a PDF, EPUB, or text document</p>
        </div>
      {:else if sourceType === 'isbn'}
        <div class="input-group">
          <label for="isbn-input">ISBN</label>
          <input
            id="isbn-input"
            type="text"
            bind:value={isbn}
            placeholder="978-0-123456-78-9"
          />
          <p class="input-hint">Enter an ISBN-10 or ISBN-13 to look up and add the book</p>
        </div>
      {/if}

      <!-- Metadata Hints -->
      <div class="metadata-hints">
        <h3>Optional Metadata</h3>
        <p class="hint-description">Help our AI categorize your contribution</p>

        <div class="hint-fields">
          <div class="field">
            <label for="religion-select">Religious Tradition</label>
            <select id="religion-select" bind:value={religion}>
              {#each RELIGIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>

          <div class="field">
            <label for="collection-input">Collection (optional)</label>
            <input
              id="collection-input"
              type="text"
              bind:value={collection}
              placeholder="e.g., Writings of the Báb"
            />
          </div>
        </div>
      </div>

      {#if error}
        <div class="error-message">{error}</div>
      {/if}

      {#if uploading}
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" style="width: {uploadProgress}%"></div>
          </div>
          <span class="progress-text">{Math.round(uploadProgress)}%</span>
        </div>
      {/if}

      {#if uploadResults.length > 0}
        <div class="results">
          <h3>Upload Results</h3>
          {#each uploadResults as result}
            <div class="result-item" class:success={result.success} class:failed={!result.success}>
              {#if result.success}
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              {:else}
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              {/if}
              <span class="result-name">{result.name}</span>
              {#if result.success}
                <span class="result-status">Queued for review</span>
              {:else}
                <span class="result-error">{result.error}</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <div class="form-actions">
        <button
          type="submit"
          class="btn-primary"
          disabled={uploading || (sourceType === 'upload' && files.length === 0)}
        >
          {#if uploading}
            <span class="btn-spinner"></span>
            Uploading...
          {:else}
            Submit for Review
          {/if}
        </button>
      </div>
    </form>

    <div class="guidelines">
      <h3>Contribution Guidelines</h3>
      <ul>
        <li>Only submit documents you have the right to share</li>
        <li>Public domain works are always welcome</li>
        <li>All submissions are reviewed by our librarian AI</li>
        <li>Duplicates will be detected and merged automatically</li>
        <li>Metadata will be extracted and verified</li>
      </ul>
    </div>
  {/if}
</div>

<style>
  .contribute-form {
    max-width: 800px;
    margin: 0 auto;
  }

  .access-notice {
    text-align: center;
    padding: 3rem 1rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
  }

  .notice-icon {
    width: 64px;
    height: 64px;
    color: var(--text-secondary);
    margin-bottom: 1rem;
  }

  .access-notice h2 {
    margin: 0 0 0.5rem;
    color: var(--text-primary);
  }

  .access-notice p {
    margin: 0 0 1rem;
    color: var(--text-secondary);
  }

  .access-notice .note {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .page-header h1 {
    margin: 0;
    font-size: 1.75rem;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0.5rem 0 0;
    color: var(--text-secondary);
  }

  .source-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tab:hover {
    background: var(--surface-2);
    color: var(--text-primary);
  }

  .tab.active {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: white;
  }

  .tab svg {
    width: 20px;
    height: 20px;
  }

  .upload-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .drop-zone {
    border: 2px dashed var(--border-default);
    border-radius: 0.75rem;
    padding: 2rem;
    text-align: center;
    transition: all 0.2s;
    background: var(--surface-1);
  }

  .drop-zone.dragging {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 5%, transparent);
  }

  .drop-zone.has-files {
    padding: 1rem;
  }

  .drop-icon {
    width: 48px;
    height: 48px;
    color: var(--text-muted);
    margin-bottom: 1rem;
  }

  .drop-text {
    margin: 0 0 0.5rem;
    color: var(--text-secondary);
  }

  .browse-link {
    color: var(--accent-primary);
    cursor: pointer;
    text-decoration: underline;
  }

  .hidden-input {
    display: none;
  }

  .file-types {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .file-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--surface-2);
    border-radius: 0.5rem;
  }

  .file-icon {
    width: 24px;
    height: 24px;
    color: var(--accent-primary);
    flex-shrink: 0;
  }

  .file-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .file-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-size {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .remove-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.2s;
  }

  .remove-btn:hover {
    color: var(--error);
  }

  .remove-btn svg {
    width: 20px;
    height: 20px;
  }

  .add-more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px dashed var(--border-default);
    border-radius: 0.5rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-more:hover {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .add-more svg {
    width: 20px;
    height: 20px;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .input-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .input-group input {
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
    font-size: 1rem;
  }

  .input-group input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .input-hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .metadata-hints {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }

  .metadata-hints h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .hint-description {
    margin: 0 0 1rem;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .hint-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .field label {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .field select,
  .field input {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .error-message {
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--error) 15%, transparent);
    color: var(--error);
    border-radius: 0.5rem;
  }

  .progress-container {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .progress-bar {
    flex: 1;
    height: 8px;
    background: var(--surface-2);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-primary);
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    min-width: 3rem;
    text-align: right;
  }

  .results {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }

  .results h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    border-radius: 0.5rem;
  }

  .result-item.success {
    background: color-mix(in srgb, var(--success) 10%, transparent);
  }

  .result-item.failed {
    background: color-mix(in srgb, var(--error) 10%, transparent);
  }

  .result-item svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .result-item.success svg {
    color: var(--success);
  }

  .result-item.failed svg {
    color: var(--error);
  }

  .result-name {
    flex: 1;
    font-size: 0.875rem;
    color: var(--text-primary);
    word-break: break-all;
  }

  .result-status {
    font-size: 0.75rem;
    color: var(--success);
  }

  .result-error {
    font-size: 0.75rem;
    color: var(--error);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
  }

  .btn-primary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .guidelines {
    margin-top: 2rem;
    padding: 1.5rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
  }

  .guidelines h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .guidelines ul {
    margin: 0;
    padding-left: 1.5rem;
  }

  .guidelines li {
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .guidelines li:last-child {
    margin-bottom: 0;
  }
</style>
