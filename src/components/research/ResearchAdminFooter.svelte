<script>
  import { onMount } from 'svelte';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';

  const { researchId } = $props();

  const auth = getAuthState();
  let data = $state(null);
  let loading = $state(true);

  const API_BASE = import.meta.env.PUBLIC_API_URL || 'https://api.siftersearch.com';

  onMount(async () => {
    await initAuth();
    if (!auth.isAuthenticated || auth.user?.tier !== 'admin') { loading = false; return; }

    try {
      const res = await fetch(`${API_BASE}/api/v1/deep-research/id/${researchId}`, {
        headers: auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}
      });
      if (res.ok) {
        const record = await res.json();
        const assessment = record.assessment_json
          ? (typeof record.assessment_json === 'string' ? JSON.parse(record.assessment_json) : record.assessment_json)
          : null;
        const genMinutes = (record.started_at && record.completed_at)
          ? Math.round((new Date(record.completed_at) - new Date(record.started_at)) / 60000)
          : null;
        const costUsd = record.llm_cost_usd > 0 ? record.llm_cost_usd : null;
        const breakdown = record.cost_breakdown_json
          ? (typeof record.cost_breakdown_json === 'string' ? JSON.parse(record.cost_breakdown_json) : record.cost_breakdown_json)
          : null;

        if (assessment || genMinutes || costUsd) {
          data = { assessment, genMinutes, costUsd, breakdown, record };
        }
      }
    } catch { /* non-fatal */ }
    loading = false;
  });

  function gradeClass(g) {
    return g === 'A' ? 'grade-a' : g === 'B+' ? 'grade-bplus' : g === 'B' ? 'grade-b' : g === 'C+' ? 'grade-cplus' : g === 'C' ? 'grade-c' : 'grade-d';
  }
</script>

{#if !loading && data}
  <div class="admin-footer">
    <div class="admin-badge">Admin</div>

    {#if data.assessment}
      {@const a = data.assessment}
      <div class="assessment-block">
        <div class="assessment-header">
          <span class="label">Research Quality</span>
          <span class="grade {gradeClass(a.grade)}">{a.grade || '—'}</span>
          <span class="score">{a.overall || '—'}/10</span>
        </div>

        {#if a.assessment}
          <p class="assessment-text">{a.assessment}</p>
        {/if}

        <div class="score-rows">
          {#each Object.entries(a.scores || {}) as [key, val]}
            <div class="score-row">
              <span class="score-label">{key.replace(/_/g, ' ')}</span>
              <div class="score-bar"><div class="score-fill" style="width:{(val/10)*100}%"></div></div>
              <span class="score-val">{val}/10</span>
            </div>
          {/each}
        </div>

        {#if a.gaps?.length}
          <details class="gaps">
            <summary>Gaps ({a.gaps.length})</summary>
            <ul>{#each a.gaps as g}<li>{g}</li>{/each}</ul>
          </details>
        {/if}
      </div>
    {/if}

    <div class="meta-row">
      {#if data.genMinutes !== null}<span>⏱ {data.genMinutes} min</span>{/if}
      {#if data.costUsd !== null}<span>💰 ${data.costUsd.toFixed(3)}</span>{/if}
      {#if data.record.total_candidates}<span>{data.record.total_candidates} candidates</span>{/if}
      {#if data.record.total_selected}<span>{data.record.total_selected} selected</span>{/if}
    </div>

    {#if data.breakdown}
      <details class="breakdown">
        <summary>Cost by step</summary>
        <table>
          <thead><tr><th>Step</th><th>Calls</th><th>In</th><th>Out</th><th>Cost</th></tr></thead>
          <tbody>
            {#each Object.entries(data.breakdown) as [step, b]}
              <tr>
                <td>{step.replace('deep-research/', '')}</td>
                <td>{b.calls}</td>
                <td>{(b.inputTokens/1000).toFixed(1)}K</td>
                <td>{(b.outputTokens/1000).toFixed(1)}K</td>
                <td>${b.costUsd.toFixed(3)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </details>
    {/if}
  </div>
{/if}

<style>
  .admin-footer {
    position: relative;
    margin-bottom: 1.5rem;
    border: 1px dashed var(--border);
    border-radius: 12px;
    padding: 1.25rem 1.5rem;
    background: color-mix(in srgb, var(--surface-1) 80%, transparent);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .admin-badge {
    position: absolute;
    top: -0.6rem;
    left: 1rem;
    font-size: 0.62rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    background: var(--surface-2);
    color: var(--text-muted);
    padding: 0.1rem 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--border-subtle);
  }
  .assessment-block { display: flex; flex-direction: column; gap: 0.6rem; }
  .assessment-header { display: flex; align-items: center; gap: 0.75rem; }
  .label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
  .grade { font-size: 1.5rem; font-weight: 800; line-height: 1; }
  .grade-a { color: var(--success); }
  .grade-bplus, .grade-b { color: var(--accent); }
  .grade-cplus, .grade-c { color: var(--warning); }
  .grade-d { color: var(--error); }
  .score { font-size: 0.88rem; color: var(--text-muted); }
  .assessment-text { font-size: 0.83rem; color: var(--text-secondary); line-height: 1.6; margin: 0; }
  .score-rows { display: flex; flex-direction: column; gap: 0.35rem; }
  .score-row { display: flex; align-items: center; gap: 0.5rem; }
  .score-label { font-size: 0.7rem; color: var(--text-muted); text-transform: capitalize; width: 9rem; flex-shrink: 0; }
  .score-bar { flex: 1; height: 4px; background: var(--surface-2); border-radius: 2px; overflow: hidden; }
  .score-fill { height: 100%; background: var(--accent); border-radius: 2px; }
  .score-val { font-size: 0.68rem; color: var(--text-muted); width: 2.5rem; text-align: right; flex-shrink: 0; }
  .gaps summary { font-size: 0.75rem; color: var(--text-muted); cursor: pointer; }
  .gaps ul { margin: 0.35rem 0 0; padding-left: 1.2rem; }
  .gaps li { font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.2rem; }
  .meta-row { display: flex; gap: 1.25rem; flex-wrap: wrap; }
  .meta-row span { font-size: 0.72rem; color: var(--text-muted); }
  .breakdown summary { font-size: 0.75rem; color: var(--text-muted); cursor: pointer; }
  .breakdown table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; font-size: 0.72rem; }
  .breakdown th { text-align: left; color: var(--text-muted); padding: 0.2rem 0.5rem 0.2rem 0; font-weight: 600; }
  .breakdown td { color: var(--text-secondary); padding: 0.15rem 0.5rem 0.15rem 0; border-top: 1px solid var(--border-subtle); }
</style>
