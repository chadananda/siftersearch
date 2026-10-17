<script>
  // The Observatory — the home page (Chad 10-16): "a super impressive and dynamic dashboard of facts about the library,
  // constantly moving and updating based on index and testing going on … a powerful machine ingesting and studying the
  // library and gaining capability by the minute … a project we are developing in public." Reads ONLY the public API
  // (/api/observatory/telemetry every 60 s, edge-cached; the terminal polls /activity). Counters advance between
  // snapshots at their measured hourly rate; nothing is invented.
  import { onMount } from 'svelte';
  import { observatory } from '../../lib/api.js';
  import { compact, exact, pct, rate, interpolate, duration, ringOfJob, sparkPath, RING_INFO } from '../../lib/observatory.js';
  import ObservatoryDial from './ObservatoryDial.svelte';
  import ObservatoryTerminal from './ObservatoryTerminal.svelte';

  let tel = $state(null);
  let error = $state(null);
  let now = $state(Date.now());
  let fetchedAt = $state(Date.now());
  let tip = $state(null);
  let pulse = $state(null);   // every 15 s: I/O load per device, CPU, vector counts, writer rows/min (worker → /pulse)

  const snap = $derived(tel?.snapshot || null);
  // last hour's rate, else the last day's: a stage's ledger figure moves in lumps (documents are re-measured in batches),
  // so an hour can read 0 while the day shows steady growth
  const rates = $derived(Object.fromEntries([...new Set([...Object.keys(tel?.rates || {}), ...Object.keys(tel?.rates_24h || {})])]
    .map((k) => [k, (tel?.rates?.[k] || 0) > 0 ? tel.rates[k] : tel?.rates_24h?.[k] || 0])));
  const since = $derived(snap ? Math.max(0, now / 1000 - snap.at) : 0);
  const live = (v, key) => interpolate(v, rates[key], since);
  const ring = (id) => snap?.rings?.find((r) => r.id === id) || null;
  // snapshots taken before the incremental totals were filled read zero for everything — not data, so not drawn
  const series = (key) => (tel?.series || []).filter((p) => p.series?.text > 0).map((p) => p.series?.[key]);

  const KPIS = [
    { label: 'Paragraphs', value: () => snap?.corpus?.paragraphs, key: 'text', hint: 'every paragraph, in 11 traditions' },
    { label: 'Documents', value: () => snap?.corpus?.documents, hint: 'books, tablets, letters, talks' },
    { label: 'Phrase vectors', value: () => pulse?.vectors?.phrases ?? snap?.vectors?.phrases, key: 'v_phrases', hint: 'meaning of every clause', fresh: true },
    { label: 'Keyword terms', value: () => pulse?.vectors?.paragraphs_kw ?? snap?.vectors?.paragraphs_kw, key: 'v_paragraphs_kw', hint: 'BM25 over every paragraph', fresh: true },
    { label: 'Questions', value: () => pulse?.vectors?.hype ?? snap?.vectors?.hype, key: 'v_hype', hint: 'what each paragraph answers', fresh: true },
    { label: 'People', value: () => snap?.counts?.people, key: 'people', hint: 'identified across history' },
    { label: 'Concept claims', value: () => snap?.counts?.concept_claims, key: 'claims', hint: 'proof-checked ideas' },
    { label: 'Sub-documents', value: () => snap?.counts?.sections, key: 'sections', hint: 'chapters, tablets, talks' },
  ];
  const VARIANTS = [
    { id: 'exact10', label: 'Ten exact words', note: 'a quotation looked up' },
    { id: 'words3', label: 'Three remembered words', note: 'what a reader recalls' },
    { id: 'typo3', label: 'Three words, misspelled', note: 'accents dropped, one slip each' },
    { id: 'recall', label: 'Half-remembered', note: 'two words + one synonym' },
  ];
  // live readings the terminal types when no new log lines are waiting (all from telemetry — real numbers)
  const status = $derived.by(() => {
    if (!snap) return [];
    const out = [];
    const v = pulse?.vectors || snap.vectors || {};
    out.push(`vectors · phrases ${exact(v.phrases)} · keyword ${exact(v.paragraphs_kw)} · questions ${exact(v.hype)} · concepts ${exact(v.concepts)}`);
    if (pulse?.writer) out.push(`writer · ${exact(pulse.writer.rows)} rows in the last minute · ${exact(pulse.writer.batches)} batches`);
    const io = pulse?.io || {};
    const busy = (d) => (io[d] ? `${io[d].busy_pct}%` : '—');
    out.push(`io · index NVMe ${busy('nvme0n1')} busy · bulk HDD ${busy('sdc')} · system SSD ${busy('sdb')} · cpu ${pulse?.cpu?.load_pct ?? snap.health?.cpu?.load_pct ?? '—'}% load`);
    out.push(`index · ${snap.rings.filter((r) => !r.planned).map((r) => `${r.short.toLowerCase()} ${pct(r.done, r.total)}`).join(' · ')}`);
    const c = snap.capability?.variants;
    if (c) out.push(`findability · 10 words ${Math.round((c.exact10?.production?.at10 || 0) * 100)}% · 3 words ${Math.round((c.words3?.production?.at10 || 0) * 100)}% · misspelled ${Math.round((c.typo3?.production?.at10 || 0) * 100)}% (top 10)`);
    out.push(`library · ${exact(snap.corpus.paragraphs)} paragraphs · ${exact(snap.corpus.documents)} documents · ${snap.corpus.traditions} traditions · ${exact(snap.counts?.sections)} sub-documents`);
    return out;
  });
  // running/queued jobs: the pulse (15 s) when present, else the snapshot
  const jobs = $derived(pulse?.jobs || (snap?.jobs ? { running: snap.jobs.running, queued: 0 } : null));
  const jobsAt = $derived(pulse?.at ? pulse.at * 1000 : fetchedAt);
  const activeRings = $derived([...new Set((jobs?.running || []).map((j) => ringOfJob(j.name, j.label)).filter(Boolean))]);
  // a stage being built shows four decimals, interpolated between snapshots at its measured rate, so progress visibly
  // moves (Chad 10-16: "like 99.0137% instead of 99.1% which never moves"); idle stages keep one
  const working = (id) => activeRings.includes(id) || (tel?.rates?.[id] || 0) > 0;   // a job on it, or it grew this hour
  const POINTS = { keyword: 'paragraphs_kw', phrase: 'phrases', hype: 'hype', concepts: 'concepts' };
  // the stage being built, tradition by tradition (Chad 10-17: "sub-progress lines for each tradition being worked on …
  // just for the currently processing index"): unfinished traditions, those that grew since the last snapshot first
  // truncated, never rounded up: 13 paragraphs left must not read 100.00%
  const pctDown = (done, total, digits) => `${(Math.floor((100 * done / total) * 10 ** digits) / 10 ** digits).toFixed(digits)}%`;
  // enough decimals that the last digit moves about once a second at this rate (2 when idle, at most 6)
  const tickDigits = (perHour, total) => (perHour > 0 && total ? Math.min(6, Math.max(3, Math.ceil(-Math.log10((100 * perHour) / 3600 / total)))) : 2);
  const TRAD_LABEL = { "Baha'i": 'Bahá’í', Tao: 'Taoist' };
  const tradSlug = (t) => (t === "Baha'i" ? 'bahai' : String(t).toLowerCase());
  const subRows = (ringId) => {
    const grew = new Set((snap?.growing || []).filter((g) => g.ring === ringId).map((g) => g.tradition));
    // a few dozen paragraphs left and not moving is a remainder (lines with nothing to index), not work in progress
    return (snap?.cells || []).filter((c) => c.ring === ringId && c.total && c.total - c.done >= 100 || (snap?.cell_rates?.[`${c.tradition}|${ringId}`] > 0 && c.ring === ringId && c.done < c.total))
      .map((c) => {
        const r = snap?.cell_rates?.[`${c.tradition}|${ringId}`] || 0;
        const done = Math.min(c.total, interpolate(c.done, r, since));   // moves between snapshots at the cell's own rate
        return { ...c, done, rate: r, grew: grew.has(c.tradition) || r > 0, gap: c.total - done };
      })
      .sort((a, b) => b.grew - a.grew || b.gap - a.gap).slice(0, 6);
  };
  const ago = (sec) => (sec < 90 ? `${Math.round(sec)} s ago` : sec < 5400 ? `${Math.round(sec / 60)} min ago` : `${(sec / 3600).toFixed(1)} h ago`);
  const levelOf = (p) => (p == null ? '' : p >= 85 ? 'hot' : p >= 60 ? 'warm' : 'cool');

  async function loadPulse() { try { pulse = (await observatory.pulse()).data; } catch { /* keep the last reading */ } }
  async function load() {
    try { const r = await observatory.telemetry(); tel = r.data; fetchedAt = Date.now(); error = null; }
    catch (err) { error = err.message; }
  }
  // the background's flow converges on the dial's core (Chad 10-16: "the background animation should be at the very
  // center of the graph"): tell LiquidBackground where the core is, on scroll and resize
  let dialEl = $state(null);
  function focusBackground() {
    if (!dialEl) return;
    const r = dialEl.getBoundingClientRect();
    if (!r.width) return;
    const side = Math.min(r.width, r.height || r.width);
    window.dispatchEvent(new CustomEvent('liquid-focus', { detail: { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + side / 2) / window.innerHeight } }));
  }
  onMount(() => {
    load(); loadPulse();
    const poll = setInterval(load, 60000);
    const pulsePoll = setInterval(loadPulse, 15000);
    const tick = setInterval(() => { now = Date.now(); }, 1000);
    const onMove = () => requestAnimationFrame(focusBackground);
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    const settle = setInterval(focusBackground, 1000);   // layout settles as fonts and data arrive
    return () => { clearInterval(poll); clearInterval(pulsePoll); clearInterval(tick); clearInterval(settle); window.removeEventListener('scroll', onMove); window.removeEventListener('resize', onMove); };
  });
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap" />
</svelte:head>

