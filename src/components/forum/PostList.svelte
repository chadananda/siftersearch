<script>
  /**
   * PostList Component
   * Displays a list of forum posts with sorting and category filtering
   */
  import { onMount } from 'svelte';
  import { forum } from '../../lib/api.js';
  import { getAuthState } from '../../lib/auth.svelte.js';

  const auth = getAuthState();

  // State
  let loading = $state(true);
  let error = $state(null);
  let posts = $state([]);
  let total = $state(0);
  let categories = $state([]);

  // Filters
  let sort = $state('newest');
  let category = $state('');
  let offset = $state(0);
  const limit = 20;

  // Can user post?
  const canPost = $derived(
    auth.isAuthenticated &&
    ['verified', 'approved', 'patron', 'institutional', 'admin'].includes(auth.user?.tier)
  );

  onMount(() => {
    loadPosts();
    loadCategories();
  });

  async function loadPosts() {
    loading = true;
    error = null;
    try {
      const result = await forum.getPosts({
        sort,
        category: category || undefined,
        limit,
        offset
      });
      posts = result.posts || [];
      total = result.total || 0;
    } catch (err) {
      error = err.message || 'Failed to load posts';
    } finally {
      loading = false;
    }
  }

  async function loadCategories() {
    try {
      const result = await forum.getCategories();
      categories = result.categories || [];
    } catch {
      // Ignore category load errors
    }
  }

  function handleSortChange(e) {
    sort = e.target.value;
    offset = 0;
    loadPosts();
  }

  function handleCategoryChange(e) {
    category = e.target.value;
    offset = 0;
    loadPosts();
  }

  function nextPage() {
    if (offset + limit < total) {
      offset += limit;
      loadPosts();
    }
  }

  function prevPage() {
    if (offset > 0) {
      offset = Math.max(0, offset - limit);
      loadPosts();
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

  function getScore(post) {
    return (post.upvotes || 0) - (post.downvotes || 0);
  }
</script>

<div class="post-list">
  <header class="list-header">
    <h1>Community Forum</h1>
    <p class="subtitle">Discuss sacred texts, share insights, and connect with fellow seekers</p>
  </header>

  <div class="controls">
    <div class="filters">
      <select value={sort} onchange={handleSortChange} class="filter-select">
        <option value="newest">Newest</option>
        <option value="popular">Most Popular</option>
        <option value="active">Most Active</option>
      </select>

      <select value={category} onchange={handleCategoryChange} class="filter-select">
        <option value="">All Categories</option>
        {#each categories as cat}
          <option value={cat.category}>{cat.category} ({cat.post_count})</option>
        {/each}
      </select>
    </div>

    {#if canPost}
      <a href="/community/new" class="new-post-btn">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="icon">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        New Post
      </a>
    {:else if auth.isAuthenticated}
      <span class="post-hint">Verify your email to post</span>
    {:else}
      <span class="post-hint">Sign in to post</span>
    {/if}
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading posts...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      <button onclick={loadPosts}>Try Again</button>
    </div>
  {:else if posts.length === 0}
    <div class="empty">
      <h3>No posts yet</h3>
      <p>Be the first to start a discussion!</p>
    </div>
  {:else}
    <div class="posts">
      {#each posts as post}
        <a href={`/community/post?id=${post.id}`} class="post-card">
          <div class="post-score">
            <span class="score" class:positive={getScore(post) > 0} class:negative={getScore(post) < 0}>
              {getScore(post)}
            </span>
          </div>
          <div class="post-content">
            <h2 class="post-title">{post.title}</h2>
            <div class="post-meta">
              <span class="category">{post.category}</span>
              <span class="author">by {post.author_name || 'Anonymous'}</span>
              <span class="time">{formatDate(post.created_at)}</span>
              <span class="replies">{post.reply_count} replies</span>
            </div>
          </div>
        </a>
      {/each}
    </div>

    {#if total > limit}
      <div class="pagination">
        <button onclick={prevPage} disabled={offset === 0} class="page-btn">
          Previous
        </button>
        <span class="page-info">
          {offset + 1} - {Math.min(offset + limit, total)} of {total}
        </span>
        <button onclick={nextPage} disabled={offset + limit >= total} class="page-btn">
          Next
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .post-list {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  .list-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .list-header h1 {
    margin: 0;
    font-size: 1.75rem;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0.5rem 0 0;
    color: var(--text-secondary);
  }

  .controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .filters {
    display: flex;
    gap: 0.5rem;
  }

  .filter-select {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-1);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .new-post-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: white;
    border-radius: 0.5rem;
    text-decoration: none;
    font-size: 0.875rem;
    transition: background 0.2s;
  }

  .new-post-btn:hover {
    background: var(--accent-primary-hover);
  }

  .new-post-btn .icon {
    width: 1rem;
    height: 1rem;
  }

  .post-hint {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .loading, .error, .empty {
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

  .error button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .posts {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .post-card {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    text-decoration: none;
    transition: border-color 0.2s, background 0.2s;
  }

  .post-card:hover {
    border-color: var(--accent-primary);
    background: var(--surface-2);
  }

  .post-score {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 40px;
    color: var(--text-secondary);
  }

  .score {
    font-weight: 600;
    font-size: 1rem;
  }

  .score.positive {
    color: var(--success);
  }

  .score.negative {
    color: var(--error);
  }

  .post-content {
    flex: 1;
    min-width: 0;
  }

  .post-title {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .page-btn {
    padding: 0.5rem 1rem;
    background: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.2s;
  }

  .page-btn:hover:not(:disabled) {
    background: var(--surface-3);
  }

  .page-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .page-info {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  @media (max-width: 640px) {
    .controls {
      flex-direction: column;
      align-items: stretch;
    }

    .filters {
      flex-direction: column;
    }

    .new-post-btn {
      justify-content: center;
    }
  }
</style>
