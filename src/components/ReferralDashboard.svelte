<script>
  /**
   * ReferralDashboard Component
   * Shows user's referral stats and sharing options
   */
  import { onMount } from 'svelte';
  import { user } from '../lib/api.js';
  import { getAuthState } from '../lib/auth.svelte.js';
  import { getReferralUrl, generateQRCode } from '../lib/referral.js';
  import { getUserId } from '../lib/api.js';

  const auth = getAuthState();

  // State
  let loading = $state(true);
  let error = $state(null);
  let stats = $state(null);
  let qrCodeUrl = $state(null);
  let copied = $state(false);

  // Get referral URL for current user
  let referralUrl = $derived(getReferralUrl(getUserId()));

  onMount(async () => {
    try {
      // Load referral stats
      const [statsResult, qr] = await Promise.all([
        user.getReferralStats(),
        generateQRCode(referralUrl)
      ]);

      stats = statsResult;
      qrCodeUrl = qr;
    } catch (err) {
      // If endpoint doesn't exist yet, show empty stats
      stats = {
        clicks: 0,
        signups: 0,
        verified: 0,
        approved: 0,
        referralCode: getUserId()?.substring(0, 8) || 'unknown'
      };
      qrCodeUrl = await generateQRCode(referralUrl);
    } finally {
      loading = false;
    }
  });

  async function copyReferralLink() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      copied = true;
      setTimeout(() => copied = false, 2000);
    } catch (err) {
      error = 'Failed to copy link';
    }
  }

  function shareViaEmail() {
    const subject = encodeURIComponent('Check out SifterSearch');
    const body = encodeURIComponent(`I've been using SifterSearch to explore sacred texts from world religions. Join me!\n\n${referralUrl}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  }

  function shareViaTwitter() {
    const text = encodeURIComponent(`Explore sacred texts from world religions with SifterSearch. AI-powered search across spiritual writings. ${referralUrl}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  }

  function shareViaFacebook() {
    const url = encodeURIComponent(referralUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
  }

  function shareViaLinkedIn() {
    const url = encodeURIComponent(referralUrl);
    const title = encodeURIComponent('SifterSearch - Interfaith Scripture Library');
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank');
  }
</script>

<div class="referral-dashboard">
  <header class="dashboard-header">
    <h1>Referral Program</h1>
    <p class="subtitle">Share SifterSearch and help others discover sacred texts</p>
  </header>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading referral stats...</p>
    </div>
  {:else if !auth.isAuthenticated}
    <div class="auth-required">
      <h2>Sign in Required</h2>
      <p>Please sign in to access your referral dashboard.</p>
    </div>
  {:else}
    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">{stats?.clicks || 0}</span>
        <span class="stat-label">Link Clicks</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{stats?.signups || 0}</span>
        <span class="stat-label">Sign Ups</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{stats?.verified || 0}</span>
        <span class="stat-label">Verified Users</span>
      </div>
      <div class="stat-card highlight">
        <span class="stat-value">{stats?.approved || 0}</span>
        <span class="stat-label">Approved Users</span>
      </div>
    </div>

    <!-- Referral Link Section -->
    <section class="link-section">
      <h2>Your Referral Link</h2>
      <div class="link-row">
        <input
          type="text"
          readonly
          value={referralUrl}
          class="link-input"
          onclick={(e) => e.target.select()}
        />
        <button onclick={copyReferralLink} class="copy-btn" class:copied>
          {#if copied}
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="icon">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Copied!
          {:else}
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="icon">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy
          {/if}
        </button>
      </div>
    </section>

    <!-- QR Code Section -->
    <section class="qr-section">
      <h2>QR Code</h2>
      <p class="qr-info">Scan to share SifterSearch</p>
      {#if qrCodeUrl}
        <img src={qrCodeUrl} alt="QR code for referral link" class="qr-code" />
        <a href={qrCodeUrl} download="siftersearch-referral-qr.png" class="download-qr">
          Download QR Code
        </a>
      {/if}
    </section>

    <!-- Share Buttons -->
    <section class="share-section">
      <h2>Share via</h2>
      <div class="share-buttons">
        <button onclick={shareViaEmail} class="share-btn email" title="Share via Email">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Email
        </button>
        <button onclick={shareViaTwitter} class="share-btn twitter" title="Share on Twitter/X">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          Twitter
        </button>
        <button onclick={shareViaFacebook} class="share-btn facebook" title="Share on Facebook">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          Facebook
        </button>
        <button onclick={shareViaLinkedIn} class="share-btn linkedin" title="Share on LinkedIn">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          LinkedIn
        </button>
      </div>
    </section>

    <!-- Info Section -->
    <section class="info-section">
      <h2>How it Works</h2>
      <div class="info-grid">
        <div class="info-card">
          <div class="info-icon">1</div>
          <h3>Share Your Link</h3>
          <p>Copy your unique referral link and share it with friends, colleagues, or on social media.</p>
        </div>
        <div class="info-card">
          <div class="info-icon">2</div>
          <h3>Friends Sign Up</h3>
          <p>When someone clicks your link and creates an account, they're linked to your referral.</p>
        </div>
        <div class="info-card">
          <div class="info-icon">3</div>
          <h3>Earn Recognition</h3>
          <p>As your referrals become verified and approved users, you'll see your stats grow.</p>
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .referral-dashboard {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  .dashboard-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .dashboard-header h1 {
    margin: 0;
    font-size: 1.75rem;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0.5rem 0 0;
    color: var(--text-secondary);
  }

  .loading, .auth-required {
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

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.25rem;
    text-align: center;
  }

  .stat-card.highlight {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 5%, var(--surface-1));
  }

  .stat-value {
    display: block;
    font-size: 2rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .stat-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .link-section, .qr-section, .share-section, .info-section {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .link-section h2, .qr-section h2, .share-section h2, .info-section h2 {
    margin: 0 0 1rem;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .link-row {
    display: flex;
    gap: 0.5rem;
  }

  .link-input {
    flex: 1;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .copy-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.2s;
    white-space: nowrap;
  }

  .copy-btn:hover {
    background: var(--accent-primary-hover);
  }

  .copy-btn.copied {
    background: var(--success);
  }

  .copy-btn .icon {
    width: 1rem;
    height: 1rem;
  }

  .qr-section {
    text-align: center;
  }

  .qr-info {
    margin: 0 0 1rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .qr-code {
    width: 200px;
    height: 200px;
    margin-bottom: 1rem;
    border-radius: 0.5rem;
  }

  .download-qr {
    display: inline-block;
    padding: 0.5rem 1rem;
    background: var(--surface-2);
    color: var(--text-primary);
    text-decoration: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    transition: background 0.2s;
  }

  .download-qr:hover {
    background: var(--surface-3);
  }

  .share-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .share-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
    color: white;
    transition: opacity 0.2s;
  }

  .share-btn:hover {
    opacity: 0.9;
  }

  .share-btn svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .share-btn.email {
    background: #6b7280;
  }

  .share-btn.twitter {
    background: #000;
  }

  .share-btn.facebook {
    background: #1877f2;
  }

  .share-btn.linkedin {
    background: #0a66c2;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
  }

  .info-card {
    text-align: center;
  }

  .info-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1rem;
    background: var(--accent-primary);
    color: white;
    border-radius: 50%;
    font-weight: 600;
  }

  .info-card h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .info-card p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  @media (max-width: 640px) {
    .link-row {
      flex-direction: column;
    }

    .share-buttons {
      flex-direction: column;
    }

    .share-btn {
      justify-content: center;
    }
  }
</style>
