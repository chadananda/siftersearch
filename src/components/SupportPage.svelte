<script>
  /**
   * SupportPage Component
   * Donation and support options with Stripe integration
   */
  import { onMount } from 'svelte';
  import { donations } from '../lib/api.js';
  import { getAuthState } from '../lib/auth.svelte.js';

  const auth = getAuthState();

  // State
  let loading = $state(true);
  let error = $state(null);
  let tiers = $state([]);
  let selectedTier = $state(null);
  let customAmount = $state(25);
  let processing = $state(false);

  // All subscriptions are monthly
  const frequency = 'monthly';

  onMount(async () => {
    try {
      const result = await donations.getTiers();
      tiers = result.tiers || [];
      if (tiers.length > 0) {
        selectedTier = tiers[1]?.id || tiers[0].id; // Default to middle tier
      }
    } catch (err) {
      error = err.message || 'Failed to load donation tiers';
    } finally {
      loading = false;
    }
  });

  async function handleDonate() {
    if (processing) return;

    processing = true;
    error = null;

    try {
      const result = await donations.createCheckout(
        selectedTier,
        frequency,
        selectedTier === 'custom' ? customAmount : null
      );

      // Redirect to Stripe checkout
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err) {
      error = err.message || 'Failed to create checkout session';
      processing = false;
    }
  }

  async function openPortal() {
    try {
      const result = await donations.createPortalSession();
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err) {
      error = err.message || 'Failed to open billing portal';
    }
  }

  function getTierAmount(tier) {
    if (!tier) return 0;
    return tier.amounts[frequency] || 0;
  }

</script>

<div class="support-page">
  <header class="page-header">
    <h1>Support SifterSearch</h1>
    <p class="subtitle">
      Help us maintain and improve access to sacred texts from world religions.
      Your support enables ongoing development, hosting, and expansion of our library.
    </p>
  </header>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading...</p>
    </div>
  {:else}
    {#if error}
      <div class="error-message">
        {error}
      </div>
    {/if}

    <!-- Tier Cards -->
    <div class="tier-grid">
      {#each tiers as tier}
        <button
          class="tier-card"
          class:selected={selectedTier === tier.id}
          onclick={() => selectedTier = tier.id}
        >
          <h3>{tier.name}</h3>
          <div class="price">
            <span class="amount">${tier.amounts.monthly}</span>
            <span class="period">/mo</span>
          </div>
          <p class="description">{tier.description}</p>
        </button>
      {/each}
    </div>

    <!-- Subscribe Button -->
    <div class="donate-section">
      <button
        class="donate-btn"
        onclick={handleDonate}
        disabled={processing || (!selectedTier)}
      >
        {#if processing}
          Processing...
        {:else}
          Subscribe for ${getTierAmount(tiers.find(t => t.id === selectedTier))}/month
        {/if}
      </button>

      <p class="secure-note">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="icon">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Secure payment via Stripe
      </p>
    </div>

    <!-- Manage Subscription -->
    {#if auth.isAuthenticated}
      <div class="manage-section">
        <h3>Manage Your Subscription</h3>
        <p>View billing history, update payment methods, or cancel your subscription.</p>
        <button class="portal-btn" onclick={openPortal}>
          Open Billing Portal
        </button>
      </div>
    {/if}

    <!-- Why Support -->
    <section class="why-section">
      <h2>Why Support SifterSearch?</h2>
      <div class="reasons-grid">
        <div class="reason">
          <div class="reason-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h4>Expand the Library</h4>
          <p>Add more sacred texts from diverse traditions</p>
        </div>
        <div class="reason">
          <div class="reason-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h4>Improve AI Features</h4>
          <p>Better search, analysis, and translation</p>
        </div>
        <div class="reason">
          <div class="reason-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h4>Keep It Free</h4>
          <p>Ensure access for everyone, everywhere</p>
        </div>
      </div>
    </section>

    <!-- Other Ways to Help -->
    <section class="other-ways">
      <h2>Other Ways to Help</h2>
      <div class="ways-grid">
        <a href="/contribute" class="way-card">
          <h4>Contribute Texts</h4>
          <p>Help expand our collection by submitting sacred texts</p>
        </a>
        <a href="/referrals" class="way-card">
          <h4>Refer Friends</h4>
          <p>Share SifterSearch with others interested in sacred texts</p>
        </a>
        <a href="/community" class="way-card">
          <h4>Join the Community</h4>
          <p>Participate in discussions and share insights</p>
        </a>
      </div>
    </section>
  {/if}
</div>

<style>
  .support-page {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  .page-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .page-header h1 {
    margin: 0;
    font-size: 2rem;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 1rem 0 0;
    color: var(--text-secondary);
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
    line-height: 1.6;
  }

  .loading {
    text-align: center;
    padding: 3rem;
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
    padding: 1rem;
    background: color-mix(in srgb, var(--error) 10%, transparent);
    border: 1px solid var(--error);
    border-radius: 0.5rem;
    color: var(--error);
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .tier-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .tier-card {
    padding: 1.5rem;
    background: var(--surface-1);
    border: 2px solid var(--border-default);
    border-radius: 0.75rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tier-card:hover {
    border-color: var(--accent-primary);
  }

  .tier-card.selected {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 5%, var(--surface-1));
  }

  .tier-card h3 {
    margin: 0 0 0.75rem;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .price {
    margin-bottom: 0.75rem;
  }

  .amount {
    font-size: 2rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .period {
    font-size: 1rem;
    color: var(--text-secondary);
  }

  .description {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .donate-section {
    text-align: center;
    margin-bottom: 3rem;
  }

  .donate-btn {
    padding: 1rem 3rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .donate-btn:hover:not(:disabled) {
    background: var(--accent-primary-hover);
  }

  .donate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .secure-note {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 1rem;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .secure-note .icon {
    width: 1rem;
    height: 1rem;
  }

  .manage-section {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.5rem;
    text-align: center;
    margin-bottom: 3rem;
  }

  .manage-section h3 {
    margin: 0 0 0.5rem;
    color: var(--text-primary);
  }

  .manage-section p {
    margin: 0 0 1rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .portal-btn {
    padding: 0.5rem 1rem;
    background: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .portal-btn:hover {
    background: var(--surface-3);
  }

  .why-section, .other-ways {
    margin-bottom: 3rem;
  }

  .why-section h2, .other-ways h2 {
    text-align: center;
    margin: 0 0 1.5rem;
    font-size: 1.5rem;
    color: var(--text-primary);
  }

  .reasons-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
  }

  .reason {
    text-align: center;
    padding: 1.5rem;
  }

  .reason-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1rem;
    background: var(--surface-2);
    border-radius: 50%;
    color: var(--accent-primary);
  }

  .reason-icon svg {
    width: 24px;
    height: 24px;
  }

  .reason h4 {
    margin: 0 0 0.5rem;
    color: var(--text-primary);
  }

  .reason p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .ways-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .way-card {
    padding: 1.5rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    text-decoration: none;
    transition: border-color 0.2s;
  }

  .way-card:hover {
    border-color: var(--accent-primary);
  }

  .way-card h4 {
    margin: 0 0 0.5rem;
    color: var(--text-primary);
  }

  .way-card p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  @media (max-width: 640px) {
    .frequency-toggle {
      flex-direction: column;
    }

    .freq-btn {
      text-align: center;
    }

    .tier-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
