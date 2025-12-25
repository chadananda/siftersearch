<script>
  /**
   * PendingApproval Component
   * Review and approve pending users
   */
  import { onMount } from 'svelte';
  import { admin } from '../../lib/api.js';
  import { getAuthState } from '../../lib/auth.svelte.js';

  const auth = getAuthState();

  let pendingUsers = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let actionLoading = $state(null);

  onMount(async () => {
    await loadPending();
  });

  async function loadPending() {
    loading = true;
    error = null;

    try {
      const data = await admin.getPending();
      pendingUsers = data.users || [];
    } catch (err) {
      error = err.message || 'Failed to load pending users';
    } finally {
      loading = false;
    }
  }

  async function approveUser(userId) {
    actionLoading = userId;
    try {
      await admin.approveUser(userId);
      // Remove from list
      pendingUsers = pendingUsers.filter(u => u.id !== userId);
    } catch (err) {
      alert(err.message || 'Failed to approve user');
    } finally {
      actionLoading = null;
    }
  }

  async function rejectUser(userId) {
    if (!confirm('Are you sure you want to reject this user? They will be banned.')) return;

    actionLoading = userId;
    try {
      await admin.banUser(userId);
      // Remove from list
      pendingUsers = pendingUsers.filter(u => u.id !== userId);
    } catch (err) {
      alert(err.message || 'Failed to reject user');
    } finally {
      actionLoading = null;
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getTimeSince(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  }
</script>

<div class="pending-approval">
  {#if !auth.isAuthenticated || auth.user?.tier !== 'admin'}
    <div class="access-denied">
      <h2>Access Denied</h2>
      <p>You need admin access to view this page.</p>
      <a href="/" class="btn-primary">Go to Home</a>
    </div>
  {:else}
    <header class="page-header">
      <h1>Pending Approval</h1>
      <p class="subtitle">{pendingUsers.length} users waiting for approval</p>
    </header>

    {#if error}
      <div class="error-message">{error}</div>
    {/if}

    {#if loading}
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading pending users...</p>
      </div>
    {:else if pendingUsers.length === 0}
      <div class="empty-state">
        <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3>All caught up!</h3>
        <p>No users are waiting for approval.</p>
      </div>
    {:else}
      <div class="pending-list">
        {#each pendingUsers as user}
          <div class="pending-card">
            <div class="user-info">
              <div class="user-main">
                <span class="user-email">{user.email}</span>
                {#if user.name}
                  <span class="user-name">{user.name}</span>
                {/if}
              </div>
              <div class="user-meta">
                <span class="signup-time" title={formatDate(user.created_at)}>
                  Signed up {getTimeSince(user.created_at)}
                </span>
                {#if user.referral_code}
                  <span class="referral-badge">
                    Referred by: {user.referral_code}
                  </span>
                {/if}
              </div>
            </div>
            <div class="actions">
              <button
                onclick={() => approveUser(user.id)}
                class="btn-approve"
                disabled={actionLoading === user.id}
              >
                {#if actionLoading === user.id}
                  <span class="btn-spinner"></span>
                {:else}
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Approve
                {/if}
              </button>
              <button
                onclick={() => rejectUser(user.id)}
                class="btn-reject"
                disabled={actionLoading === user.id}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Reject
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .pending-approval {
    max-width: 800px;
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

  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
  }

  .empty-icon {
    width: 64px;
    height: 64px;
    color: var(--success);
    margin-bottom: 1rem;
  }

  .empty-state h3 {
    margin: 0 0 0.5rem;
    color: var(--text-primary);
  }

  .empty-state p {
    margin: 0;
    color: var(--text-secondary);
  }

  .pending-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .pending-card {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .user-info {
    flex: 1;
    min-width: 0;
  }

  .user-main {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .user-email {
    font-weight: 500;
    color: var(--text-primary);
    word-break: break-all;
  }

  .user-name {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .user-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .signup-time {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .referral-badge {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    background: color-mix(in srgb, var(--info) 15%, transparent);
    color: var(--info);
    border-radius: 0.25rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .btn-approve, .btn-reject {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }

  .btn-approve {
    background: var(--success);
    color: white;
  }

  .btn-approve:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn-reject {
    background: var(--surface-2);
    color: var(--text-secondary);
    border: 1px solid var(--border-default);
  }

  .btn-reject:hover:not(:disabled) {
    background: var(--error);
    color: white;
    border-color: var(--error);
  }

  .btn-approve svg, .btn-reject svg {
    width: 16px;
    height: 16px;
  }

  .btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary {
    display: inline-block;
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    text-decoration: none;
    font-size: 0.875rem;
  }

  @media (max-width: 640px) {
    .pending-card {
      flex-direction: column;
      align-items: stretch;
    }

    .actions {
      justify-content: flex-end;
    }
  }
</style>
