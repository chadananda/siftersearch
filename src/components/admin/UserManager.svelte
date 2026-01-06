<script>
  /**
   * UserManager Component
   * List and manage all users
   */
  import { onMount } from 'svelte';
  import { admin } from '../../lib/api.js';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';

  const auth = getAuthState();

  let users = $state([]);
  let total = $state(0);
  let loading = $state(true);
  let authReady = $state(false);
  let error = $state(null);
  let actionLoading = $state(null);

  // Filters
  let searchQuery = $state('');
  let tierFilter = $state('');
  let page = $state(0);
  const limit = 20;

  // Tier options
  const TIERS = ['verified', 'approved', 'patron', 'institutional', 'admin', 'banned'];

  onMount(async () => {
    await initAuth();
    authReady = true;

    if (auth.isAuthenticated && auth.user?.tier === 'admin') {
      await loadUsers();
    } else {
      loading = false;
    }
  });

  async function loadUsers() {
    loading = true;
    error = null;

    try {
      const data = await admin.getUsers({
        limit,
        offset: page * limit,
        tier: tierFilter || undefined,
        search: searchQuery || undefined
      });
      users = data.users;
      total = data.total;
    } catch (err) {
      error = err.message || 'Failed to load users';
    } finally {
      loading = false;
    }
  }

  async function updateUserTier(userId, newTier) {
    actionLoading = userId;
    try {
      await admin.updateUser(userId, { tier: newTier });
      await loadUsers();
    } catch (err) {
      alert(err.message || 'Failed to update user');
    } finally {
      actionLoading = null;
    }
  }

  async function banUser(userId) {
    if (!confirm('Are you sure you want to ban this user?')) return;

    actionLoading = userId;
    try {
      await admin.banUser(userId);
      await loadUsers();
    } catch (err) {
      alert(err.message || 'Failed to ban user');
    } finally {
      actionLoading = null;
    }
  }

  function handleSearch() {
    page = 0;
    loadUsers();
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  let totalPages = $derived(Math.ceil(total / limit));
</script>

<div class="user-manager">
  {#if !authReady}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading...</p>
    </div>
  {:else if !auth.isAuthenticated || auth.user?.tier !== 'admin'}
    <div class="access-denied">
      <h2>Access Denied</h2>
      <p>You need admin access to view this page.</p>
      <a href="/" class="btn-primary">Go to Home</a>
    </div>
  {:else}
    <header class="page-header">
      <h1>User Management</h1>
      <p class="subtitle">{total} total users</p>
    </header>

    <!-- Filters -->
    <div class="filters">
      <div class="search-box">
        <input
          type="text"
          placeholder="Search by email or name..."
          bind:value={searchQuery}
          onkeydown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button onclick={handleSearch} class="btn-primary btn-small">Search</button>
      </div>
      <select bind:value={tierFilter} onchange={handleSearch}>
        <option value="">All Tiers</option>
        {#each TIERS as tier}
          <option value={tier}>{tier}</option>
        {/each}
      </select>
    </div>

    {#if error}
      <div class="error-message">{error}</div>
    {/if}

    {#if loading}
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading users...</p>
      </div>
    {:else}
      <!-- Users Table -->
      <div class="table-container">
        <table class="users-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Tier</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each users as user}
              <tr>
                <td>
                  <div class="user-info">
                    <span class="user-email">{user.email}</span>
                    {#if user.name}
                      <span class="user-name">{user.name}</span>
                    {/if}
                  </div>
                </td>
                <td>
                  <select
                    value={user.tier}
                    onchange={(e) => updateUserTier(user.id, e.target.value)}
                    disabled={actionLoading === user.id || user.id === auth.user?.id}
                    class="tier-select tier-{user.tier}"
                  >
                    {#each TIERS as tier}
                      <option value={tier}>{tier}</option>
                    {/each}
                  </select>
                </td>
                <td>
                  <span class="date">{formatDate(user.created_at)}</span>
                </td>
                <td>
                  {#if user.id !== auth.user?.id && user.tier !== 'banned'}
                    <button
                      onclick={() => banUser(user.id)}
                      class="btn-danger btn-small"
                      disabled={actionLoading === user.id}
                    >
                      Ban
                    </button>
                  {:else if user.id === auth.user?.id}
                    <span class="you-badge">You</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="pagination">
          <button
            onclick={() => { page--; loadUsers(); }}
            disabled={page === 0}
            class="btn-secondary btn-small"
          >
            Previous
          </button>
          <span class="page-info">Page {page + 1} of {totalPages}</span>
          <button
            onclick={() => { page++; loadUsers(); }}
            disabled={page >= totalPages - 1}
            class="btn-secondary btn-small"
          >
            Next
          </button>
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .user-manager {
    max-width: 1200px;
  }

  .access-denied {
    text-align: center;
    padding: 3rem 1rem;
  }

  .page-header {
    margin-bottom: 1.5rem;
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

  .filters {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .search-box {
    display: flex;
    gap: 0.5rem;
    flex: 1;
    min-width: 250px;
  }

  .search-box input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
  }

  .filters select {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
  }

  .loading {
    text-align: center;
    padding: 2rem;
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

  .error-message {
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--error) 15%, transparent);
    color: var(--error);
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }

  .table-container {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    overflow: hidden;
  }

  .users-table {
    width: 100%;
    border-collapse: collapse;
  }

  .users-table th,
  .users-table td {
    padding: 0.75rem 1rem;
    text-align: left;
    border-bottom: 1px solid var(--border-default);
  }

  .users-table th {
    background: var(--surface-2);
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .users-table tr:last-child td {
    border-bottom: none;
  }

  .user-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .user-email {
    font-weight: 500;
    color: var(--text-primary);
  }

  .user-name {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .tier-select {
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid var(--border-default);
    font-size: 0.8125rem;
    background: var(--surface-0);
    color: var(--text-primary);
  }

  .tier-select.tier-admin {
    color: var(--error);
  }

  .tier-select.tier-patron {
    color: var(--accent-tertiary);
  }

  .tier-select.tier-approved {
    color: var(--success);
  }

  .tier-select.tier-banned {
    color: var(--error);
    opacity: 0.7;
  }

  .date {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .you-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: var(--surface-2);
    color: var(--text-secondary);
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .page-info {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .btn-primary, .btn-secondary, .btn-danger {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }

  .btn-small {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
  }

  .btn-primary {
    background: var(--accent-primary);
    color: white;
  }

  .btn-secondary {
    background: var(--surface-2);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
  }

  .btn-danger {
    background: var(--error);
    color: white;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .users-table th:nth-child(3),
    .users-table td:nth-child(3) {
      display: none;
    }
  }
</style>
