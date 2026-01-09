<script>
  /**
   * ProfilePage Component
   * Displays and allows editing of user profile information
   */
  import { onMount } from 'svelte';
  import { user } from '../lib/api.js';
  import { getAuthState, logout, requireAuth } from '../lib/auth.svelte.js';
  import TierBadge from './TierBadge.svelte';

  const auth = getAuthState();

  // Route guard - redirect to home if not authenticated
  $effect(() => {
    if (!auth.loading && !auth.isAuthenticated) {
      requireAuth('/');
    }
  });

  // Profile state
  let profile = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let saving = $state(false);
  let saveMessage = $state(null);

  // Edit mode
  let editing = $state(false);
  let editName = $state('');
  let editLanguage = $state('en');

  // Languages supported
  const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'fa', name: 'Persian (Farsi)' },
    { code: 'ar', name: 'Arabic' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ru', name: 'Russian' }
  ];

  // Tier descriptions
  const TIER_INFO = {
    anonymous: { name: 'Guest', description: 'Limited access - sign up to unlock more features' },
    verified: { name: 'Verified', description: 'Email verified - request approval for full access' },
    approved: { name: 'Approved', description: 'Full access to search and research features' },
    patron: { name: 'Patron', description: 'Supporter with priority access' },
    institutional: { name: 'Institution', description: 'Organizational account' },
    admin: { name: 'Administrator', description: 'Full administrative access' }
  };

  // Delete account confirmation
  let showDeleteConfirm = $state(false);
  let deleting = $state(false);

  onMount(async () => {
    await loadProfile();
  });

  async function loadProfile() {
    if (!auth.isAuthenticated) {
      loading = false;
      return;
    }

    loading = true;
    error = null;

    try {
      const data = await user.getProfile();
      profile = data.user;
      editName = profile.name || '';
      editLanguage = profile.preferred_language || 'en';
    } catch (err) {
      error = err.message || 'Failed to load profile';
    } finally {
      loading = false;
    }
  }

  function startEditing() {
    editName = profile?.name || '';
    editLanguage = profile?.preferred_language || 'en';
    editing = true;
    saveMessage = null;
  }

  function cancelEditing() {
    editing = false;
    saveMessage = null;
  }

  async function saveProfile() {
    saving = true;
    saveMessage = null;

    try {
      const updates = {
        name: editName,
        preferred_language: editLanguage
      };

      const data = await user.updateProfile(updates);
      profile = data.user;
      editing = false;
      saveMessage = { type: 'success', text: 'Profile updated successfully' };
    } catch (err) {
      saveMessage = { type: 'error', text: err.message || 'Failed to save profile' };
    } finally {
      saving = false;
    }
  }

  async function handleDeleteAccount() {
    deleting = true;
    try {
      await user.deleteAccount();
      await logout();
      window.location.href = '/';
    } catch (err) {
      saveMessage = { type: 'error', text: err.message || 'Failed to delete account' };
      deleting = false;
      showDeleteConfirm = false;
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
</script>

<div class="profile-page">
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading profile...</p>
    </div>
  {:else if !auth.isAuthenticated}
    <div class="not-authenticated">
      <h2>Not Signed In</h2>
      <p>Please sign in to view your profile.</p>
      <a href="/" class="btn-primary">Go to Home</a>
    </div>
  {:else if error}
    <div class="error-state">
      <h2>Error</h2>
      <p>{error}</p>
      <button onclick={loadProfile} class="btn-primary">Try Again</button>
    </div>
  {:else if profile}
    <div class="profile-content">
      <!-- Header -->
      <div class="profile-header">
        <div class="avatar">
          {profile.name?.[0]?.toUpperCase() || profile.email[0].toUpperCase()}
        </div>
        <div class="header-info">
          <h1>{profile.name || 'User'}</h1>
          <p class="email">{profile.email}</p>
          <div class="tier-display">
            <TierBadge />
          </div>
        </div>
      </div>

      <!-- Messages -->
      {#if saveMessage}
        <div class="message {saveMessage.type}">
          {saveMessage.text}
        </div>
      {/if}

      <!-- Profile Details -->
      <section class="profile-section">
        <div class="section-header">
          <h2>Profile Information</h2>
          {#if !editing}
            <button onclick={startEditing} class="btn-secondary btn-small">Edit</button>
          {/if}
        </div>

        {#if editing}
          <form onsubmit={(e) => { e.preventDefault(); saveProfile(); }}>
            <div class="form-group">
              <label for="name">Display Name</label>
              <input
                type="text"
                id="name"
                bind:value={editName}
                placeholder="Enter your name"
                maxlength="100"
              />
            </div>

            <div class="form-group">
              <label for="language">Preferred Language</label>
              <select id="language" bind:value={editLanguage}>
                {#each LANGUAGES as lang}
                  <option value={lang.code}>{lang.name}</option>
                {/each}
              </select>
            </div>

            <div class="form-actions">
              <button type="submit" class="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" onclick={cancelEditing} class="btn-secondary" disabled={saving}>
                Cancel
              </button>
            </div>
          </form>
        {:else}
          <div class="info-grid">
            <div class="info-item">
              <span class="label">Display Name</span>
              <span class="value">{profile.name || 'Not set'}</span>
            </div>
            <div class="info-item">
              <span class="label">Email</span>
              <span class="value">{profile.email}</span>
            </div>
            <div class="info-item">
              <span class="label">Preferred Language</span>
              <span class="value">{LANGUAGES.find(l => l.code === profile.preferred_language)?.name || 'English'}</span>
            </div>
            <div class="info-item">
              <span class="label">Member Since</span>
              <span class="value">{formatDate(profile.created_at)}</span>
            </div>
            {#if profile.approved_at}
              <div class="info-item">
                <span class="label">Approved On</span>
                <span class="value">{formatDate(profile.approved_at)}</span>
              </div>
            {/if}
          </div>
        {/if}
      </section>

      <!-- Account Tier -->
      <section class="profile-section">
        <h2>Account Tier</h2>
        <div class="tier-info">
          <div class="tier-badge-large">
            <TierBadge />
          </div>
          <p class="tier-description">
            {TIER_INFO[profile.tier]?.description || 'Standard account access'}
          </p>
        </div>
      </section>

      <!-- Danger Zone -->
      <section class="profile-section danger-zone">
        <h2>Danger Zone</h2>
        <div class="danger-content">
          <div class="danger-item">
            <div>
              <h3>Delete Account</h3>
              <p>Permanently delete your account and all associated data.</p>
            </div>
            <button onclick={() => showDeleteConfirm = true} class="btn-danger">
              Delete Account
            </button>
          </div>
        </div>
      </section>
    </div>
  {/if}

  <!-- Delete Confirmation Modal -->
  {#if showDeleteConfirm}
    <div class="modal-overlay" onclick={() => !deleting && (showDeleteConfirm = false)}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <h2>Delete Account?</h2>
        <p>This action cannot be undone. All your data will be permanently deleted.</p>
        <div class="modal-actions">
          <button onclick={handleDeleteAccount} class="btn-danger" disabled={deleting}>
            {deleting ? 'Deleting...' : 'Yes, Delete My Account'}
          </button>
          <button onclick={() => showDeleteConfirm = false} class="btn-secondary" disabled={deleting}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .profile-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  .loading, .not-authenticated, .error-state {
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

  .profile-header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-bottom: 2rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--border-default);
  }

  .avatar {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: var(--accent-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .header-info h1 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
    color: var(--text-primary);
  }

  .email {
    margin: 0 0 0.5rem;
    color: var(--text-secondary);
  }

  .tier-display {
    margin-top: 0.5rem;
  }

  .profile-section {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .profile-section h2 {
    margin: 0;
    font-size: 1.125rem;
    color: var(--text-primary);
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-item .label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .info-item .value {
    color: var(--text-primary);
    font-weight: 500;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
    font-size: 1rem;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .form-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }

  .tier-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .tier-description {
    margin: 0;
    color: var(--text-secondary);
  }

  .danger-zone {
    border-color: var(--error);
  }

  .danger-zone h2 {
    color: var(--error);
  }

  .danger-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .danger-item h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .danger-item p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .message {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }

  .message.success {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }

  .message.error {
    background: color-mix(in srgb, var(--error) 15%, transparent);
    color: var(--error);
  }

  /* Buttons */
  .btn-primary, .btn-secondary, .btn-danger {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--accent-primary);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-primary-hover);
  }

  .btn-secondary {
    background: var(--surface-2);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--surface-3);
  }

  .btn-danger {
    background: var(--error);
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-small {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: var(--surface-0);
    border-radius: 0.75rem;
    padding: 1.5rem;
    max-width: 400px;
    width: 90%;
  }

  .modal h2 {
    margin: 0 0 0.5rem;
    color: var(--error);
  }

  .modal p {
    margin: 0 0 1.5rem;
    color: var(--text-secondary);
  }

  .modal-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  @media (max-width: 640px) {
    .profile-header {
      flex-direction: column;
      text-align: center;
    }

    .danger-item {
      flex-direction: column;
      text-align: center;
    }

    .modal-actions {
      flex-direction: column;
    }
  }
</style>
