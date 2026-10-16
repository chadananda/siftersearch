<script>
  // The Observatory — the home page (Chad 10-16): "a super impressive and dynamic dashboard of facts about the library,
  // constantly moving and updating based on index and testing going on … a powerful machine ingesting and studying the
  // library and gaining capability by the minute … a project we are developing in public." Reads ONLY the public API
  // (/api/observatory/telemetry every 60 s, edge-cached; the terminal polls /activity). Counters advance between
  // snapshots at their measured hourly rate; nothing is invented.
  import { onMount } from 'svelte';
  import { observatory } from '../../lib/api.js';
  import { compact, exact, pct, rate, interpolate, duration, ringOfJob, sparkPath } from '../../lib/observatory.js';
  import ObservatoryDial from './ObservatoryDial.svelte';
  import ObservatoryTerminal from './ObservatoryTerminal.svelte';

  let tel = $state(null);
  let error = $state(null);
  let now = $state(Date.now());
  let fetchedAt = $state(Date.now());
  let tip = $state(null);

  const snap = $derived(tel?.snapshot || null);
  const rates = $derived(tel?.rates || {});
  const since = $derived(snap ? Math.max(0, now / 1000 - snap.at) : 0);
  const live = (v, key) => interpolate(v, rates[key], since);
  const ring = (id) => snap?.rings?.find((r) => r.id === id) || null;
  const series = (key) => (tel?.series || []).map((p) => p.series?.[key]);

  const KPIS = [
    { label: 'Paragraphs', value: () => snap?.corpus?.paragraphs, key: 'text', hint: 'every passage, in 11 traditions' },
    { label: 'Documents', value: () => snap?.corpus?.documents, hint: 'books, tablets, letters, talks' },
    { label: 'Phrase vectors', value: () => snap?.vectors?.phrases, key: 'v_phrases', hint: 'meaning of every clause' },
    { label: 'Keyword terms', value: () => snap?.vectors?.paragraphs_kw, key: 'v_paragraphs_kw', hint: 'BM25 over every paragraph' },
    { label: 'Questions', value: () => snap?.vectors?.hype, key: 'v_hype', hint: 'what each passage answers' },
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
  const activeRings = $derived([...new Set((snap?.jobs?.running || []).map((j) => ringOfJob(j.name, j.label)).filter(Boolean))]);
  const ago = (sec) => (sec < 90 ? `${Math.round(sec)} s ago` : sec < 5400 ? `${Math.round(sec / 60)} min ago` : `${(sec / 3600).toFixed(1)} h ago`);
  const levelOf = (p) => (p == null ? '' : p >= 85 ? 'hot' : p >= 60 ? 'warm' : 'cool');

  async function load() {
    try { const r = await observatory.telemetry(); tel = r.data; fetchedAt = Date.now(); error = null; }
    catch (err) { error = err.message; }
  }
  onMount(() => {
    load();
    const poll = setInterval(load, 60000);
    const tick = setInterval(() => { now = Date.now(); }, 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
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
    </div>
    <h1 id="obs-title">An interfaith library, <em>learning in public.</em></h1>
    <p class="lede">Every passage of {snap?.corpus?.traditions ?? 11} traditions — searched, questioned and studied by machine, in the open.
      Each ring below is a stage of understanding; each sector, a tradition. Watch it grow.</p>
  </header>

  {#if error && !snap}<p class="err">Telemetry unavailable right now ({error}). The library itself is unaffected.</p>{/if}

  <!-- figures -->
  <div class="kpis">
    {#each KPIS as k (k.label)}
      {@const v = k.key ? live(k.value(), k.key) : k.value()}
      <div class="kpi">
        <div class="kpi-label">{k.label}</div>
        <div class="kpi-num mono">{snap ? exact(v) : '—'}</div>
        <div class="kpi-foot"><span class="kpi-hint">{k.hint}</span>{#if k.key && rates[k.key] > 0}<span class="kpi-rate mono">{rate(rates[k.key])}</span>{/if}</div>
      </div>
    {/each}
  </div>

  <div class="grid">
    <!-- left: index state, stage by stage -->
    <aside class="panel stages" aria-label="Index state by stage">
      <h2>Index state <span class="h-sub">stage by stage, centre outward</span></h2>
      {#each snap?.rings || [] as r, i (r.id)}
        {@const p = r.total ? (100 * r.done) / r.total : 0}
        <div class="stage" class:planned={r.planned}>
          <div class="stage-top"><span class="stage-n mono">{String(i + 1).padStart(2, '0')}</span><span class="stage-name">{r.label}</span>
            <span class="stage-pct mono">{r.planned ? 'planned' : pct(r.done, r.total)}</span></div>
          <div class="bar"><span style={`width:${Math.max(r.done ? 0.6 : 0, Math.min(100, p))}%`}></span></div>
          <div class="stage-foot mono">
            <span>{compact(live(r.done, r.id))} / {compact(r.total)} {r.id === 'sections' ? 'docs' : '¶'}</span>
            {#if r.core_total && !r.planned}<span class="core-tag">core {pct(r.core_done, r.core_total, 0)}</span>{/if}
            {#if rates[r.id] > 0}<span class="up">{rate(rates[r.id])}</span>{/if}
            {#if series(r.id).filter((x) => x != null).length > 2}<svg class="spark" viewBox="0 0 80 16" aria-hidden="true"><path d={sparkPath(series(r.id), 80, 16)} /></svg>{/if}
          </div>
        </div>
      {/each}
    </aside>

    <!-- centre: the dial -->
    <div class="dial-wrap">
      {#if snap}<ObservatoryDial snapshot={snap} {activeRings} {now} onhover={(t) => (tip = t)} />
      {:else}<div class="dial-skel"><span class="mono">calibrating…</span></div>{/if}
      {#if activeRings.length}<div class="dial-note mono">◉ live: {activeRings.join(' · ')}</div>{/if}
    </div>

    <!-- right: capability + health -->
    <div class="right">
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
          <p class="fine mono">known-item test #{snap.capability.run} · {snap.capability.paragraphs} real passages, doctrinal core sampled 3× · {snap.capability.finished_at?.slice(0, 16).replace('T', ' ')} UTC</p>
        {:else}
          <p class="fine">The first run of the findability test is in progress — watch its probes stream through the terminal below.</p>
        {/if}
      </section>

      <section class="panel" aria-label="System health">
        <h2>System health <span class="h-sub">the machine itself</span></h2>
        {#if snap?.health}
          {@const h = snap.health}
          {#each h.storage.filter((s) => s.size_gb) as s (s.dev)}
            <div class="disk">
              <div class="disk-top"><span>{s.label} <span class="mute mono">{s.mount}</span></span><span class="mono">{s.used_pct}% of {s.size_gb >= 1000 ? `${(s.size_gb / 1000).toFixed(0)} TB` : `${s.size_gb} GB`}</span></div>
              <div class="bar thin"><span style={`width:${s.used_pct}%`}></span></div>
              <div class="disk-io mono">
                <span class={`io ${levelOf(s.io?.busy_pct)}`}>I/O {s.io ? `${s.io.busy_pct}% busy` : '—'}</span>
                {#if s.io}<span class="mute">↓{s.io.read_mb_s} ↑{s.io.write_mb_s} MB/s</span>{/if}
              </div>
              {#if s.note}<div class="disk-note">→ {s.note}</div>{/if}
            </div>
          {/each}
          <div class="vitals mono">
            <div><span class="mute">CPU</span> {h.cpu.cores} cores · load {h.cpu.load_pct}%</div>
            <div><span class="mute">RAM</span> {h.memory.total_gb} GB · {h.memory.used_pct}% used</div>
            {#if h.services}<div><span class="mute">Services</span> {h.services.online} online{h.services.errored ? ` · ${h.services.errored} errored` : ''}</div>{/if}
            <div><span class="mute">Vector indexes</span> {#each Object.entries(h.vectors || {}) as [c, st] (c)}<span class={`dot ${st}`} title={`${c}: ${st}`}></span>{/each}</div>
            {#if h.slow_queries_24h}<div><span class="mute">Blocking queries 24 h</span> {h.slow_queries_24h.n} over {h.slow_queries_24h.min_ms / 1000} s</div>{/if}
          </div>
        {:else}<p class="fine">Measuring…</p>{/if}
      </section>
    </div>
  </div>

  <!-- running now -->
  {#if snap?.jobs}
    <div class="procs">
      <h2>Running now</h2>
      {#each snap.jobs.running as j (j.id)}
        <div class="proc mono"><span class="spin"></span>{j.label}<span class="mute">· {duration((j.elapsed_s || 0) + (now - fetchedAt) / 1000)}</span></div>
      {:else}<div class="proc mono mute">idle between jobs</div>{/each}
    </div>
  {/if}

  <ObservatoryTerminal />

  <!-- developed in public -->
  {#if snap?.roadmap}
    <div class="roadmap">
      {#each ['now', 'next', 'later'] as st (st)}
        <div class="road">
          <h3>{st === 'now' ? 'Building now' : st === 'next' ? 'Next' : 'Later'}</h3>
          {#each snap.roadmap.filter((x) => x.state === st) as x, i (i)}<p>{x.text}</p>{/each}
        </div>
      {/each}
    </div>
  {/if}

  {#if tip}
    <div class="tip mono" style={`left:${tip.x + 14}px; top:${tip.y + 14}px`}>
      <div class="tip-h">{tip.tradition} · {tip.ring}</div>
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
    --obs-bahai: light-dark(#b7791f, #fbbf24); --obs-islam: light-dark(#047857, #34d399); --obs-christian: light-dark(#b91c1c, #f87171);
    --obs-judaism: light-dark(#1d4ed8, #60a5fa); --obs-zoroastrian: light-dark(#c2410c, #fb923c); --obs-hindu: light-dark(#be185d, #f472b6);
    --obs-buddhist: light-dark(#6d28d9, #a78bfa); --obs-jain: light-dark(#0f766e, #2dd4bf); --obs-sikh: light-dark(#4338ca, #818cf8);
    --obs-tao: light-dark(#0e7490, #22d3ee); --obs-confucian: light-dark(#4d7c0f, #a3e635); --obs-other: light-dark(#64748b, #94a3b8);
    --obs-panel: light-dark(rgba(255, 255, 255, 0.72), rgba(9, 15, 28, 0.62));
    position: relative; max-width: 1600px; margin: 0 auto; padding: 88px 20px 64px; display: flex; flex-direction: column; gap: 22px;
    color: var(--obs-text); font-family: var(--obs-sans);
  }
  .mono { font-family: var(--obs-mono); font-variant-numeric: tabular-nums; }
  .mute { color: var(--obs-text-faint); }
  .mast { display: flex; flex-direction: column; gap: 10px; }
  .kicker { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font: 600 11.5px/1 var(--obs-mono); letter-spacing: 0.16em; color: var(--obs-accent); }
  .kicker .sep { color: var(--obs-text-faint); }
  .led { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 10px #22c55e; animation: blink 1.8s ease-in-out infinite; }
  h1 { margin: 0; font: 600 clamp(28px, 4.2vw, 52px)/1.08 var(--obs-sans); letter-spacing: -0.025em; text-wrap: balance; }
  h1 em { font-style: normal; background: linear-gradient(90deg, var(--obs-bahai), var(--obs-islam), var(--obs-judaism), var(--obs-buddhist));
    -webkit-background-clip: text; background-clip: text; color: transparent; }
  .lede { margin: 0; max-width: 62ch; color: var(--obs-text-dim); font-size: 16px; line-height: 1.55; }
  .err { color: var(--error); }

  .kpis { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 1px; background: var(--obs-line); border: 1px solid var(--obs-line); border-radius: 14px; overflow: hidden; }
  .kpi { background: var(--obs-panel); backdrop-filter: blur(14px); padding: 14px 14px 12px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .kpi-label { font: 600 10.5px/1 var(--obs-sans); letter-spacing: 0.16em; text-transform: uppercase; color: var(--obs-text-dim); }
  .kpi-num { font-size: clamp(17px, 1.6vw, 24px); font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kpi-foot { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; color: var(--obs-text-faint); min-height: 14px; }
  .kpi-hint { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .kpi-rate { color: var(--success); white-space: nowrap; }

  .grid { display: grid; grid-template-columns: minmax(250px, 300px) minmax(0, 1fr) minmax(270px, 330px); gap: 22px; align-items: start; }
  .panel { background: var(--obs-panel); backdrop-filter: blur(14px); border: 1px solid var(--obs-line); border-radius: 14px; padding: 16px 16px 14px; display: flex; flex-direction: column; gap: 12px; }
  h2 { margin: 0; font: 600 12px/1.2 var(--obs-sans); letter-spacing: 0.16em; text-transform: uppercase; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
  .h-sub { font: 400 11.5px/1.2 var(--obs-sans); letter-spacing: 0; text-transform: none; color: var(--obs-text-faint); }
  .right { display: flex; flex-direction: column; gap: 22px; }

  .stage { display: flex; flex-direction: column; gap: 5px; }
  .stage-top { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
  .stage-n { color: var(--obs-text-faint); font-size: 11px; }
  .stage-name { flex: 1; min-width: 0; font-weight: 500; }
  .stage-pct { font-size: 12.5px; font-weight: 600; }
  .stage.planned { opacity: 0.55; }
  .stage-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 11px; color: var(--obs-text-dim); }
  .core-tag { color: var(--obs-bahai); }
  .up { color: var(--success); }
  .spark { width: 80px; height: 16px; margin-left: auto; }
  .spark path { fill: none; stroke: var(--obs-accent); stroke-width: 1.4; }
  .bar { height: 5px; border-radius: 3px; background: var(--obs-line); overflow: hidden; }
  .bar.thin { height: 4px; }
  .bar span { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--obs-sweep), var(--obs-islam)); transition: width 1.2s ease; }
  .bar .b10 { background: linear-gradient(90deg, var(--obs-buddhist), var(--obs-judaism)); }

  .dial-wrap { position: relative; min-width: 0; }
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
  .vitals { display: grid; gap: 4px; font-size: 11.5px; border-top: 1px solid var(--obs-line); padding-top: 10px; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 5px; background: var(--obs-text-faint); }
  .dot.green { background: #22c55e; box-shadow: 0 0 6px #22c55e; } .dot.yellow { background: #f59e0b; box-shadow: 0 0 6px #f59e0b; } .dot.red, .dot.unreachable { background: #ef4444; }

  .procs { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
  .procs h2 { margin-right: 4px; }
  .proc { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 6px 12px; border-radius: 999px; background: var(--obs-panel); border: 1px solid var(--obs-line); }
  .spin { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--obs-accent); border-right-color: transparent; animation: spin 0.9s linear infinite; }

  .roadmap { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; background: var(--obs-line); border: 1px solid var(--obs-line); border-radius: 14px; overflow: hidden; }
  .road { background: var(--obs-panel); backdrop-filter: blur(14px); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
  .road h3 { margin: 0; font: 600 11px/1 var(--obs-sans); letter-spacing: 0.16em; text-transform: uppercase; color: var(--obs-accent); }
  .road p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--obs-text-dim); }

  .tip { position: fixed; z-index: 60; pointer-events: none; padding: 9px 11px; border-radius: 8px; font-size: 11.5px; line-height: 1.5;
    background: light-dark(rgba(255, 255, 255, 0.96), rgba(7, 11, 18, 0.95)); border: 1px solid var(--obs-line-strong); box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.4); }
  .tip-h { font-weight: 600; }
  .tip-p { font-size: 15px; font-weight: 600; color: var(--obs-accent); }

  @keyframes blink { 50% { opacity: 0.3; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 1180px) {
    .grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .dial-wrap { grid-column: 1 / -1; grid-row: 1; max-width: 760px; width: 100%; margin: 0 auto; }
    .kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
  @media (max-width: 720px) {
    .obs { padding: 76px 16px 48px; }
    .grid { grid-template-columns: minmax(0, 1fr); }
    .right { gap: 16px; }
    .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .roadmap { grid-template-columns: minmax(0, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) { .led, .spin { animation: none; } .bar span { transition: none; } }
</style>
