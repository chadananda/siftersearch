<script>
  /**
   * PostDetail Component
   * Displays a single post with threaded replies
   */
  import { onMount } from 'svelte';
  import { forum } from '../../lib/api.js';
  import { getAuthState } from '../../lib/auth.svelte.js';

  const auth = getAuthState();

  // Get post ID from URL query param
  let postId = $state(null);

  // State
  let loading = $state(true);
  let error = $state(null);
  let post = $state(null);
  let replies = $state([]);
  let userVotes = $state({});

  // Reply state
  let replyContent = $state('');
  let replyingTo = $state(null);
  let submitting = $state(false);

  // Edit state
  let editing = $state(null);
  let editContent = $state('');

  const canPost = $derived(
    auth.isAuthenticated &&
    ['verified', 'approved', 'patron', 'institutional', 'admin'].includes(auth.user?.tier)
  );

  onMount(() => {
    // Get post ID from URL query param
    const params = new URLSearchParams(window.location.search);
    postId = params.get('id');
    if (postId) {
      loadPost();
    } else {
      error = 'No post ID provided';
      loading = false;
    }
  });

  async function loadPost() {
    loading = true;
    error = null;
    try {
      const result = await forum.getPost(postId);
      post = result.post;
      replies = result.replies || [];
      userVotes = result.userVotes || {};
    } catch (err) {
      error = err.message || 'Failed to load post';
    } finally {
      loading = false;
    }
  }

  async function submitReply(parentId) {
    if (!replyContent.trim() || submitting) return;

    submitting = true;
    try {
      const result = await forum.replyToPost(parentId, replyContent.trim());
      replies = [...replies, result.reply];
      replyContent = '';
      replyingTo = null;

      // Update reply count
      if (parentId === post.id) {
        post.reply_count = (post.reply_count || 0) + 1;
      } else {
        const parentReply = replies.find(r => r.id === parentId);
        if (parentReply) {
          parentReply.reply_count = (parentReply.reply_count || 0) + 1;
        }
      }
    } catch (err) {
      error = err.message || 'Failed to submit reply';
    } finally {
      submitting = false;
    }
  }

  async function vote(itemId, voteValue) {
    if (!auth.isAuthenticated) return;

    const currentVote = userVotes[itemId] || 0;
    const newVote = currentVote === voteValue ? 0 : voteValue;

    try {
      const result = await forum.votePost(itemId, newVote);
      userVotes[itemId] = result.userVote;

      // Update the item's vote counts
      if (itemId === post.id) {
        post.upvotes = result.upvotes;
        post.downvotes = result.downvotes;
      } else {
        const reply = replies.find(r => r.id === itemId);
        if (reply) {
          reply.upvotes = result.upvotes;
          reply.downvotes = result.downvotes;
        }
      }
    } catch (err) {
      error = err.message || 'Failed to vote';
    }
  }

  async function startEdit(item) {
    editing = item.id;
    editContent = item.content;
  }

  async function saveEdit(itemId) {
    if (!editContent.trim() || submitting) return;

    submitting = true;
    try {
      await forum.updatePost(itemId, { content: editContent.trim() });

      if (itemId === post.id) {
        post.content = editContent.trim();
      } else {
        const reply = replies.find(r => r.id === itemId);
        if (reply) {
          reply.content = editContent.trim();
        }
      }

      editing = null;
      editContent = '';
    } catch (err) {
      error = err.message || 'Failed to update';
    } finally {
      submitting = false;
    }
  }

  async function deleteItem(itemId) {
    if (!confirm('Are you sure you want to delete this?')) return;

    try {
      await forum.deletePost(itemId);
      if (itemId === post.id) {
        window.location.href = '/community';
      } else {
        replies = replies.filter(r => r.id !== itemId);
      }
    } catch (err) {
      error = err.message || 'Failed to delete';
    }
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffHours < 1) {
      const mins = Math.floor(diffMs / (1000 * 60));
      return `${mins}m ago`;
    } else if (diffHours < 24) {
      return `${Math.floor(diffHours)}h ago`;
    } else if (diffDays < 7) {
      return `${Math.floor(diffDays)}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  function getScore(item) {
    return (item.upvotes || 0) - (item.downvotes || 0);
  }

  function buildThread(parentId = null, depth = 0) {
    if (parentId === null) parentId = post.id;
    return replies
      .filter(r => r.parent_id === parentId)
      .map(reply => ({
        ...reply,
        children: buildThread(reply.id, depth + 1)
      }));
  }

  function canEdit(item) {
    return auth.user?.sub === item.author_id || auth.user?.tier === 'admin';
  }
</script>

<div class="post-detail">
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading post...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      <button onclick={loadPost}>Try Again</button>
    </div>
  {:else if post}
    <nav class="back-nav">
      <a href="/community" class="back-link">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="icon">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Forum
      </a>
    </nav>

    <!-- Main Post -->
    <article class="main-post">
      <div class="vote-controls">
        <button
          class="vote-btn"
          class:active={userVotes[post.id] === 1}
          onclick={() => vote(post.id, 1)}
          disabled={!auth.isAuthenticated}
        >
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 14l5-5 5 5H7z"/>
          </svg>
        </button>
        <span class="score" class:positive={getScore(post) > 0} class:negative={getScore(post) < 0}>
          {getScore(post)}
        </span>
        <button
          class="vote-btn"
          class:active={userVotes[post.id] === -1}
          onclick={() => vote(post.id, -1)}
          disabled={!auth.isAuthenticated}
        >
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 10l5 5 5-5H7z"/>
          </svg>
        </button>
      </div>

      <div class="post-body">
        <header class="post-header">
          <h1>{post.title}</h1>
          <div class="post-meta">
            <span class="category">{post.category}</span>
            <span>Posted by {post.author_name || 'Anonymous'}</span>
            <span>{formatDate(post.created_at)}</span>
            {#if post.updated_at !== post.created_at}
              <span class="edited">(edited)</span>
            {/if}
          </div>
        </header>

        {#if editing === post.id}
          <div class="edit-form">
            <textarea
              bind:value={editContent}
              class="edit-textarea"
              rows="5"
            ></textarea>
            <div class="edit-actions">
              <button onclick={() => saveEdit(post.id)} disabled={submitting} class="save-btn">
                Save
              </button>
              <button onclick={() => { editing = null; }} class="cancel-btn">
                Cancel
              </button>
            </div>
          </div>
        {:else}
          <div class="post-content">
            {post.content}
          </div>
        {/if}

        <div class="post-actions">
          {#if canPost}
            <button class="action-btn" onclick={() => { replyingTo = post.id; }}>
              Reply
            </button>
          {/if}
          {#if canEdit(post)}
            <button class="action-btn" onclick={() => startEdit(post)}>
              Edit
            </button>
            <button class="action-btn delete" onclick={() => deleteItem(post.id)}>
              Delete
            </button>
          {/if}
        </div>
      </div>
    </article>

    <!-- Reply Form for Main Post -->
    {#if replyingTo === post.id}
      <div class="reply-form">
        <textarea
          bind:value={replyContent}
          placeholder="Write your reply..."
          class="reply-textarea"
          rows="4"
        ></textarea>
        <div class="reply-actions">
          <button onclick={() => submitReply(post.id)} disabled={submitting || !replyContent.trim()} class="submit-btn">
            {submitting ? 'Posting...' : 'Post Reply'}
          </button>
          <button onclick={() => { replyingTo = null; replyContent = ''; }} class="cancel-btn">
            Cancel
          </button>
        </div>
      </div>
    {/if}

    <!-- Replies -->
    <section class="replies-section">
      <h2>{post.reply_count || 0} Replies</h2>

      {#if replies.length === 0}
        <p class="no-replies">No replies yet. Be the first to respond!</p>
      {:else}
        <div class="replies">
          {#each buildThread() as reply}
            {@render replyItem(reply, 0)}
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

{#snippet replyItem(reply, depth)}
  <div class="reply" style="--depth: {depth}">
    <div class="vote-controls small">
      <button
        class="vote-btn"
        class:active={userVotes[reply.id] === 1}
        onclick={() => vote(reply.id, 1)}
        disabled={!auth.isAuthenticated}
      >
        <svg fill="currentColor" viewBox="0 0 24 24">
          <path d="M7 14l5-5 5 5H7z"/>
        </svg>
      </button>
      <span class="score" class:positive={getScore(reply) > 0} class:negative={getScore(reply) < 0}>
        {getScore(reply)}
      </span>
      <button
        class="vote-btn"
        class:active={userVotes[reply.id] === -1}
        onclick={() => vote(reply.id, -1)}
        disabled={!auth.isAuthenticated}
      >
        <svg fill="currentColor" viewBox="0 0 24 24">
          <path d="M7 10l5 5 5-5H7z"/>
        </svg>
      </button>
    </div>

    <div class="reply-body">
      <div class="reply-meta">
        <span class="author">{reply.author_name || 'Anonymous'}</span>
        <span class="time">{formatDate(reply.created_at)}</span>
        {#if reply.updated_at !== reply.created_at}
          <span class="edited">(edited)</span>
        {/if}
      </div>

      {#if editing === reply.id}
        <div class="edit-form">
          <textarea
            bind:value={editContent}
            class="edit-textarea"
            rows="3"
          ></textarea>
          <div class="edit-actions">
            <button onclick={() => saveEdit(reply.id)} disabled={submitting} class="save-btn">
              Save
            </button>
            <button onclick={() => { editing = null; }} class="cancel-btn">
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <div class="reply-content">
          {reply.content}
        </div>
      {/if}

      <div class="reply-actions">
        {#if canPost && depth < 5}
          <button class="action-btn" onclick={() => { replyingTo = reply.id; }}>
            Reply
          </button>
        {/if}
        {#if canEdit(reply)}
          <button class="action-btn" onclick={() => startEdit(reply)}>
            Edit
          </button>
          <button class="action-btn delete" onclick={() => deleteItem(reply.id)}>
            Delete
          </button>
        {/if}
      </div>

      {#if replyingTo === reply.id}
        <div class="reply-form nested">
          <textarea
            bind:value={replyContent}
            placeholder="Write your reply..."
            class="reply-textarea"
            rows="3"
          ></textarea>
          <div class="reply-actions">
            <button onclick={() => submitReply(reply.id)} disabled={submitting || !replyContent.trim()} class="submit-btn">
              {submitting ? 'Posting...' : 'Reply'}
            </button>
            <button onclick={() => { replyingTo = null; replyContent = ''; }} class="cancel-btn">
              Cancel
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>

  {#if reply.children?.length > 0}
    <div class="nested-replies">
      {#each reply.children as child}
        {@render replyItem(child, depth + 1)}
      {/each}
    </div>
  {/if}
{/snippet}

<style>
  .post-detail {
    max-width: 800px;
    margin: 0 auto;
    padding: 1rem;
  }

  .loading, .error {
    text-align: center;
    padding: 3rem 1rem;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
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

  .main-post {
    display: flex;
    gap: 1rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.5rem;
    margin-bottom: 1rem;
  }

  .vote-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .vote-controls.small {
    min-width: 30px;
  }

  .vote-btn {
    padding: 0.25rem;
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 0.2s;
  }

  .vote-btn:hover:not(:disabled) {
    color: var(--accent-primary);
  }

  .vote-btn.active {
    color: var(--accent-primary);
  }

  .vote-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .vote-btn svg {
    width: 1.5rem;
    height: 1.5rem;
  }

  .vote-controls.small .vote-btn svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .score {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .score.positive {
    color: var(--success);
  }

  .score.negative {
    color: var(--error);
  }

  .post-body {
    flex: 1;
    min-width: 0;
  }

  .post-header h1 {
    margin: 0 0 0.5rem;
    font-size: 1.5rem;
    color: var(--text-primary);
  }

  .post-meta {
    display: flex;
    gap: 0.75rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    flex-wrap: wrap;
  }

  .category {
    padding: 0.125rem 0.5rem;
    background: var(--surface-3);
    border-radius: 0.25rem;
  }

  .edited {
    font-style: italic;
  }

  .post-content, .reply-content {
    margin: 1rem 0;
    line-height: 1.6;
    color: var(--text-primary);
    white-space: pre-wrap;
  }

  .post-actions, .reply-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.25rem 0.5rem;
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: color 0.2s;
  }

  .action-btn:hover {
    color: var(--text-primary);
  }

  .action-btn.delete:hover {
    color: var(--error);
  }

  .reply-form {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .reply-form.nested {
    margin-top: 0.75rem;
    margin-bottom: 0;
    padding: 0.75rem;
  }

  .reply-textarea, .edit-textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
    font-size: 0.875rem;
    resize: vertical;
    font-family: inherit;
  }

  .reply-actions, .edit-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .submit-btn, .save-btn {
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .submit-btn:hover:not(:disabled), .save-btn:hover:not(:disabled) {
    background: var(--accent-primary-hover);
  }

  .submit-btn:disabled, .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-btn {
    padding: 0.5rem 1rem;
    background: var(--surface-2);
    color: var(--text-primary);
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .replies-section {
    margin-top: 2rem;
  }

  .replies-section h2 {
    font-size: 1rem;
    color: var(--text-primary);
    margin-bottom: 1rem;
  }

  .no-replies {
    color: var(--text-secondary);
    text-align: center;
    padding: 2rem;
  }

  .replies {
    display: flex;
    flex-direction: column;
  }

  .reply {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem 0;
    padding-left: calc(var(--depth) * 1.5rem);
    border-left: 2px solid var(--border-subtle);
    margin-left: calc(var(--depth) * 0.5rem);
  }

  .reply:first-child {
    padding-top: 0;
  }

  .reply-body {
    flex: 1;
    min-width: 0;
  }

  .reply-meta {
    display: flex;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }

  .reply-meta .author {
    font-weight: 500;
    color: var(--text-primary);
  }

  .nested-replies {
    margin-left: 0.5rem;
  }

  @media (max-width: 640px) {
    .main-post {
      flex-direction: column;
    }

    .vote-controls {
      flex-direction: row;
      margin-bottom: 0.5rem;
    }

    .reply {
      padding-left: calc(var(--depth) * 0.75rem);
    }
  }
</style>
