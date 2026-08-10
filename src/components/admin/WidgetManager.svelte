<script>
  // Chat widget profile manager. CRUD + per-profile analytics over /api/v1/widget/admin/* (routes/widget.js).
  // Native replacement for the API-served /widget-admin console — same data, admin-JWT auth, site theme.
  import { onMount } from 'svelte';
  import { admin } from '../../lib/api.js';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';

  const auth = getAuthState();

  let profiles = $state([]);
  let loading = $state(true);
  let authReady = $state(false);
  let error = $state(null);
  let notice = $state(null);

  // Editor state — null when closed; {} for create; a profile copy for edit
  let editing = $state(null);
  let saving = $state(false);

  // Analytics state
  let analytics = $state(null);
  let analyticsLoading = $state(false);
  let analyticsDays = $state(30);

  onMount(async () => {
    await initAuth();
    authReady = true;
    if (auth.isAuthenticated && auth.user?.tier === 'admin') {
      await loadProfiles();
    } else {
      loading = false;
    }
  });

  async function loadProfiles() {
    loading = true;
    error = null;
    try {
      const data = await admin.getWidgetProfiles();
      profiles = data.profiles || [];
    } catch (err) {
      error = err.message || 'Failed to load widget profiles';
    } finally {
      loading = false;
    }
  }

  function openCreate() {
    editing = { name: '', domainsText: '', tier: 'free', greeting: '', accent: '#1a6b5e', position: 'bottom-right', placeholder: '', chatbotLocation: '' };
  }

  function openEdit(p) {
    editing = {
      id: p.id,
      name: p.name,
      domainsText: p.domains.join(', '),
      tier: p.tier,
      greeting: p.config.greeting || '',
      accent: p.config.accent || '#1a6b5e',
      position: p.config.position || 'bottom-right',
      placeholder: p.config.placeholder || '',
      chatbotLocation: p.config.chatbotLocation || ''
    };
  }

  async function saveProfile() {
    if (!editing.name.trim()) { error = 'Name is required'; return; }
    saving = true;
    error = null;
    const payload = {
      name: editing.name.trim(),
      domains: editing.domainsText.split(',').map((d) => d.trim()).filter(Boolean),
      tier: editing.tier,
      config: {
        ...(editing.greeting && { greeting: editing.greeting }),
        ...(editing.accent && { accent: editing.accent }),
        ...(editing.position && { position: editing.position }),
        ...(editing.placeholder && { placeholder: editing.placeholder }),
        ...(editing.chatbotLocation && { chatbotLocation: editing.chatbotLocation })
      }
    };
    try {
      if (editing.id) {
        await admin.updateWidgetProfile(editing.id, payload);
        notice = `Updated "${payload.name}"`;
      } else {
        const created = await admin.createWidgetProfile(payload);
        notice = `Created "${created.name}" — token ${created.token}`;
      }
      editing = null;
      await loadProfiles();
    } catch (err) {
      error = err.message || 'Failed to save profile';
    } finally {
      saving = false;
    }
  }

  async function deleteProfile(p) {
    if (!confirm(`Delete widget profile "${p.name}"? Its embed key stops working immediately.`)) return;
    error = null;
    try {
      await admin.deleteWidgetProfile(p.id);
      notice = `Deleted "${p.name}"`;
      if (analytics?.profile?.id === p.id) analytics = null;
      await loadProfiles();
    } catch (err) {
      error = err.message || 'Failed to delete profile';
    }
  }

  async function showAnalytics(p, days = analyticsDays) {
    analyticsLoading = true;
    analyticsDays = days;
    error = null;
    try {
      analytics = await admin.getWidgetAnalytics(p.id, days);
    } catch (err) {
      error = err.message || 'Failed to load analytics';
    } finally {
      analyticsLoading = false;
    }
  }

  async function copyEmbed(p) {
    try {
      await navigator.clipboard.writeText(p.embed);
      notice = `Embed snippet for "${p.name}" copied`;
    } catch {
      notice = null;
      error = 'Clipboard unavailable — copy the snippet manually';
    }
  }

  // Demo page lives on the API origin; recover it from the embed snippet so dev/prod both work
  function demoUrl(p) {
    const m = p.embed.match(/src="(.+?)\/widget\.js"/);
    return `${m ? m[1] : 'https://siftersearch.com'}/widget/demo?key=${p.token}`;
  }

  function formatTs(ts) {
    if (!ts) return 'never';
    return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  let maxDaily = $derived(analytics ? Math.max(1, ...analytics.daily.map((d) => d.messages)) : 1);
</script>

<div class="widget-manager">
  {#if !authReady}
    <div class="loading" role="status"><div class="spinner"></div><p>Loading...</p></div>
  {:else if !auth.isAuthenticated || auth.user?.tier !== 'admin'}
    <div class="access-denied">
      <h2>Access Denied</h2>
      <p>You need admin access to view this page.</p>
      <a href="/" class="btn-primary">Go to Home</a>
    </div>
  {:else}
    <header class="page-header">
      <div>
        <h1>Chat Widgets</h1>
        <p class="subtitle">Embeddable SifterChat profiles — one per host site</p>
      </div>
      <button class="btn-primary" onclick={openCreate} aria-label="Create widget profile">New Profile</button>
    </header>

    {#if error}<div class="error-message" role="alert">{error}</div>{/if}
    {#if notice}<div class="notice-message" role="status">{notice}</div>{/if}

    {#if editing}
      <section class="editor-card" aria-label={editing.id ? 'Edit widget profile' : 'Create widget profile'}>
        <h2>{editing.id ? `Edit: ${editing.name}` : 'New Profile'}</h2>
        <div class="editor-grid">
          <label>Name
            <input type="text" bind:value={editing.name} placeholder="Site or organization name" aria-label="Profile name" />
          </label>
          <label>Allowed domains <span class="hint">(comma-separated hostnames)</span>
            <input type="text" bind:value={editing.domainsText} placeholder="example.org, www.example.org" aria-label="Allowed domains" />
          </label>
          <label>Tier
            <select bind:value={editing.tier} aria-label="Profile tier">
              <option value="free">free</option>
              <option value="pro">pro</option>
              <option value="house">house</option>
            </select>
          </label>
          <label>Accent color
            <span class="accent-row">
              <input type="color" bind:value={editing.accent} aria-label="Accent color" />
              <code>{editing.accent}</code>
            </span>
          </label>
          <label>Greeting
            <input type="text" bind:value={editing.greeting} placeholder="Hello! Ask me anything about the sacred literature." aria-label="Greeting message" />
          </label>
          <label>Input placeholder
            <input type="text" bind:value={editing.placeholder} placeholder="Ask a question…" aria-label="Input placeholder text" />
          </label>
          <label>Position
            <select bind:value={editing.position} aria-label="Widget position">
              <option value="bottom-right">bottom-right</option>
              <option value="bottom-left">bottom-left</option>
            </select>
          </label>
          <label>Chatbot location <span class="hint">(optional URL the bubble links to)</span>
            <input type="text" bind:value={editing.chatbotLocation} placeholder="https://…" aria-label="Chatbot location URL" />
          </label>
        </div>
        <div class="editor-actions">
          <button class="btn-primary" onclick={saveProfile} disabled={saving} aria-label="Save widget profile">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button class="btn-secondary" onclick={() => { editing = null; }} disabled={saving} aria-label="Cancel editing">Cancel</button>
        </div>
      </section>
    {/if}

    {#if loading}
      <div class="loading" role="status"><div class="spinner"></div><p>Loading profiles...</p></div>
    {:else}
      <div class="profile-list" role="list" aria-label="Widget profiles">
        {#each profiles as p (p.id)}
          <article class="profile-card" role="listitem" aria-label={`Widget profile ${p.name}`}>
            <div class="profile-head">
              <div class="profile-title">
                <h2>{p.name}</h2>
                {#if p.isHouse}<span class="badge badge-house" title="Permanent internal profile on siftersearch.com">house</span>{/if}
                <span class="badge">{p.tier}</span>
              </div>
              <div class="profile-actions">
                <button class="btn-secondary btn-small" onclick={() => showAnalytics(p)} aria-label={`Show analytics for ${p.name}`}>Analytics</button>
                <a class="btn-secondary btn-small" href={demoUrl(p)} target="_blank" rel="noopener" aria-label={`Open live demo for ${p.name}`}>Demo</a>
                <button class="btn-secondary btn-small" onclick={() => openEdit(p)} aria-label={`Edit ${p.name}`}>Edit</button>
                {#if !p.isHouse}
                  <button class="btn-danger btn-small" onclick={() => deleteProfile(p)} aria-label={`Delete ${p.name}`}>Delete</button>
                {/if}
              </div>
            </div>
            <dl class="profile-meta">
              <div><dt>Domains</dt><dd>{p.domains.length ? p.domains.join(', ') : '—'}</dd></div>
              <div><dt>30-day</dt><dd>{p.stats.messages} messages · {p.stats.sessions} sessions · last {formatTs(p.stats.lastTs)}</dd></div>
              <div class="embed-row">
                <dt>Embed</dt>
                <dd>
                  <code class="embed-code">{p.embed}</code>
                  <button class="btn-secondary btn-small" onclick={() => copyEmbed(p)} aria-label={`Copy embed snippet for ${p.name}`}>Copy</button>
                </dd>
              </div>
            </dl>
          </article>
        {/each}
      </div>

      {#if analytics}
        <section class="analytics-card" aria-label={`Analytics for ${analytics.profile.name}`}>
          <div class="analytics-head">
            <h2>Analytics — {analytics.profile.name}</h2>
            <div class="analytics-controls">
              {#each [7, 30, 90] as d}
                <button
                  class="btn-secondary btn-small"
                  class:range-active={analyticsDays === d}
                  onclick={() => showAnalytics(analytics.profile, d)}
                  aria-label={`Show last ${d} days`}
                  aria-pressed={analyticsDays === d}
                >{d}d</button>
              {/each}
              <button class="btn-secondary btn-small" onclick={() => { analytics = null; }} aria-label="Close analytics">Close</button>
            </div>
          </div>

          {#if analyticsLoading}
            <div class="loading" role="status"><div class="spinner"></div></div>
          {:else}
            <div class="totals-grid">
              <div class="total"><span class="total-num">{analytics.totals.loads}</span><span class="total-label">loads</span></div>
              <div class="total"><span class="total-num">{analytics.totals.opens}</span><span class="total-label">opens</span></div>
              <div class="total"><span class="total-num">{analytics.totals.messages}</span><span class="total-label">messages</span></div>
              <div class="total"><span class="total-num">{analytics.totals.answers}</span><span class="total-label">answers</span></div>
              <div class="total"><span class="total-num">{analytics.totals.sessions}</span><span class="total-label">sessions</span></div>
              <div class="total"><span class="total-num">{analytics.totals.avgLatencyMs ? `${(analytics.totals.avgLatencyMs / 1000).toFixed(1)}s` : '—'}</span><span class="total-label">avg answer</span></div>
            </div>

            {#if analytics.daily.length}
              <div class="daily-chart" role="img" aria-label="Messages per day">
                {#each analytics.daily as d}
                  <div class="daily-col" title={`${d.day}: ${d.messages} messages, ${d.sessions} sessions`}>
                    <div class="daily-bar" style:height={`${Math.round((d.messages / maxDaily) * 100)}%`}></div>
                    <span class="daily-label">{d.day.slice(5)}</span>
                  </div>
                {/each}
              </div>
            {/if}

            {#if analytics.recentQuestions.length}
              <h3>Recent questions</h3>
              <ul class="question-list" aria-label="Recent visitor questions">
                {#each analytics.recentQuestions as q}
                  <li><span class="q-text">{q.q}</span><span class="q-time">{q.at}</span></li>
                {/each}
              </ul>
            {:else}
              <p class="empty-note">No visitor questions in this window.</p>
            {/if}
          {/if}
        </section>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .widget-manager { max-width: 1200px; }

  .access-denied { text-align: center; padding: 3rem 1rem; }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .page-header h1 { margin: 0; font-size: 1.75rem; color: var(--text-primary); }
  .subtitle { margin: 0.5rem 0 0; color: var(--text-secondary); }

  .loading { text-align: center; padding: 2rem; }
  .spinner {
    width: 40px; height: 40px;
    border: 3px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .error-message {
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--error) 15%, transparent);
    color: var(--error);
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }
  .notice-message {
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }

  .editor-card, .analytics-card {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
  }
  .editor-card h2, .analytics-card h2 { margin: 0 0 1rem; font-size: 1.125rem; color: var(--text-primary); }

  .editor-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 0.875rem 1.25rem;
  }
  .editor-grid label {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
  .hint { font-size: 0.75rem; color: var(--text-muted); }
  .editor-grid input[type="text"], .editor-grid select {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  .accent-row { display: flex; align-items: center; gap: 0.5rem; }
  .accent-row input[type="color"] {
    width: 3rem; height: 2rem; padding: 0;
    border: 1px solid var(--border-default);
    border-radius: 0.375rem;
    background: var(--surface-0);
    cursor: pointer;
  }
  .accent-row code { font-size: 0.8125rem; color: var(--text-secondary); }
  .editor-actions { display: flex; gap: 0.75rem; margin-top: 1.25rem; }

  .profile-list { display: flex; flex-direction: column; gap: 1rem; }
  .profile-card {
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }
  .profile-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 0.875rem;
  }
  .profile-title { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .profile-title h2 { margin: 0; font-size: 1.125rem; color: var(--text-primary); }
  .badge {
    padding: 0.125rem 0.5rem;
    background: var(--surface-2);
    color: var(--text-secondary);
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }
  .badge-house { background: var(--accent-primary); color: white; }
  .profile-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

  .profile-meta { margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .profile-meta > div { display: flex; gap: 0.75rem; align-items: baseline; }
  .profile-meta dt {
    flex-shrink: 0;
    width: 4.5rem;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .profile-meta dd { margin: 0; font-size: 0.875rem; color: var(--text-secondary); }
  .embed-row dd { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; min-width: 0; }
  .embed-code {
    font-size: 0.75rem;
    background: var(--surface-2);
    padding: 0.375rem 0.5rem;
    border-radius: 0.375rem;
    color: var(--text-primary);
    word-break: break-all;
  }

  .analytics-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .analytics-controls { display: flex; gap: 0.5rem; }
  .range-active { border-color: var(--accent-primary); color: var(--accent-primary); }

  .totals-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 0.75rem;
    margin: 1rem 0;
  }
  .total {
    background: var(--surface-2);
    border-radius: 0.5rem;
    padding: 0.75rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .total-num { font-size: 1.25rem; font-weight: 600; color: var(--text-primary); }
  .total-label { font-size: 0.75rem; color: var(--text-muted); }

  .daily-chart {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 120px;
    padding: 0.5rem 0 1.5rem;
    overflow-x: auto;
  }
  .daily-col {
    flex: 1;
    min-width: 14px;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    position: relative;
  }
  .daily-bar {
    width: 100%;
    min-height: 2px;
    background: var(--accent-primary);
    border-radius: 2px 2px 0 0;
  }
  .daily-label {
    position: absolute;
    bottom: -1.25rem;
    font-size: 0.625rem;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .analytics-card h3 { margin: 1rem 0 0.5rem; font-size: 0.9375rem; color: var(--text-primary); }
  .question-list {
    margin: 0; padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  .question-list li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-subtle, var(--border-default));
    font-size: 0.875rem;
  }
  .question-list li:last-child { border-bottom: none; }
  .q-text { color: var(--text-primary); }
  .q-time { color: var(--text-muted); font-size: 0.75rem; flex-shrink: 0; }
  .empty-note { color: var(--text-muted); font-size: 0.875rem; }

  .btn-primary, .btn-secondary, .btn-danger {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }
  .btn-small { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
  .btn-primary { background: var(--accent-primary); color: white; }
  .btn-secondary { background: var(--surface-2); color: var(--text-primary); border: 1px solid var(--border-default); }
  .btn-danger { background: var(--error); color: white; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }

  @media (max-width: 768px) {
    .profile-meta dt { width: auto; }
    .profile-meta > div { flex-direction: column; gap: 0.25rem; }
  }
</style>
