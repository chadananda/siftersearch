<script>
  // Anís improvement progress (Chad 11-04 v2) — a status report, read-only: is Anís getting better (status sentence, 7-day score,
  // 30-day sparkline, spend), the loop's flow, what changed (strategy promotions, code behaviours done), testing now, and the
  // acceptance scenarios waiting for Claude Code. No buttons: the system settles data changes, Claude Code settles code ones.
  // Deps: admin.getAnisImproveOverview (GET /api/admin/anis/improve-overview), liveRefresh (30 s; a failed fetch keeps the view).
  import { admin } from '../../lib/api.js';
  import { liveRefresh } from '../../lib/live-data.js';

  let data = $state(null), root = $state(null), failed = $state(false);
  $effect(() => {
    if (!root) return;
    return liveRefresh(() => admin.getAnisImproveOverview().then((d) => { failed = false; return d; }).catch((e) => { failed = true; throw e; }),
      (d) => { data = d; }, { every: 30_000, el: root, idle: false });
  });

  const h = $derived(data?.headline);
  const f = $derived(data?.flow);
  const STATE_CLASS = { improving: 'text-success', steady: 'text-primary', worse: 'text-warning', stalled: 'text-error', idle: 'text-muted' };
  const usd = (n) => (n == null ? '–' : `$${Number(n).toFixed(2)}`);
  const pct = (n) => (n == null ? '–' : `${Math.round(n * 1000) / 10}%`);
  const sign = (n) => (n == null ? '' : `${n > 0 ? '+' : ''}${Math.round(n * 100) / 100}`);
  const when = (s) => (s ? String(s).replace('T', ' ').slice(5, 16) : '');
  const age = (hrs) => (hrs == null ? '' : hrs < 48 ? `${hrs} h` : `${Math.round(hrs / 24)} days`);

  // big number: the 7-day score where there is one, else the weak rate (lower is better)
  const big = $derived(!h ? null : h.score_7d != null
    ? { value: h.score_7d.toFixed(1), label: 'mean judge score, last 7 days (0–10)', delta: h.score_prev_7d != null ? h.score_7d - h.score_prev_7d : null, good: (d) => d >= 0 }
    : { value: pct(h.weak_rate_7d), label: 'weak answers, last 7 days', delta: h.weak_rate_7d != null && h.weak_rate_prev_7d != null ? (h.weak_rate_7d - h.weak_rate_prev_7d) * 100 : null, good: (d) => d <= 0, unit: ' pts' });

  // 30-day sparkline: weak rate (scaled to its own max) and the score line (0–10) where days have one
  const W = 300, H = 48;
  const line = (vals, max) => {
    const pts = vals.map((v, i) => (v == null ? null : `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - 2 - (v / (max || 1)) * (H - 4)).toFixed(1)}`));
    const segs = []; let cur = [];
    for (const p of pts) { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }
    if (cur.length) segs.push(cur);
    return segs.map((s) => (s.length === 1 ? [s[0], s[0]] : s).join(' '));
  };
  const weakLines = $derived(h ? line(h.daily.map((d) => d.weak_rate), Math.max(0.05, ...h.daily.map((d) => d.weak_rate ?? 0))) : []);
  const scoreLines = $derived(h ? line(h.daily.map((d) => d.score), 10) : []);
  const hasScore = $derived(!!h?.daily.some((d) => d.score != null));
  const spendPct = $derived(data?.spend?.cap_usd ? Math.min(100, (100 * (data.spend.today_usd || 0)) / data.spend.cap_usd) : null);
  const VERDICT_CLASS = { promoted: 'text-success', 'kept current': 'text-muted', 'rolled back': 'text-warning' };
</script>

