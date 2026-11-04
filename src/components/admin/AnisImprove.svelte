<script>
  // Live improvement report (Chad 11-04): pipeline + spend tiles, solutions (ranked, status buttons with a note), the deep
  // analyses' conclusions, and the weak audits — refreshed every 30 s while on screen; a failed fetch keeps the view.
  // Deps: admin.getAnisImproveReport / setAnisImprovementStatus (GET /api/admin/anis/improve-report), liveRefresh.
  import { admin } from '../../lib/api.js';
  import { liveRefresh } from '../../lib/live-data.js';

  const STAGES = ['STRATEGY', 'RETRIEVAL', 'RANK', 'SELECTION', 'WRITER', 'LATENCY', 'HOLDINGS'];
  const TARGET_LABEL = { code: 'Code (Claude Code applies)', data: 'Data (live loop may apply)' };
  let data = $state(null), error = $state(null), root = $state(null);
  let days = $state(7), stage = $state(''), kind = $state(''), status = $state('open'), target = $state('');
  let open = $state({}), notes = $state({}), busy = $state({});

  const params = () => ({ days, stage, kind, status, target, limit: 100 });
  const load = () => admin.getAnisImproveReport(params());
  const refresh = () => load().then((d) => { data = d; error = null; }).catch((e) => { error = e.message; });
  $effect(() => { if (!root) return; return liveRefresh(load, (d) => { data = d; error = null; }, { every: 30_000, el: root, idle: false }); });
  let first = true;
  $effect(() => { params(); if (first) { first = false; return; } refresh(); });   // a filter change reloads now

  const usd = (n) => (n == null ? '–' : `$${Number(n).toFixed(2)}`);
  const pct = (n) => (n == null ? '–' : `${Math.round(n * 100)}%`);
  const when = (s) => (s ? String(s).slice(5, 16) : '');

  async function setStatus(s, next) {
    busy = { ...busy, [s.id]: next };
    try {
      await admin.setAnisImprovementStatus(s.id, next, notes[s.id] || null);
      data = { ...data, solutions: data.solutions.map((x) => (x.id === s.id ? { ...x, status: next, status_note: notes[s.id] || x.status_note } : x)) };
      setTimeout(refresh, 1500);
    } catch (e) { error = e.message; } finally { busy = { ...busy, [s.id]: null }; }
  }
  const ACTIONS = [['accepted', 'Accept — queue the fix'], ['done', 'Mark fixed'], ['rejected', 'Reject — not worth doing']];
  const tiles = $derived(data ? [
    ['Items', data.pipeline.total.items, `${days} days`],
    ['Judged', data.pipeline.total.judged, `${data.pipeline.total.judged_last_hour} in the last hour`],
    ['Weak', data.pipeline.total.weak, `rate ${pct(data.pipeline.total.weak_rate)}`],
    ['Deep analyses', data.pipeline.total.deep_done, `${data.pipeline.total.deep_last_hour} in the last hour`],
    ['Backlog', data.pipeline.total.judge_pending + data.pipeline.total.deep_pending, `${data.pipeline.total.judge_pending} to judge · ${data.pipeline.total.deep_pending} to analyse${data.pipeline.total.stuck ? ` · ${data.pipeline.total.stuck} stuck` : ''}`],
    ['Spend today', usd(data.spend.today_usd), data.spend.cap_usd != null ? `of ${usd(data.spend.cap_usd)} cap${data.spend.blocking ? ' · BLOCKING' : ''}` : 'no cap read'],
    [`Spend ${days} d`, usd(data.spend.window_usd), 'judge + deep'],
  ] : []);
  const sel = 'rounded-lg border border-border bg-surface-1 px-2 py-1 text-sm text-primary';
</script>

