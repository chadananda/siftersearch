<script>
  /**
   * SettingsPage Component
   * User settings for password, preferences, and sessions
   */
  import { onMount } from 'svelte';
  import { user } from '../lib/api.js';
  import { getAuthState, logout } from '../lib/auth.svelte.js';

  const auth = getAuthState();

  // Loading states
  let loading = $state(true);
  let saving = $state(false);
  let message = $state(null);

  // Password change
  let showPasswordForm = $state(false);
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let passwordError = $state(null);

  // Preferences (stored in metadata)
  let preferences = $state({
    emailNotifications: true,
    searchHistory: true,
    analyticsTracking: true
  });

  onMount(async () => {
    if (auth.isAuthenticated) {
      await loadSettings();
    }
    loading = false;
  });

  async function loadSettings() {
    try {
      const data = await user.getProfile();
      if (data.user?.metadata?.preferences) {
        preferences = { ...preferences, ...data.user.metadata.preferences };
      }
    } catch {
      // Use defaults
    }
  }

  async function savePreferences() {
    saving = true;
    message = null;

    try {
      await user.updateProfile({
        metadata: { preferences }
      });
      message = { type: 'success', text: 'Settings saved successfully' };
    } catch (err) {
      message = { type: 'error', text: err.message || 'Failed to save settings' };
    } finally {
      saving = false;
    }
  }

  async function changePassword() {
    passwordError = null;

    if (newPassword !== confirmPassword) {
      passwordError = 'Passwords do not match';
      return;
    }

    if (newPassword.length < 8) {
      passwordError = 'Password must be at least 8 characters';
      return;
    }

    saving = true;
    try {
      await user.changePassword(currentPassword, newPassword);
      message = { type: 'success', text: 'Password changed successfully' };
      showPasswordForm = false;
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
    } catch (err) {
      passwordError = err.message || 'Failed to change password';
    } finally {
      saving = false;
    }
  }

  function cancelPasswordChange() {
    showPasswordForm = false;
    currentPassword = '';
    newPassword = '';
    confirmPassword = '';
    passwordError = null;
  }
</script>

<div class="settings-page">
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading settings...</p>
    </div>
  {:else if !auth.isAuthenticated}
    <div class="not-authenticated">
      <h2>Not Signed In</h2>
      <p>Please sign in to access settings.</p>
      <a href="/" class="btn-primary">Go to Home</a>
    </div>
  {:else}
    <div class="settings-content">
      <h1>Settings</h1>

      <!-- Messages -->
      {#if message}
        <div class="message {message.type}">
          {message.text}
        </div>
      {/if}

      <!-- Password Section -->
      <section class="settings-section">
        <h2>Password</h2>
        {#if !showPasswordForm}
          <p class="section-desc">Change your account password</p>
          <button onclick={() => showPasswordForm = true} class="btn-secondary">
            Change Password
          </button>
        {:else}
          <form onsubmit={(e) => { e.preventDefault(); changePassword(); }}>
            {#if passwordError}
              <div class="error-text">{passwordError}</div>
            {/if}

            <div class="form-group">
              <label for="current-password">Current Password</label>
              <input
                type="password"
                id="current-password"
                bind:value={currentPassword}
                required
              />
            </div>

            <div class="form-group">
              <label for="new-password">New Password</label>
              <input
                type="password"
                id="new-password"
                bind:value={newPassword}
                required
                minlength="8"
                placeholder="At least 8 characters"
              />
            </div>

            <div class="form-group">
              <label for="confirm-password">Confirm New Password</label>
              <input
                type="password"
                id="confirm-password"
                bind:value={confirmPassword}
                required
              />
            </div>

            <div class="form-actions">
              <button type="submit" class="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Update Password'}
              </button>
              <button type="button" onclick={cancelPasswordChange} class="btn-secondary" disabled={saving}>
                Cancel
              </button>
            </div>
          </form>
        {/if}
      </section>

      <!-- Notifications Section -->
      <section class="settings-section">
        <h2>Notifications</h2>
        <p class="section-desc">Manage how we communicate with you</p>

        <div class="toggle-list">
          <label class="toggle-item">
            <div class="toggle-info">
              <span class="toggle-label">Email Notifications</span>
              <span class="toggle-desc">Receive updates about your account and new features</span>
            </div>
            <input
              type="checkbox"
              bind:checked={preferences.emailNotifications}
              class="toggle-input"
            />
          </label>
        </div>
      </section>

      <!-- Privacy Section -->
      <section class="settings-section">
        <h2>Privacy</h2>
        <p class="section-desc">Control how your data is used</p>

        <div class="toggle-list">
          <label class="toggle-item">
            <div class="toggle-info">
              <span class="toggle-label">Search History</span>
              <span class="toggle-desc">Save your search queries to improve recommendations</span>
            </div>
            <input
              type="checkbox"
              bind:checked={preferences.searchHistory}
              class="toggle-input"
            />
          </label>

          <label class="toggle-item">
            <div class="toggle-info">
              <span class="toggle-label">Analytics</span>
              <span class="toggle-desc">Help us improve by sharing anonymous usage data</span>
            </div>
            <input
              type="checkbox"
              bind:checked={preferences.analyticsTracking}
              class="toggle-input"
            />
          </label>
        </div>
      </section>

      <!-- Save Button -->
      <div class="settings-footer">
        <button onclick={savePreferences} class="btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <!-- Account Link -->
      <section class="settings-section">
        <h2>Account</h2>
        <p class="section-desc">Manage your profile and account settings</p>
        <div class="link-list">
          <a href="/profile" class="link-item">
            <span>View Profile</span>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .settings-page {
    max-width: 640px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  h1 {
    margin: 0 0 2rem;
    font-size: 1.75rem;
    color: var(--text-primary);
  }

  .loading, .not-authenticated {
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

  .settings-section {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .settings-section h2 {
    margin: 0 0 0.5rem;
    font-size: 1.125rem;
    color: var(--text-primary);
  }

  .section-desc {
    margin: 0 0 1rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .message {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .message.success {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }

  .message.error {
    background: color-mix(in srgb, var(--error) 15%, transparent);
    color: var(--error);
  }

  .error-text {
    color: var(--error);
    font-size: 0.875rem;
    margin-bottom: 1rem;
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

  .form-group input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
    font-size: 1rem;
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .form-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }

  .toggle-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .toggle-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    cursor: pointer;
  }

  .toggle-info {
    flex: 1;
  }

  .toggle-label {
    display: block;
    color: var(--text-primary);
    font-weight: 500;
  }

  .toggle-desc {
    display: block;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin-top: 0.125rem;
  }

  .toggle-input {
    width: 44px;
    height: 24px;
    appearance: none;
    background: var(--surface-3);
    border-radius: 12px;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
    flex-shrink: 0;
  }

  .toggle-input::before {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
  }

  .toggle-input:checked {
    background: var(--accent-primary);
  }

  .toggle-input:checked::before {
    transform: translateX(20px);
  }

  .settings-footer {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 1.5rem;
  }

  .link-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .link-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: var(--surface-0);
    border-radius: 0.5rem;
    text-decoration: none;
    color: var(--text-primary);
    transition: background 0.2s;
  }

  .link-item:hover {
    background: var(--surface-2);
  }

  .link-item svg {
    color: var(--text-secondary);
  }

  /* Buttons */
  .btn-primary, .btn-secondary {
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

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