{#snippet scenario(s)}
  <div class="mt-3 first:mt-0">
    <p class="text-sm font-medium text-primary">{s.title}</p>
    <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
      <dt class="text-muted">Given</dt><dd class="text-secondary">{s.given.reader}{#each s.given.history || [] as x}<span class="block text-muted">earlier: {x}</span>{/each}</dd>
      <dt class="text-muted">When</dt><dd class="text-secondary">{s.when.asks}{#each s.when.examples as e}<span class="block text-muted">e.g. “{e}”</span>{/each}</dd>
      <dt class="text-muted">Then</dt><dd class="text-secondary">{#each s.then as c}<span class="block"><code class="text-xs text-accent">{c.check}</code> {c.expect}</span>{/each}</dd>
    </dl>
  </div>
{/snippet}

<div class="max-w-4xl" bind:this={root}>
  {#if !data}
    <p class="text-muted">{failed ? 'The progress report could not be loaded; retrying every 30 s.' : 'Loading the progress report…'}</p>
  {:else}
    {#if !data.available}<p class="text-muted">The improvement store does not exist yet (the improve worker creates it).</p>{/if}

    <!-- 1 · headline band -->
    <section class="rounded-xl border border-border bg-surface-1 p-4">
      <p class="text-base {STATE_CLASS[h.status.state] || 'text-primary'}">{h.status.sentence}</p>
      <div class="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <div class="flex items-baseline gap-2">
            <span class="text-4xl font-semibold text-primary">{big.value}</span>
            {#if big.delta != null}<span class="text-sm {big.good(big.delta) ? 'text-success' : 'text-warning'}">{sign(big.delta)}{big.unit || ''} vs the week before</span>{/if}
          </div>
          <p class="text-xs text-muted">{big.label}</p>
        </div>
        <figure class="min-w-0 flex-1 basis-56">
          <svg viewBox="0 0 {W} {H}" class="h-12 w-full" preserveAspectRatio="none" role="img" aria-label="30 days: weak rate{hasScore ? ' and judge score' : ''}">
            {#each weakLines as p}<polyline points={p} fill="none" stroke="currentColor" stroke-width="1.5" class="text-warning" vector-effect="non-scaling-stroke" />{/each}
            {#each scoreLines as p}<polyline points={p} fill="none" stroke="currentColor" stroke-width="2" class="text-accent" vector-effect="non-scaling-stroke" />{/each}
          </svg>
          <figcaption class="text-xs text-muted">30 days · <span class="text-warning">weak rate</span>{#if hasScore} · <span class="text-accent">score</span>{/if}</figcaption>
        </figure>
      </div>
      <div class="mt-3">
        {#if spendPct != null}<div class="h-1 w-full overflow-hidden rounded bg-surface-3"><div class="h-full rounded {data.spend.blocking ? 'bg-error' : 'bg-accent'}" style="width: {spendPct}%"></div></div>{/if}
        <p class="mt-1 text-xs text-muted">improve spend today {usd(data.spend.today_usd)}{data.spend.cap_usd != null ? ` of ${usd(data.spend.cap_usd)} cap` : ''}{data.spend.blocking ? ' · cap reached' : ''} · updated {when(data.generated_at)}{failed ? ' · last refresh failed, showing the previous report' : ''}</p>
      </div>
    </section>

    <!-- 2 · the loop -->
    <h2 class="mt-8 text-lg font-semibold text-primary">The loop, last 7 days</h2>
    <p class="flex flex-wrap gap-x-2 text-sm text-secondary">
      <span><b class="text-primary">{f.judged}</b> judged</span><span class="text-muted">→</span>
      <span><b class="text-primary">{f.weak}</b> weak</span><span class="text-muted">→</span>
      <span><b class="text-primary">{f.diagnosed}</b> diagnosed</span>
    </p>
    <div class="mt-2 grid gap-2 sm:grid-cols-2">
      <div class="rounded-lg border border-border-subtle bg-surface-1 p-3 text-sm">
        <p class="font-medium text-primary">Strategy changes <span class="font-normal text-muted">(the system tests these)</span></p>
        <p class="flex flex-wrap gap-x-3 text-secondary"><span>tested {f.data.tested}</span><span>promoted {f.data.promoted}</span><span>kept current {f.data.rejected}</span><span>testing now {f.data.testing_now}</span></p>
        <p class="text-xs text-muted">{f.data.suggested} suggested by diagnoses · {f.gaps.open} open gaps · {f.gaps.designed} new designs</p>
      </div>
      <div class="rounded-lg border border-border-subtle bg-surface-1 p-3 text-sm">
        <p class="font-medium text-primary">Code behaviours <span class="font-normal text-muted">(Claude Code builds these)</span></p>
        <p class="flex flex-wrap gap-x-3 text-secondary"><span>open {f.code.open}</span><span>done {f.code.done}</span>{#if f.code.rejected}<span>declined {f.code.rejected}</span>{/if}</p>
        <p class="text-xs text-muted">{f.code.suggested} new this week{f.code.oldest_open_hours != null ? ` · oldest open ${age(f.code.oldest_open_hours)}` : ''}</p>
      </div>
    </div>

    <!-- 3 · what changed -->
    <h2 class="mt-8 text-lg font-semibold text-primary">What changed</h2>
    {#if !data.changes.length}
      <p class="text-sm text-muted">Nothing promoted or built yet.</p>
    {:else}
      <ol class="border-l border-border pl-4">
        {#each data.changes as c, i (`${c.kind}:${c.at}:${c.strategy || c.id}:${i}`)}
          <li class="relative py-2">
            <span class="absolute -left-[1.3rem] top-3.5 h-2 w-2 rounded-full {c.kind === 'code' ? 'bg-info' : c.verdict === 'promoted' ? 'bg-success' : 'bg-surface-3'}"></span>
            <p class="text-xs text-muted">{when(c.at)} · {c.kind === 'code' ? 'code' : 'strategy'}</p>
            {#if c.kind === 'strategy'}
              <p class="text-sm text-primary">
                <code>{c.strategy}</code>{c.from_version != null ? `@v${c.from_version} → v${c.version}` : `@v${c.version}`}
                · <span class={VERDICT_CLASS[c.verdict] || ''}>{c.verdict === 'kept current' ? 'tried, kept current' : c.verdict}</span>
                {#if c.before != null && c.after != null} · score {c.before} → {c.after}{c.n ? ` on ${c.n} questions` : ''}{/if}
              </p>
              {#if c.change}<p class="text-sm text-secondary">{c.change}</p>{/if}
              {#if c.reason}<p class="text-xs text-muted">{c.reason}</p>{/if}
            {:else}
              <p class="text-sm text-primary">{c.scenarios?.[0]?.title || c.change} · <span class="text-success">done</span></p>
              {#if c.note}<p class="text-xs text-muted">{c.note}{c.by ? ` · ${c.by}` : ''}</p>{/if}
            {/if}
          </li>
        {/each}
      </ol>
    {/if}

    <!-- 4 · testing now -->
    {#if data.testing.length}
      <h2 class="mt-8 text-lg font-semibold text-primary">Testing now</h2>
      <ul class="space-y-1 text-sm">
        {#each data.testing as t (`${t.strategy}@${t.version}`)}
          <li class="text-secondary"><code class="text-primary">{t.strategy}@v{t.version}</code>{t.change ? ` · ${t.change}` : ''}{t.since ? ` · since ${when(t.since)}` : ''}</li>
        {/each}
      </ul>
    {/if}

    <!-- 5 · waiting for Claude Code -->
    <h2 class="mt-8 text-lg font-semibold text-primary">Waiting for Claude Code</h2>
    {#if !data.waiting.length}
      <p class="text-sm text-muted">No code behaviour is waiting.</p>
    {:else}
      <div class="space-y-3">
        {#each data.waiting as w (w.id)}
          <article class="rounded-lg border border-border bg-surface-1 p-3">
            <p class="flex flex-wrap gap-x-2 text-xs text-muted">
              <span>#{w.id}</span><span>{w.target}</span><span>{w.stage}</span><span>seen {w.evidence_n}×</span><span>open {age(w.age_hours)}</span>
              {#if w.age_hours != null && w.age_hours > 48}<span class="text-warning">not yet checked</span>{/if}
            </p>
            {#if w.scenarios.length}
              <div class="mt-2">{#each w.scenarios as s}{@render scenario(s)}{/each}</div>
              <p class="mt-2 text-xs text-muted">proposal: {w.change}</p>
            {:else}
              <p class="mt-1 text-sm text-secondary">{w.change}</p>
            {/if}
            {#if w.examples.length}
              <details class="mt-2 text-xs">
                <summary class="cursor-pointer text-accent">evidence</summary>
                <ul class="mt-1 space-y-0.5">
                  {#each w.examples as e, i}
                    <li>{#if e.trace}<a class="text-accent hover:text-accent-hover" href={e.trace} target="_blank" rel="noopener">trace {i + 1}</a>{/if}{#if e.thread} · <a class="text-accent hover:text-accent-hover" href={e.thread}>thread</a>{/if}</li>
                  {/each}
                </ul>
              </details>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  {/if}
</div>