<section class="obs" aria-labelledby="obs-title">
  <!-- masthead -->
  <header class="mast">
    <div class="kicker"><span class="led"></span>OBSERVATORY <span class="sep">/</span> LIVE <span class="sep">/</span>
      <span class="mono">{new Date(now).toISOString().slice(11, 19)} UTC</span>
      {#if snap}<span class="sep">/</span> <span class="mono">snapshot {ago(since)}</span>{/if}
      {#if pulse?.writer?.rows}<span class="proc mono writing"><span class="bolt">⚡</span>{exact(pulse.writer.rows)} rows/min written</span>{/if}
      {#if jobs}
        <span class="procs">
          {#each jobs.running as j (j.id)}<span class="proc mono"><span class="spin"></span>{j.label}<span class="mute">· {duration((j.elapsed_s || 0) + (now - jobsAt) / 1000)}</span></span>{/each}
          {#if jobs.queued}<span class="proc mono">{jobs.queued} queued{jobs.queued_names?.length ? ` · ${jobs.queued_names.join(', ')}` : ''}</span>{/if}
        </span>
      {/if}
    </div>
    <h1 id="obs-title">The world’s largest <em>deeply AI-indexed</em> interfaith library.</h1>
    <p class="lede">{snap ? `${compact(snap.corpus.paragraphs)} paragraphs` : 'Millions of paragraphs'} of sacred and scholarly text, {snap?.corpus?.traditions ?? 11} traditions — searched, questioned and studied by machine, in the open.</p>
  </header>

  {#if error && !snap}<p class="err">Telemetry unavailable right now ({error}). The library itself is unaffected.</p>{/if}

  <div class="grid">
    <!-- left: index state, stage by stage -->
    <aside class="panel stages" aria-label="Index state by stage">
      <h2>Index state <span class="h-sub">stage by stage, centre outward</span></h2>
      {#each snap?.rings || [] as r, i (r.id)}
        {@const p = r.total ? (100 * r.done) / r.total : 0}
        <div class="stage" class:planned={r.planned} class:grow={rates[r.id] > 0}>
          <div class="stage-top"><span class="stage-n mono">{String(i + 1).padStart(2, '0')}</span><span class="stage-name">{RING_INFO[r.id]?.title || r.label}</span></div>
          {#if RING_INFO[r.id]}<div class="stage-sub" title={RING_INFO[r.id].sub}>{RING_INFO[r.id].sub}</div>{/if}
          <div class="bar-row"><div class="bar"><span style={`width:${Math.max(r.done ? 0.6 : 0, Math.min(100, p))}%`}></span></div>
            <span class="stage-pct mono" class:ticking={working(r.id)}>{r.planned ? 'planned' : working(r.id) ? pct(Math.min(r.total, live(r.done, r.id)), r.total, 4) : pct(r.done, r.total)}</span></div>
          <div class="stage-foot mono">
            <span>{compact(live(r.done, r.id))} / {compact(r.total)} {r.id === 'sections' ? 'docs' : '¶'}</span>
            {#if r.core_total && !r.planned}<span class="core-tag">core {pct(r.core_done, r.core_total, 0)}</span>{/if}
            {#if activeRings.includes(r.id)}<span class="working"><i></i>indexing{#if POINTS[r.id] && pulse?.vectors?.[POINTS[r.id]] != null}&nbsp;· {exact(pulse.vectors[POINTS[r.id]])} pts{/if}</span>{:else if !r.planned && r.done < r.total}<span class="idle">idle</span>{/if}
            {#if rates[r.id] > 0}<span class="up">{rate(rates[r.id])}</span>{/if}
            {#if series(r.id).filter((x) => x != null).length > 2}<svg class="spark" viewBox="0 0 80 16" aria-hidden="true"><path d={sparkPath(series(r.id), 80, 16, r.total * 0.002)} /></svg>{/if}
          </div>
          {#if activeRings.includes(r.id)}
            <div class="subs">
              {#each subRows(r.id) as c (c.tradition)}
                <div class="sub mono" class:grew={c.grew} style={`--c: var(--obs-${tradSlug(c.tradition)})`}>
                  <span class="sub-name">{#if c.grew}<i></i>{/if}{TRAD_LABEL[c.tradition] || c.tradition}</span>
                  <span class="sub-bar"><span style={`width:${Math.min(100, (100 * c.done) / c.total)}%`}></span></span>
                  <span class="sub-pct">{pctDown(c.done, c.total, tickDigits(c.rate, c.total))}</span>
                  <span class="sub-left">{compact(c.gap)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </aside>

    <!-- centre: the dial -->
    <div class="dial-wrap" bind:this={dialEl}>
      {#if snap}<ObservatoryDial snapshot={snap} {activeRings} {now} onhover={(t) => (tip = t)} />
      {:else}<div class="dial-skel"><span class="mono">calibrating…</span></div>{/if}
      {#if activeRings.length}<div class="dial-note mono">◉ live: {activeRings.join(' · ')}</div>{/if}
    </div>

    <!-- right: capability + health -->
    <div class="right">
      <ObservatoryTerminal {status} />
      <section class="panel" aria-label="Findability">
        <h2>Findability <span class="h-sub">can it find what a reader remembers?</span></h2>
        {#if snap?.capability?.variants}
          {#each VARIANTS as v (v.id)}
            {@const m = snap.capability.variants[v.id]?.production}
            {#if m}
              <div class="cap">
                <div class="cap-top"><span>{v.label}</span><span class="cap-note">{v.note}</span></div>
                <div class="cap-bars">
                  <div class="cap-bar"><span class="cap-k">first</span><div class="bar"><span class="b1" style={`width:${m.at1 * 100}%`}></span></div><span class="mono">{Math.round(m.at1 * 100)}%</span></div>
                  <div class="cap-bar"><span class="cap-k">top 10</span><div class="bar"><span class="b10" style={`width:${m.at10 * 100}%`}></span></div><span class="mono">{Math.round(m.at10 * 100)}%</span></div>
                </div>
              </div>
            {/if}
          {/each}
          <p class="fine mono">known-item test #{snap.capability.run} · {snap.capability.paragraphs} real paragraphs, doctrinal core sampled 3× · {snap.capability.finished_at?.slice(0, 16).replace('T', ' ')} UTC</p>
        {:else}
          <p class="fine">The first run of the findability test is in progress — watch its probes stream through the terminal below.</p>
        {/if}
      </section>

      <section class="panel" aria-label="System health">
        <h2>System health <span class="h-sub">the machine itself</span></h2>
        {#if snap?.health}
          {@const h = snap.health}
          {#each h.storage.filter((s) => s.size_gb).map((s) => ({ ...s, io: pulse?.io?.[s.dev] || s.io })) as s (s.dev)}
            {@const dr = (h.drives || []).find((d) => d.dev === s.dev)}
            <div class="disk">
              <div class="disk-top"><span>{s.label} <span class="mute mono">{s.mount}</span></span><span class="mono">{s.used_pct}% of {s.size_gb >= 1000 ? `${(s.size_gb / 1000).toFixed(0)} TB` : `${s.size_gb} GB`}</span></div>
              <div class="bar thin"><span style={`width:${s.used_pct}%`}></span></div>
              <div class="iometer" aria-hidden="true"><span class={levelOf(s.io?.busy_pct)} style={`width:${Math.max(2, s.io?.busy_pct ?? 0)}%`}></span></div>
              <div class="disk-io mono">
                <span class={`io ${levelOf(s.io?.busy_pct)}`}>I/O {s.io ? `${s.io.busy_pct}% busy` : '—'}</span>
                {#if s.io}<span class="mute">↓{s.io.read_mb_s} ↑{s.io.write_mb_s} MB/s</span>{/if}
              </div>
              {#if s.note}<div class="disk-note">→ {s.note}</div>{/if}
              {#if dr}
                {@const tbDay = (tel?.rates_24h?.[`wtb_${s.dev}`] ?? tel?.rates?.[`wtb_${s.dev}`] ?? 0) * 24}
                {@const lifeDay = -(tel?.rates_24h?.[`life_${s.dev}`] ?? 0) * 24}
                <div class="smart mono">
                  <span class={dr.healthy ? 'ok' : 'bad'}>{dr.healthy ? 'SMART ok' : 'SMART FAIL'}</span>
                  {#if dr.temp_c != null}<span>{dr.temp_c}°C</span>{/if}
                  {#if dr.life_left_pct != null}<span class={dr.life_left_pct < 30 ? 'bad' : dr.life_left_pct < 60 ? 'warn' : ''}>{dr.life_left_pct}% life left</span>{/if}
                  {#if dr.written_tb != null}<span class="mute">{dr.written_tb} TB written{tbDay > 0.05 ? ` · ${tbDay.toFixed(1)} TB/day` : ''}</span>{/if}
                  {#if lifeDay > 0.01 && dr.life_left_pct != null}<span class="warn">≈{Math.round(dr.life_left_pct / lifeDay)} days at this rate</span>{/if}
                </div>
              {/if}
            </div>
          {/each}
          <div class="vitals mono">
            <div><span class="mute">CPU</span> {h.cpu.cores} cores · load {pulse?.cpu?.load_pct ?? h.cpu.load_pct}%</div>
            <div><span class="mute">RAM</span> {h.memory.total_gb} GB · {h.memory.used_pct}% used</div>
            {#if h.services}<div><span class="mute">Services</span> {h.services.online} online{h.services.errored ? ` · ${h.services.errored} errored` : ''}</div>{/if}
            <div><span class="mute">Vector indexes</span> {#each Object.entries(h.vectors || {}) as [c, st] (c)}<span class={`dot ${st}`} title={`${c}: ${st}`}></span>{/each}</div>
            {#if h.slow_queries_24h}<div><span class="mute">Blocking queries 24 h</span> {h.slow_queries_24h.n} over {h.slow_queries_24h.min_ms / 1000} s</div>{/if}
          </div>
        {:else}<p class="fine">Measuring…</p>{/if}
      </section>
    </div>
  </div>


  <!-- figures -->
  <div class="kpis">
    {#each KPIS as k (k.label)}
      {@const v = k.key ? live(k.value(), k.key) : k.value()}
      <div class="kpi">
        <div class="kpi-label">{k.label}</div>
        {#key k.value()}<div class="kpi-num mono flash">{snap ? exact(v) : '—'}</div>{/key}
        <div class="kpi-foot"><span class="kpi-hint">{k.hint}</span>{#if k.key && rates[k.key] > 0}<span class="kpi-rate mono">{rate(rates[k.key])}</span>{/if}</div>
      </div>
    {/each}
  </div>

  <!-- developed in public -->
  {#if snap?.roadmap}
    <div class="road-wrap"><div class="roadmap">
      {#each ['now', 'next', 'later'] as st (st)}
        <div class="road">
          <h3>{st === 'now' ? 'Building now' : st === 'next' ? 'Next' : 'Later'}</h3>
          {#each snap.roadmap.filter((x) => x.state === st) as x, i (i)}<p>{x.text}</p>{/each}
        </div>
      {/each}
    </div></div>
  {/if}

  {#if tip}
    <div class="tip mono" style={`left:${Math.min(tip.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 1600) - 380)}px; top:${Math.min(tip.y + 14, (typeof window !== 'undefined' ? window.innerHeight : 900) - 230)}px`}>
      <div class="tip-h">{tip.tradition} · {tip.ring}</div>
      {#if tip.sub}<div class="tip-sub">{tip.sub}</div>{/if}
      {#if tip.why}<div class="tip-why">{tip.why}</div>{/if}
      <div>{exact(tip.done)} / {exact(tip.total)} {tip.sections ? 'documents' : 'paragraphs'}</div>
      <div class="tip-p">{pct(tip.done, tip.total)}</div>
    </div>
  {/if}
</section>

<style>
  .obs {
    /* instrument palette — light and dark (the site's theme tokens are the ground) */
    --obs-sans: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
    --obs-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    --obs-text: var(--text-primary); --obs-text-dim: var(--text-secondary); --obs-text-faint: var(--text-muted);
    --obs-line: light-dark(rgba(15, 23, 42, 0.12), rgba(148, 163, 184, 0.16));
    --obs-line-strong: light-dark(rgba(15, 23, 42, 0.3), rgba(148, 163, 184, 0.4));
    --obs-accent: var(--accent-primary);
    --obs-core-hi: light-dark(#ffffff, #10233b); --obs-core-lo: light-dark(#e2ecf6, #070f1c);
    --obs-sweep: light-dark(#0284c7, #38bdf8);
    --obs-phosphor: light-dark(#0369a1, #9fdcf5); --obs-phosphor-hot: light-dark(#075985, #eef9ff);   /* P7: blue-white trace + flash */
    --obs-afterglow: light-dark(#4d7c0f, #b9f06a);                                                   /* P7: yellow-green persistence */
    --obs-bahai: light-dark(#b7791f, #fbbf24); --obs-islam: light-dark(#047857, #34d399); --obs-christian: light-dark(#b91c1c, #f87171);
    --obs-judaism: light-dark(#1d4ed8, #60a5fa); --obs-zoroastrian: light-dark(#c2410c, #fb923c); --obs-hindu: light-dark(#be185d, #f472b6);
    --obs-buddhist: light-dark(#6d28d9, #a78bfa); --obs-jain: light-dark(#0f766e, #2dd4bf); --obs-sikh: light-dark(#4338ca, #818cf8);
    --obs-tao: light-dark(#0e7490, #22d3ee); --obs-confucian: light-dark(#4d7c0f, #a3e635); --obs-other: light-dark(#64748b, #94a3b8);
    --obs-panel: light-dark(rgba(255, 255, 255, 0.46), rgba(14, 22, 40, 0.34));
    /* liquid glass (Chad 10-16: 'a slightly "liquid glass" effect on all elements') */
    --glass-blur: blur(20px) saturate(170%);
    --glass-edge: light-dark(rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.14));
    --glass-rim: light-dark(rgba(15, 23, 42, 0.08), rgba(0, 0, 0, 0.35));
    --glass-shine: light-dark(rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.11));
    --glass-shadow: light-dark(0 18px 40px -22px rgba(15, 23, 42, 0.35), 0 22px 50px -24px rgba(0, 0, 0, 0.7));
    position: relative; max-width: 1680px; margin: 0 auto; padding: 54px 20px 48px; display: flex; flex-direction: column; gap: 12px;
    /* the dial must fit the first screen: viewport height minus navbar (~56) + header (~96) + gaps */
    --obs-chrome: 162px;
    color: var(--obs-text); font-family: var(--obs-sans);
  }
  .mono { font-family: var(--obs-mono); font-variant-numeric: tabular-nums; }
  .mute { color: var(--obs-text-faint); }
  .mast { display: flex; flex-direction: column; gap: 6px; }
  .kicker { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font: 600 11.5px/1 var(--obs-mono); letter-spacing: 0.16em; color: var(--obs-accent); }
  .kicker .sep { color: var(--obs-text-faint); }
  .led { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 10px #22c55e; animation: blink 1.8s ease-in-out infinite; }
  h1 { margin: 0; font: 600 clamp(21px, 2.4vw, 34px)/1.1 var(--obs-sans); letter-spacing: -0.025em; text-wrap: balance; }
  h1 em { font-style: normal; background: linear-gradient(90deg, var(--obs-bahai), var(--obs-islam), var(--obs-judaism), var(--obs-buddhist));
    -webkit-background-clip: text; background-clip: text; color: transparent; }
  .lede { margin: 0; max-width: 100ch; color: var(--obs-text-dim); font-size: 13.5px; line-height: 1.4; }
  .err { color: var(--error); }

  /* ── liquid glass: translucent tint + blur/saturate, a lit top edge, a sheen from the upper left, a soft deep shadow ── */
  .glass, .kpis, .panel, .road-wrap, .proc { position: relative; background: var(--obs-panel); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-edge); box-shadow: inset 0 1px 0 var(--glass-shine), inset 0 -1px 0 var(--glass-rim), var(--glass-shadow); }
  .kpis::before, .panel::before, .road-wrap::before { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    background: radial-gradient(120% 70% at 0% 0%, var(--glass-shine), transparent 55%); opacity: 0.55; }
  .kpis { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); border-radius: 18px; overflow: hidden; }
  .kpi { position: relative; padding: 10px 12px 9px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .kpi + .kpi { border-left: 1px solid var(--obs-line); }
  .kpi-label { font: 600 10.5px/1 var(--obs-sans); letter-spacing: 0.16em; text-transform: uppercase; color: var(--obs-text-dim); }
  .kpi-num { font-size: clamp(17px, 1.6vw, 24px); font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kpi-foot { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; color: var(--obs-text-faint); min-height: 14px; }
  .kpi-hint { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .kpi-rate { color: var(--success); white-space: nowrap; }

  .grid { display: grid; grid-template-columns: minmax(240px, 280px) minmax(0, 1fr) minmax(320px, 420px); grid-template-areas: 'stages dial right'; gap: 16px; align-items: start; }
  .stages { grid-area: stages; } .dial-wrap { grid-area: dial; } .right { grid-area: right; }
  .panel { border-radius: 18px; padding: 13px 14px 12px; display: flex; flex-direction: column; gap: 9px; }
  .panel > * { position: relative; }
  h2 { margin: 0; font: 600 12px/1.2 var(--obs-sans); letter-spacing: 0.16em; text-transform: uppercase; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
  .h-sub { font: 400 11.5px/1.2 var(--obs-sans); letter-spacing: 0; text-transform: none; color: var(--obs-text-faint); }
  .right { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

  .stage { display: flex; flex-direction: column; gap: 3px; }
  .stage-top { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
  .stage-n { color: var(--obs-text-faint); font-size: 11px; }
  /* one line of title, one line of explanation (Chad 10-16) */
  .stage-name { flex: 1; min-width: 0; font-weight: 600; font-size: 12.5px; letter-spacing: -0.005em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stage-sub { font-size: 11px; line-height: 1.25; color: var(--obs-text-dim); margin: -2px 0 1px 26px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stage-pct { font-size: 11.5px; font-weight: 600; min-width: 46px; text-align: right; }
  .bar-row { display: flex; align-items: center; gap: 8px; }
  .bar-row .bar { flex: 1; min-width: 0; }
  .stage.planned { opacity: 0.55; }
  .stage-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 11px; color: var(--obs-text-dim); }
  .core-tag { color: var(--obs-bahai); }
  .up { color: var(--success); }
  /* is anything actually working on this stage right now (a running job), or is it waiting */
  .working { display: inline-flex; align-items: center; gap: 4px; color: var(--obs-afterglow); font-weight: 600; }
  .working i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 6px currentColor; animation: work-blink 1.4s ease-in-out infinite; }
  .idle { color: var(--obs-text-faint); }
  /* per-tradition sub-progress under the stage being built */
  .subs { display: flex; flex-direction: column; gap: 1px; margin: 2px 0; padding-left: 6px; border-left: 1px solid var(--obs-line); }
  .sub { display: grid; grid-template-columns: 62px minmax(20px, 1fr) 66px 40px; align-items: center; gap: 6px; font-size: 10.5px; line-height: 1.5; color: var(--obs-text-dim); white-space: nowrap; }
  .sub-name { display: flex; align-items: center; gap: 4px; color: var(--c); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub-name i { width: 5px; height: 5px; border-radius: 50%; background: var(--obs-afterglow); box-shadow: 0 0 5px var(--obs-afterglow); animation: work-blink 1.4s ease-in-out infinite; flex: none; }
  .sub-bar { height: 3px; border-radius: 2px; background: var(--obs-line); overflow: hidden; }
  .sub-bar span { display: block; height: 100%; background: var(--c); }
  .sub-pct { text-align: right; color: var(--obs-text); font-variant-numeric: tabular-nums; }
  .sub-left { text-align: right; color: var(--obs-text-faint); font-variant-numeric: tabular-nums; }
  .sub.grew .sub-pct { color: var(--obs-afterglow); }
  .stage-pct.ticking { min-width: 64px; color: var(--obs-afterglow); font-variant-numeric: tabular-nums; }
  @keyframes work-blink { 50% { opacity: 0.3; } }
  .spark { width: 80px; height: 16px; margin-left: auto; }
  .spark path { fill: none; stroke: var(--obs-accent); stroke-width: 1.4; }
  .bar { height: 5px; border-radius: 3px; background: var(--obs-line); overflow: hidden; }
  .bar.thin { height: 4px; }
  .bar span { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--obs-sweep), var(--obs-islam)); transition: width 1.2s ease; }
  .bar .b10 { background: linear-gradient(90deg, var(--obs-buddhist), var(--obs-judaism)); }

  /* the dial is as large as the column allows AND as tall as the first screen allows — always above the fold */
  .dial-wrap { position: relative; min-width: 0; width: min(100%, calc(100svh - var(--obs-chrome))); justify-self: center; }
  /* the dial sits on a disc of liquid glass (bezel radius 440/500 of the half-width) */
  .dial-wrap::before { content: ''; position: absolute; left: 6%; top: 0; width: 88%; aspect-ratio: 1; margin-top: 6%; border-radius: 50%;
    /* translucent (Chad: "give the round graph a bit of translucency so the animation behind it sparkles through") */
    background: radial-gradient(circle at 32% 26%, var(--glass-shine), transparent 40%), light-dark(rgba(255, 255, 255, 0.2), rgba(14, 22, 40, 0.16));
    backdrop-filter: blur(5px) saturate(160%); -webkit-backdrop-filter: blur(5px) saturate(160%);
    border: 1px solid var(--glass-edge); box-shadow: inset 0 2px 1px var(--glass-shine), inset 0 -10px 30px var(--glass-rim), var(--glass-shadow); }
  .dial-wrap > :global(svg) { position: relative; }
  .dial-skel { aspect-ratio: 1; border-radius: 50%; border: 1px dashed var(--obs-line-strong); display: grid; place-items: center; color: var(--obs-text-faint); }
  .dial-note { text-align: center; margin-top: 6px; font-size: 11px; color: var(--obs-accent); letter-spacing: 0.08em; }

  .cap { display: flex; flex-direction: column; gap: 6px; }
  .cap-top { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 500; }
  .cap-note { color: var(--obs-text-faint); font-size: 11px; font-weight: 400; text-align: right; }
  .cap-bars { display: flex; flex-direction: column; gap: 4px; }
  .cap-bar { display: grid; grid-template-columns: 42px minmax(0, 1fr) 38px; gap: 8px; align-items: center; font-size: 11.5px; }
  .cap-k { color: var(--obs-text-faint); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; }
  .cap-bar .mono { text-align: right; }
  .fine { margin: 0; font-size: 11px; line-height: 1.5; color: var(--obs-text-faint); }

  .disk { display: flex; flex-direction: column; gap: 5px; }
  .disk-top { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; }
  .disk-io { display: flex; gap: 10px; font-size: 11px; }
  .io.hot { color: var(--error); } .io.warm { color: var(--warning); } .io.cool { color: var(--success); }
  .disk-note { font-size: 11px; color: var(--obs-accent); }
  .smart { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 10.5px; color: var(--obs-text-dim); }
  .smart .ok { color: var(--success); } .smart .warn { color: var(--warning); } .smart .bad { color: var(--error); }
  .vitals { display: grid; gap: 4px; font-size: 11.5px; border-top: 1px solid var(--obs-line); padding-top: 10px; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 5px; background: var(--obs-text-faint); }
  .dot.green { background: #22c55e; box-shadow: 0 0 6px #22c55e; } .dot.yellow { background: #f59e0b; box-shadow: 0 0 6px #f59e0b; } .dot.red, .dot.unreachable { background: #ef4444; }

  .procs { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-left: 6px; letter-spacing: 0; }
  .proc { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 999px; color: var(--obs-text); }
  .spin { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--obs-accent); border-right-color: transparent; animation: spin 0.9s linear infinite; }

  .road-wrap { border-radius: 18px; overflow: hidden; }
  .roadmap { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .road { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
  .road + .road { border-left: 1px solid var(--obs-line); }
  .road h3 { margin: 0; font: 600 11px/1 var(--obs-sans); letter-spacing: 0.16em; text-transform: uppercase; color: var(--obs-accent); }
  .road p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--obs-text-dim); }

  .tip { position: fixed; z-index: 60; pointer-events: none; padding: 9px 11px; border-radius: 8px; font-size: 11.5px; line-height: 1.5;
    background: light-dark(rgba(255, 255, 255, 0.96), rgba(7, 11, 18, 0.95)); border: 1px solid var(--obs-line-strong); box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.4); }
  .tip-h { font-weight: 600; }
  .tip-sub { max-width: 340px; color: var(--obs-text-dim); font-family: var(--obs-sans); }
  .tip-why { max-width: 340px; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--obs-line); font: 400 12px/1.5 var(--obs-sans); color: var(--obs-text); }
  .tip-p { font-size: 15px; font-weight: 600; color: var(--obs-accent); }

  /* ── motion: something alive in every box (Chad 10-16: "some part of each box needs to be moving and alive") ── */
  .kpis::after, .panel::after, .road-wrap::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    background: linear-gradient(105deg, transparent 38%, var(--glass-shine) 50%, transparent 62%); background-size: 260% 100%;
    animation: sheen 9s ease-in-out infinite; opacity: 0.45; }
  .right > :nth-child(2)::after { animation-delay: 2.2s; } .right > :nth-child(3)::after { animation-delay: 4.4s; }
  .stages::after { animation-delay: 1.1s; } .road-wrap::after { animation-delay: 3.3s; }
  .flash { animation: flash 1.4s ease-out; }
  .stage.grow .bar span { background-size: 200% 100%; background-image: linear-gradient(90deg, var(--obs-sweep), var(--obs-islam), var(--obs-sweep)); animation: flow 2.4s linear infinite; }
  .iometer { height: 3px; border-radius: 2px; background: var(--obs-line); overflow: hidden; }
  .iometer span { display: block; height: 100%; transition: width 1.2s ease; background: var(--success); box-shadow: 0 0 8px currentColor; }
  .iometer span.warm { background: var(--warning); } .iometer span.hot { background: var(--error); }
  .dot.green { animation: blink 2.4s ease-in-out infinite; } .dot:nth-child(3) { animation-delay: 0.6s; } .dot:nth-child(4) { animation-delay: 1.2s; } .dot:nth-child(5) { animation-delay: 1.8s; }
  .writing { color: var(--success); } .bolt { animation: blink 1.2s ease-in-out infinite; }
  @keyframes sheen { 0%, 55% { background-position: 130% 0; } 100% { background-position: -130% 0; } }
  @keyframes flash { from { color: var(--obs-accent); text-shadow: 0 0 14px var(--obs-accent); } to { color: inherit; text-shadow: none; } }
  @keyframes flow { to { background-position: -200% 0; } }
  @keyframes blink { 50% { opacity: 0.3; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  /* medium: the dial + one side column (terminal, findability, health); index state drops below */
  @media (max-width: 1279px) {
    .grid { grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); grid-template-areas: 'dial right' 'stages stages'; }
    .stages { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px 18px; }
    .stages h2 { grid-column: 1 / -1; }
    .kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .kpi:nth-child(4n + 1) { border-left: 0; } .kpi:nth-child(n + 5) { border-top: 1px solid var(--obs-line); }
  }
  /* narrow (tablets, phones): the dial first at full width (width is the limit here, so it fits), then the terminal */
  @media (max-width: 899px) {
    .obs { padding: 62px 14px 40px; --obs-chrome: 150px; }
    .grid { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'dial' 'right' 'stages'; }
    .procs { display: none; }
  }
  @media (max-width: 560px) {
    .lede { display: none; }
    .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .kpi { border-left: 0 !important; border-top: 0 !important; } .kpi:nth-child(even) { border-left: 1px solid var(--obs-line) !important; } .kpi:nth-child(n + 3) { border-top: 1px solid var(--obs-line) !important; }
    .roadmap { grid-template-columns: minmax(0, 1fr); } .road + .road { border-left: 0; border-top: 1px solid var(--obs-line); }
  }
  @media (prefers-reduced-motion: reduce) { .sub-name i, .working i, .led, .spin, .flash, .bolt, .dot, .stage.grow .bar span, .kpis::after, .panel::after, .road-wrap::after { animation: none; } .bar span { transition: none; } }
</style>
