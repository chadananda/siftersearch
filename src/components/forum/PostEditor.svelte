<script>
  /**
   * PostEditor Component
   * Form for creating new forum posts
   */
  import { forum } from '../../lib/api.js';
  import { getAuthState } from '../../lib/auth.svelte.js';

  const auth = getAuthState();

  // State
  let title = $state('');
  let content = $state('');
  let category = $state('general');
  let submitting = $state(false);
  let error = $state(null);

  const categories = [
    { value: 'general', label: 'General Discussion' },
    { value: 'questions', label: 'Questions' },
    { value: 'insights', label: 'Insights & Interpretations' },
    { value: 'resources', label: 'Resources & Recommendations' },
    { value: 'announcements', label: 'Announcements' }
  ];

  const canPost = $derived(
    auth.isAuthenticated &&
    ['verified', 'approved', 'patron', 'institutional', 'admin'].includes(auth.user?.tier)
  );

  const isValid = $derived(
    title.trim().length >= 3 &&
    content.trim().length >= 10
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValid || submitting) return;

    submitting = true;
    error = null;

    try {
      const result = await forum.createPost(title.trim(), content.trim(), category);
      // Redirect to the new post
      window.location.href = `/community/post?id=${result.post.id}`;
    } catch (err) {
      error = err.message || 'Failed to create post';
      submitting = false;
    }
  }
</script>

<div class="post-editor">
  <nav class="back-nav">
    <a href="/community" class="back-link">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="icon">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      Back to Forum
    </a>
  </nav>

  <div class="editor-card">
    <header class="editor-header">
      <h1>Create a Post</h1>
      <p class="subtitle">Share your thoughts, questions, or insights with the community</p>
    </header>

    {#if !auth.isAuthenticated}
      <div class="auth-required">
        <h2>Sign in Required</h2>
        <p>Please sign in to create a post.</p>
      </div>
    {:else if !canPost}
      <div class="auth-required">
        <h2>Verification Required</h2>
        <p>Please verify your email to create posts.</p>
      </div>
    {:else}
      <form onsubmit={handleSubmit} class="post-form">
        {#if error}
          <div class="error-message">
            {error}
          </div>
        {/if}

        <div class="form-group">
          <label for="title">Title</label>
          <input
            type="text"
            id="title"
            bind:value={title}
            placeholder="What's your post about?"
            maxlength="200"
            required
          />
          <span class="char-count">{title.length}/200</span>
        </div>

        <div class="form-group">
          <label for="category">Category</label>
          <select id="category" bind:value={category}>
            {#each categories as cat}
              <option value={cat.value}>{cat.label}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label for="content">Content</label>
          <textarea
            id="content"
            bind:value={content}
            placeholder="Share your thoughts, questions, or insights..."
            rows="10"
            maxlength="10000"
            required
          ></textarea>
          <span class="char-count">{content.length}/10000</span>
        </div>

        <div class="form-actions">
          <a href="/community" class="cancel-btn">Cancel</a>
          <button type="submit" disabled={!isValid || submitting} class="submit-btn">
            {submitting ? 'Creating...' : 'Create Post'}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>

<style>
  .post-editor {
    max-width: 700px;
    margin: 0 auto;
    padding: 1rem;
  }

  .back-nav {
    margin-bottom: 1rem;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.875rem;
    transition: color 0.2s;
  }

  .back-link:hover {
    color: var(--text-primary);
  }

  .back-link .icon {
    width: 1.25rem;
    height: 1.25rem;
  }

  .editor-card {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 2rem;
  }

  .editor-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .editor-header h1 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0.5rem 0 0;
    color: var(--text-secondary);
  }

  .auth-required {
    text-align: center;
    padding: 2rem;
  }

  .auth-required h2 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .auth-required p {
    color: var(--text-secondary);
  }

  .error-message {
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--error) 10%, transparent);
    border: 1px solid var(--error);
    border-radius: 0.5rem;
    color: var(--error);
    margin-bottom: 1rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
    position: relative;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  input[type="text"],
  select,
  textarea {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
    font-size: 1rem;
    font-family: inherit;
    transition: border-color 0.2s;
  }

  input[type="text"]:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  textarea {
    resize: vertical;
    min-height: 200px;
  }

  .char-count {
    position: absolute;
    right: 0;
    top: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 2rem;
  }

  .cancel-btn {
    padding: 0.75rem 1.5rem;
    background: var(--surface-2);
    color: var(--text-primary);
    border: none;
    border-radius: 0.5rem;
    text-decoration: none;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .cancel-btn:hover {
    background: var(--surface-3);
  }

  .submit-btn {
    padding: 0.75rem 1.5rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .submit-btn:hover:not(:disabled) {
    background: var(--accent-primary-hover);
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    .editor-card {
      padding: 1.5rem;
    }

    .form-actions {
      flex-direction: column-reverse;
    }

    .cancel-btn,
    .submit-btn {
      text-align: center;
    }
  }
</style>
