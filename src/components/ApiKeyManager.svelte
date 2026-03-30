<script>
  /**
   * ApiKeyManager Component
   * Create and manage API keys with usage/billing dashboard
   */
  import { onMount } from 'svelte';
  import { apiKeys } from '../lib/api.js';

  let { userTier } = $props();

  let keys = $state([]);
  let subscription = $state(null);
  let usage = $state(null);
  let loading = $state(true);
  let error = $state(null);
  // Create key form
  let newKeyName = $state('');
  let creating = $state(false);
  let createError = $state(null);
  let newlyCreatedKey = $state(null);
  let copiedKey = $state(false);
  let copiedKeyId = $state(null);
  // Revoke confirmation
  let revokingId = $state(null);
  let confirmRevokeId = $state(null);
  let subscribing = $state(false);

  const isAdmin = $derived(userTier === 'admin');
  const hasSubscription = $derived(isAdmin || (subscription?.active === true));

  onMount(async () => {
    await loadAll();
  });

  async function loadAll() {
    loading = true;
    error = null;
    try {
      const [keysData, subData, usageData] = await Promise.all([
        apiKeys.list().catch(() => ({ keys: [] })),
        isAdmin ? Promise.resolve({ active: true, plan: 'admin' }) : apiKeys.getSubscription().catch(() => null),
        apiKeys.getUsage().catch(() => null)
      ]);
      keys = keysData.keys || [];
      subscription = subData;
      usage = usageData;
    } catch (err) {
      error = err.message || 'Failed to load API key data';
    } finally {
      loading = false;
    }
  }

  async function createKey() {
    if (!newKeyName.trim()) return;
    creating = true;
    createError = null;
    try {
      const data = await apiKeys.create(newKeyName.trim());
      newlyCreatedKey = data.key;
      newKeyName = '';
      await loadAll();
    } catch (err) {
      createError = err.message || 'Failed to create key';
    } finally {
      creating = false;
    }
  }

  async function revokeKey(id) {
    if (confirmRevokeId !== id) {
      confirmRevokeId = id;
      return;
    }
    revokingId = id;
    confirmRevokeId = null;
    try {
      await apiKeys.revoke(id);
      keys = keys.filter(k => k.id !== id);
    } catch (err) {
      error = err.message || 'Failed to revoke key';
    } finally {
      revokingId = null;
    }
  }

  async function copyKey(keyValue = null, keyId = null) {
    try {
      await navigator.clipboard.writeText(keyValue || newlyCreatedKey);
      if (keyId) {
        copiedKeyId = keyId;
        setTimeout(() => { copiedKeyId = null; }, 2000);
      } else {
        copiedKey = true;
        setTimeout(() => { copiedKey = false; }, 2000);
      }
    } catch {
      // fallback: select text
    }
  }

  function dismissNewKey() {
    newlyCreatedKey = null;
    copiedKey = false;
  }

  async function handleSubscribe() {
    subscribing = true;
    try {
      const data = await apiKeys.subscribe();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      error = err.message || 'Failed to start subscription';
    } finally {
      subscribing = false;
    }
  }

  async function handlePortal() {
    try {
      const data = await apiKeys.portal();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      error = err.message || 'Failed to open billing portal';
    }
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatNumber(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString();
  }
</script>

{#if loading}
  <div class="loading-row">
    <div class="spinner"></div>
    <span>Loading API access...</span>
  </div>
{:else if error}
  <div class="alert error">{error}</div>
{:else}
  <!-- Subscription Banner -->
  {#if isAdmin}
    <div class="admin-note">Admin — free unlimited access</div>
  {:else if !hasSubscription}
    <div class="subscribe-cta">
      <div class="cta-text">
        <strong>Subscribe for API Access</strong>
        <span>Get programmatic access to search, documents, and more.</span>
      </div>
      <button class="btn-primary" onclick={handleSubscribe} disabled={subscribing}>
        {subscribing ? 'Redirecting...' : 'Subscribe'}
      </button>
    </div>
  {:else}
    <div class="subscription-status">
      <span class="status-badge active">Active</span>
      <span class="plan-label">{subscription?.plan || 'API Plan'}</span>
      <button class="btn-link" onclick={handlePortal}>Manage billing</button>
    </div>
  {/if}

  <!-- One-time key reveal -->
  {#if newlyCreatedKey}
    <div class="key-reveal">
      <p class="reveal-warning">Copy your API key now — it won't be shown again.</p>
      <div class="key-display">
        <code class="key-text">{newlyCreatedKey}</code>
        <button class="btn-copy" onclick={() => copyKey()}>
          {copiedKey ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <button class="btn-link" onclick={dismissNewKey}>Done</button>
    </div>
  {/if}

  <!-- Create Key -->
  {#if hasSubscription}
    <div class="create-section">
      <h3>Create API Key</h3>
      {#if createError}
        <div class="alert error">{createError}</div>
      {/if}
      <form onsubmit={(e) => { e.preventDefault(); createKey(); }}>
        <div class="create-row">
          <input
            type="text"
            placeholder="Key name (e.g. my-app)"
            bind:value={newKeyName}
            maxlength="64"
            class="key-name-input"
          />
          <button type="submit" class="btn-primary" disabled={creating || !newKeyName.trim()}>
            {creating ? 'Creating...' : 'Create Key'}
          </button>
        </div>
      </form>
    </div>

    <!-- Key Table -->
    {#if keys.length > 0}
      <div class="keys-section">
        <h3>Your Keys</h3>
        <div class="key-table">
          <div class="key-table-header">
            <span>Name</span>
            <span>Prefix</span>
            <span>Created</span>
            <span>Last Used</span>
            <span>Requests</span>
            <span></span>
          </div>
          {#each keys as key (key.id)}
            <div class="key-row">
              <span class="key-name">{key.name}</span>
              <span class="key-prefix-cell">
                <code class="key-prefix">{key.key_prefix || key.prefix}...</code>
                {#if key.key_value}
                  <button
                    class="btn-copy-sm"
                    onclick={() => copyKey(key.key_value, key.id)}
                    title="Copy full API key"
                  >
                    {copiedKeyId === key.id ? '✓' : 'Copy'}
                  </button>
                {/if}
              </span>
              <span class="key-meta">{formatDate(key.created_at)}</span>
              <span class="key-meta">{formatDate(key.last_used_at)}</span>
              <span class="key-meta">{formatNumber(key.request_count)}</span>
              <span class="key-action">
                {#if confirmRevokeId === key.id}
                  <button
                    class="btn-danger-sm"
                    onclick={() => revokeKey(key.id)}
                    disabled={revokingId === key.id}
                  >
                    Confirm
                  </button>
                  <button class="btn-link-sm" onclick={() => { confirmRevokeId = null; }}>Cancel</button>
                {:else}
                  <button
                    class="btn-revoke"
                    onclick={() => revokeKey(key.id)}
                    disabled={revokingId === key.id}
                  >
                    Revoke
                  </button>
                {/if}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <p class="no-keys">No API keys yet. Create one above.</p>
    {/if}

    <!-- Usage Dashboard -->
    {#if usage}
      <div class="usage-section">
        <h3>Usage</h3>
        <div class="usage-stats">
          <div class="stat-card">
            <span class="stat-value">{formatNumber(usage.totalRequests || 0)}</span>
            <span class="stat-label">Total requests</span>
          </div>
          {#if usage.usage && usage.usage.length > 0}
            {#each usage.usage as row}
              <div class="stat-card">
                <span class="stat-value">{formatNumber(row.count)}</span>
                <span class="stat-label">{row.search_type || 'searches'}</span>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  {/if}
{/if}

<style>
  .loading-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .alert {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }
  .alert.error {
    background: color-mix(in srgb, var(--error) 12%, transparent);
    color: var(--error);
    border: 1px solid color-mix(in srgb, var(--error) 30%, transparent);
  }
  .admin-note {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: color-mix(in srgb, var(--success) 10%, transparent);
    color: var(--success);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 1rem;
  }
  .subscribe-cta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem;
    background: var(--surface-0);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }
  .cta-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .cta-text strong {
    color: var(--text-primary);
    font-size: 0.9375rem;
  }
  .cta-text span {
    color: var(--text-secondary);
    font-size: 0.8125rem;
  }
  .subscription-status {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }
  .status-badge {
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .status-badge.active {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }
  .plan-label {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
  .key-reveal {
    padding: 1rem;
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent);
    border-radius: 0.5rem;
    margin-bottom: 1.25rem;
  }
  .reveal-warning {
    margin: 0 0 0.75rem;
    font-size: 0.875rem;
    color: var(--text-primary);
    font-weight: 500;
  }
  .key-display {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .key-text {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: var(--surface-0);
    border: 1px solid var(--border-default);
    border-radius: 0.375rem;
    font-family: monospace;
    font-size: 0.8125rem;
    color: var(--text-primary);
    word-break: break-all;
  }
  .btn-copy {
    padding: 0.5rem 1rem;
    background: var(--surface-2);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }
  .btn-copy:hover { background: var(--surface-3); }
  .create-section {
    margin-bottom: 1.5rem;
  }
  .create-section h3 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    color: var(--text-primary);
  }
  .create-row {
    display: flex;
    gap: 0.75rem;
  }
  .key-name-input {
    flex: 1;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
    font-size: 0.9375rem;
  }
  .key-name-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }
  .keys-section {
    margin-bottom: 1.5rem;
  }
  .keys-section h3 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    color: var(--text-primary);
  }
  .key-table {
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    overflow: hidden;
    font-size: 0.875rem;
  }
  .key-table-header {
    display: grid;
    grid-template-columns: 1.5fr 1.2fr 1fr 1fr 0.8fr 1fr;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    background: var(--surface-2);
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .key-row {
    display: grid;
    grid-template-columns: 1.5fr 1.2fr 1fr 1fr 0.8fr 1fr;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border-default);
    align-items: center;
  }
  .key-row:nth-child(even) { background: var(--surface-0); }
  .key-name {
    color: var(--text-primary);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .key-prefix-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .key-prefix {
    font-family: monospace;
    color: var(--text-secondary);
    font-size: 0.8125rem;
  }
  .btn-copy-sm {
    padding: 0.15rem 0.5rem;
    background: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 0.25rem;
    color: var(--text-secondary);
    font-size: 0.6875rem;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .btn-copy-sm:hover { background: var(--surface-3); color: var(--text-primary); }
  .key-meta {
    color: var(--text-secondary);
    font-size: 0.8125rem;
  }
  .key-action {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .no-keys {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin: 0 0 1.5rem;
  }
  .usage-section {
    margin-top: 1.5rem;
  }
  .usage-section h3 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    color: var(--text-primary);
  }
  .usage-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }
  .stat-card {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.875rem 1rem;
    background: var(--surface-0);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
  }
  .stat-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }
  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
  .daily-chart h4 {
    margin: 0 0 0.75rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-weight: 500;
  }
  .bar-chart {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    height: 100px;
    padding-bottom: 1.5rem;
    position: relative;
  }
  .bar-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 0.375rem;
    height: 100%;
  }
  .bar {
    width: 100%;
    background: var(--accent-primary);
    border-radius: 3px 3px 0 0;
    min-height: 3px;
    opacity: 0.75;
    transition: opacity 0.15s;
  }
  .bar:hover { opacity: 1; }
  .bar-label {
    font-size: 0.6875rem;
    color: var(--text-secondary);
  }
  /* Buttons */
  .btn-primary {
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
  }
  .btn-primary:hover:not(:disabled) { background: var(--accent-primary-hover); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-link {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent-primary);
    font-size: 0.875rem;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .btn-link:hover { color: var(--accent-primary-hover); }
  .btn-revoke {
    padding: 0.25rem 0.625rem;
    background: none;
    border: 1px solid var(--border-default);
    border-radius: 0.375rem;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-revoke:hover:not(:disabled) {
    border-color: var(--error);
    color: var(--error);
  }
  .btn-revoke:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-danger-sm {
    padding: 0.25rem 0.625rem;
    background: var(--error);
    border: none;
    border-radius: 0.375rem;
    color: white;
    font-size: 0.8125rem;
    cursor: pointer;
  }
  .btn-link-sm {
    background: none;
    border: none;
    padding: 0;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  @media (max-width: 580px) {
    .key-table-header, .key-row {
      grid-template-columns: 1fr 1fr auto;
    }
    .key-table-header span:nth-child(3),
    .key-table-header span:nth-child(4),
    .key-table-header span:nth-child(5),
    .key-row .key-meta:nth-child(3),
    .key-row .key-meta:nth-child(4),
    .key-row .key-meta:nth-child(5) {
      display: none;
    }
    .usage-stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