<div class="max-w-6xl" bind:this={root}>
  <div class="flex flex-wrap items-center gap-2">
    <label class="text-sm text-secondary">Window <select class={sel} bind:value={days}>{#each [1, 7, 30, 90] as d}<option value={d}>{d} d</option>{/each}</select></label>
    <label class="text-sm text-secondary">Stage <select class={sel} bind:value={stage}><option value="">all</option>{#each STAGES as s}<option value={s}>{s}</option>{/each}</select></label>
    <label class="text-sm text-secondary">Kind <select class={sel} bind:value={kind}><option value="">all</option><option value="reply">replies</option><option value="search">searches</option></select></label>
    <label class="text-sm text-secondary">Target <select class={sel} bind:value={target}><option value="">all</option><option value="code">{TARGET_LABEL.code}</option><option value="data">{TARGET_LABEL.data}</option></select></label>
    <label class="text-sm text-secondary">Solutions <select class={sel} bind:value={status}><option value="">any status</option>{#each ['open', 'accepted', 'done', 'rejected'] as s}<option value={s}>{s}</option>{/each}</select></label>
    {#if data}<span class="text-xs text-muted">updated {when(data.generated_at.replace('T', ' '))} · refreshes every 30 s</span>{/if}
  </div>
  {#if error}<p class="mt-2 text-sm text-error">{error}{data ? ' — showing the last good report' : ''}</p>{/if}

  {#if data}
    {#if !data.available}<p class="mt-4 text-muted">The improvement store does not exist yet (the improve worker creates it).</p>{/if}
    <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {#each tiles as [label, value, sub] (label)}
        <div class="rounded-xl border border-border-subtle bg-surface-1 p-3">
          <div class="text-xs text-muted">{label}</div>
          <div class="text-xl font-semibold text-primary">{value}</div>
          <div class="text-xs text-secondary">{sub}</div>
        </div>
      {/each}
    </div>

    <h2 class="mt-8 text-lg font-semibold text-primary">Solutions <span class="text-sm font-normal text-muted">ranked evidence × severity · {data.solutions.length}</span></h2>
    {#if !data.solutions.length}<p class="text-muted">None for these filters.</p>{/if}
    {#each data.solutions as s (s.id)}
      <section class="mt-2 rounded-xl border border-border-subtle bg-surface-1 p-3">
        <div class="flex flex-wrap items-baseline gap-x-3 text-sm">
          <span class="font-semibold text-primary">#{s.id}</span>
          <span class="text-accent">score {s.score}</span>
          <span class="text-secondary">{s.stage} · {s.target}{s.target_inferred ? ' (inferred)' : ''} · {s.target_class}</span>
          <span class="text-muted">{s.file || ''}{s.fn ? ` · ${s.fn}` : ''}</span>
          <span class="ml-auto text-muted">{s.status}{s.reviewed_by ? ` by ${s.reviewed_by}` : ''} · evidence {s.evidence_n} × sev {s.severity}</span>
        </div>
        <p class="mt-1 text-primary">{s.change}</p>
        {#if s.expected_effect}<p class="text-sm text-secondary">→ {s.expected_effect}</p>{/if}
        {#if s.status_note}<p class="text-sm text-muted">Note: {s.status_note}</p>{/if}
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <input class="{sel} min-w-[16rem] flex-1" placeholder="Note (what was done, or why not)" bind:value={notes[s.id]} />
          {#each ACTIONS as [next, label] (next)}
            <button class="rounded-lg border border-border px-3 py-1 text-sm {next === 'accepted' ? 'bg-accent text-white' : 'text-secondary'} disabled:opacity-50"
              disabled={!!busy[s.id] || s.status === next} onclick={() => setStatus(s, next)}>{busy[s.id] === next ? '…' : label}</button>
          {/each}
          <button class="text-sm text-accent hover:text-accent-hover" onclick={() => (open = { ...open, [s.id]: !open[s.id] })}>{open[s.id] ? 'Hide' : 'Show'} evidence ({s.evidence_audits.length})</button>
        </div>
        {#if open[s.id]}
          <ul class="mt-2 space-y-1 text-sm">
            {#each s.evidence_audits as e (e.item_key)}
              <li class="text-secondary">
                {#if e.missing}<span class="text-muted">{e.item_key} (no longer in the store)</span>
                {:else}
                  <span class="text-primary">{e.question || e.item_key}</span> — {e.why || ''}
                  {#if e.links.trace}<a class="text-accent hover:text-accent-hover" href={e.links.trace} target="_blank" rel="noopener"> trace</a>{/if}
                  {#if e.links.thread}<a class="text-accent hover:text-accent-hover" href={e.links.thread}> thread</a>{/if}
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}

    <h2 class="mt-8 text-lg font-semibold text-primary">Conclusions <span class="text-sm font-normal text-muted">deep analyses · {data.conclusions.length}</span></h2>
    {#if !data.conclusions.length}<p class="text-muted">No deep analyses yet.</p>{/if}
    {#each data.conclusions as c (c.item_key)}
      <section class="mt-2 rounded-xl border border-border-subtle bg-surface-1 p-3 text-sm">
        <div class="flex flex-wrap gap-x-3"><span class="text-primary">{c.question || c.item_key}</span><span class="text-muted">{c.kind} · {when(c.deep_at)}</span>
          {#if c.links.thread}<a class="text-accent hover:text-accent-hover" href={c.links.thread}>thread</a>{/if}</div>
        {#if c.recorded}
          <p class="mt-1 text-primary">{c.diagnosis}</p>
          {#if c.root_cause}<p class="text-secondary">Root cause: {c.root_cause}</p>{/if}
        {:else}
          <p class="mt-1 text-muted">Analysed before conclusions were kept. Judge: {c.judge_why || '–'}</p>
        {/if}
        {#if c.improvement_ids.length}<p class="text-muted">Fixes: {c.improvement_ids.map((i) => `#${i}`).join(' ')}</p>{/if}
      </section>
    {/each}

    <h2 class="mt-8 text-lg font-semibold text-primary">Audits <span class="text-sm font-normal text-muted">weak verdicts · {data.audits.length}</span></h2>
    {#if !data.audits.length}<p class="text-muted">No weak verdicts for these filters.</p>{/if}
    {#each data.audits as a (a.item_key)}
      <section class="mt-2 rounded-xl border border-border-subtle bg-surface-1 p-3 text-sm">
        <div class="flex flex-wrap gap-x-3">
          <span class="text-primary">{a.question || a.item_key}</span>
          <span class="text-warning">{a.stage || '?'}{a.severity ? ` · sev ${a.severity}` : ''}</span>
          <span class="text-muted">{a.kind} · {a.route || ''} · {when(a.judged_at)} · {usd(a.usd)} · deep {a.deep_state}</span>
        </div>
        <p class="mt-1 text-secondary">{a.why}</p>
        {#if a.classes.length}<p class="text-muted">{a.classes.join(' · ')}</p>{/if}
        <p class="mt-1 flex flex-wrap gap-3">
          {#if a.links.trace}<a class="text-accent hover:text-accent-hover" href={a.links.trace} target="_blank" rel="noopener">turn trace</a>{/if}
          {#if a.links.thread}<a class="text-accent hover:text-accent-hover" href={a.links.thread}>thread</a>{/if}
          {#if a.improvement_ids.length}<span class="text-muted">supports {a.improvement_ids.map((i) => `#${i}`).join(' ')}</span>{/if}
        </p>
      </section>
    {/each}
  {:else if !error}<p class="mt-4 text-muted">Loading…</p>{/if}
</div>
