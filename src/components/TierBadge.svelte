<script>
  /**
   * TierBadge Component
   * Displays user tier with remaining queries
   */
  import { getAuthState } from '../lib/auth.svelte.js';
  import { getUsageState } from '../lib/usage.svelte.js';

  const auth = getAuthState();
  const usage = getUsageState();

  // Tier display configuration
  const TIER_CONFIG = {
    anonymous: { label: 'Guest', class: 'tier-anonymous', icon: '👤' },
    verified: { label: 'Verified', class: 'tier-verified', icon: '✓' },
    approved: { label: 'Approved', class: 'tier-approved', icon: '★' },
    patron: { label: 'Patron', class: 'tier-patron', icon: '♦' },
    institutional: { label: 'Institution', class: 'tier-institutional', icon: '🏛' },
    admin: { label: 'Admin', class: 'tier-admin', icon: '⚡' },
    banned: { label: 'Banned', class: 'tier-banned', icon: '⊘' }
  };

  // Tiers with unlimited searches
  const UNLIMITED_TIERS = ['approved', 'patron', 'institutional', 'admin'];

  let tier = $derived(auth.user?.tier || 'anonymous');
  let config = $derived(TIER_CONFIG[tier] || TIER_CONFIG.anonymous);
  let isUnlimited = $derived(UNLIMITED_TIERS.includes(tier));

  // Show remaining only for limited tiers and when we have data
  let showRemaining = $derived(!isUnlimited && usage.hasData);
</script>

<div class="tier-badge-container">
  <span class="tier-badge {config.class}" title="{config.label} tier">
    <span class="tier-icon">{config.icon}</span>
    <span class="tier-label">{config.label}</span>
  </span>

  {#if showRemaining}
    <span class="query-count" class:low={usage.remaining <= 3} class:critical={usage.remaining === 0}>
      {usage.remaining}/{usage.limit}
    </span>
  {:else if isUnlimited}
    <span class="query-count unlimited">∞</span>
  {/if}
</div>

<style>
  .tier-badge-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tier-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .tier-icon {
    font-size: 0.625rem;
  }

  .tier-label {
    display: none;
  }

  @media (min-width: 640px) {
    .tier-label {
      display: inline;
    }
  }

  /* Tier-specific styles using semantic colors */
  .tier-anonymous {
    background-color: var(--surface-2);
    color: var(--text-secondary);
  }

  .tier-verified {
    background-color: var(--info);
    color: white;
  }

  .tier-approved {
    background-color: var(--success);
    color: white;
  }

  .tier-patron {
    background: linear-gradient(135deg, var(--accent-tertiary), var(--accent-secondary));
    color: white;
  }

  .tier-institutional {
    background-color: var(--accent-primary);
    color: white;
  }

  .tier-admin {
    background: linear-gradient(135deg, var(--warning), var(--error));
    color: white;
  }

  .tier-banned {
    background-color: var(--error);
    color: white;
    opacity: 0.7;
  }

  .query-count {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .query-count.low {
    color: var(--warning);
  }

  .query-count.critical {
    color: var(--error);
    font-weight: 600;
  }

  .query-count.unlimited {
    color: var(--success);
    font-weight: 500;
  }
</style>
