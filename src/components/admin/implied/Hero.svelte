<script>
  // "Where the HyPE money goes": headline, flow, spend chart, cost tiles, coverage rings, discoveries carousel, ask-the-library box. Presentation mode auto-advances discoveries.
  import { onMount } from 'svelte';
  import { api } from './api.js';
  import { countUp, usd, num, compact, colorOf, asOfText, tradName, keyScore } from './util.js';
  import Sankey from './Sankey.svelte';
  import SpendChart from './SpendChart.svelte';
  import ItemCard from './ItemCard.svelte';
  import GraphView from './GraphView.svelte';
  import ScoreBar from './ScoreBar.svelte';
  let { ov, loading = false, error = '', present = false, onnav = () => {}, onchat = () => {} } = $props();
  const s = $derived(ov?.spend);
  const questions = $derived(s?.byReligion?.reduce((a, r) => a + (r.questions || 0), 0) || 0);
  const trads = $derived(s?.byReligion?.length || 0);
  const passages = $derived(s?.byReligion?.reduce((a, r) => a + (r.paragraphs || 0), 0) || 0);   // HyPE'd passages (ov.totals.paragraphs counts only the implied list)
  const feat = $derived(ov?.featured || []);
  let idx = $state(0), q = $state(''), hits = $state(null), busy = $state(false), timer;
  $effect(() => { if (!present || feat.length < 2) return; const t = setInterval(() => (idx = (idx + 1) % feat.length), 9000); return () => clearInterval(t); });
  function ask() {
    clearTimeout(timer); if (q.trim().length < 3) { hits = null; return; }
    timer = setTimeout(async () => { busy = true; try { hits = (await api.search({ q, limit: present ? 4 : 6, stated: 1 })).hits; } catch { /* keep last */ } busy = false; }, 350);
  }
  // coverage per tradition, biggest spender first; traditions under 3% of spend fold into one row (as Sankey does)
  const cov = $derived.by(() => {
    const usdOf = new Map((s?.byReligion || []).map((r) => [r.religion, r.usd || 0])), T = [...usdOf.values()].reduce((a, v) => a + v, 0) || 1;
    const all = (s?.coverage || []).map((c) => ({ ...c, usd: usdOf.get(c.religion) || 0 })).sort((a, b) => b.usd - a.usd || b.hyped - a.hyped);
    const big = all.filter((c) => c.usd >= 0.03 * T), small = all.filter((c) => c.usd < 0.03 * T);
    return small.length > 1 ? [...big, { religion: `${small.length} other traditions`, hyped: small.reduce((a, c) => a + c.hyped, 0), total: small.reduce((a, c) => a + c.total, 0), folded: small.map((c) => tradName(c.religion)).join(', ') }] : all;
  });
</script>

<div class="hero" class:present>
  {#if error}<p class="text-error mb-3">{error} — showing last data.</p>{/if}
  {#if !ov && loading}
    <div class="skel big"></div><div class="skel"></div>
  {:else if ov && (ov.pending || !s)}
    <section class="headline"><p class="eyebrow">Where the HyPE money goes</p><h1>Tallying the ledger…</h1><p class="sub">The first spend and coverage report is being computed. This page fills in on its own once it lands.</p></section>
  {:else if ov}
    <section class="headline">
      <p class="eyebrow">Where the HyPE money goes</p>
      <h1>
        <span class="n" use:countUp={{ value: s.totalUsd, format: (v) => usd(v, 0) }}>{usd(s.totalUsd, 0)}</span> spent
        <span class="arrow">→</span>
        <span class="n" use:countUp={{ value: questions }}>{num(questions)}</span> questions taught to the library across
        <span class="n" use:countUp={{ value: passages }}>{num(passages)}</span> passages in
        <span class="n">{trads}</span> {trads === 1 ? 'tradition' : 'traditions'}
      </h1>
      <p class="sub">Of which <b>{num(ov.totals.items)}</b> are implied first principles — questions the text answers without ever stating them. Spend is from the LLM ledger; splits by tradition and by kind are <b>est.</b> · as of {asOfText(ov.asOf)}</p>
    </section>
    <section class="panel"><Sankey spend={s} /></section>
    <section class="grid2">
      <div class="panel"><h2>Spend over time</h2><SpendChart days={s.byDay} /></div>
      <div class="tiles">
        <div class="tile"><span>per question</span><b>{usd(s.costPerQuestion, 5)}</b></div>
        <div class="tile"><span>per implied premise <i>est.</i></span><b>{usd(s.costPerImplied, 4)}</b></div>
        <div class="tile"><span>implied share <i>est.</i></span><b>{usd(s.impliedShareUsd, 0)}</b></div>
        <div class="tile"><span>reviewed by a human</span><b>{num((ov.totals.byStatus.approved || 0) + (ov.totals.byStatus.edited || 0))}</b></div>
      </div>
    </section>
    <section class="panel">
      <h2>Coverage</h2>
      <div class="cov">
        {#each cov as c (c.religion)}
          {@const p = c.total ? c.hyped / c.total : 0}
          <div class="ci" title={c.folded || ''}>
            <div class="l1"><span>{tradName(c.religion)}</span><b>{Math.round(p * 100)}%</b><small>{compact(c.hyped)} / {compact(c.total)} ¶</small></div>
            <div class="track"><i style={`width:${Math.max(1, p * 100)}%;background:${colorOf(c.religion)}`}></i></div>
          </div>
        {/each}
      </div>
    </section>
    <section class="panel">
      <div class="dh"><h2>First principles</h2><button class="lk" onclick={() => onnav('graph', {})}>Open the graph explorer →</button></div>
      <GraphView p={{}} setp={() => {}} compact onnav={onnav} onchat={onchat} />
    </section>
    {#if feat.length}
      <section class="panel disc">
        <div class="dh"><h2>Discoveries</h2>
          <div class="dots">{#each feat as f, i (f.id)}<button aria-label={`Discovery ${i + 1}`} class:on={i === idx} onclick={() => (idx = i)}></button>{/each}</div>
        </div>
        {#key idx}<div class="fade"><ItemCard item={feat[idx]} big={present} readonly /></div>{/key}
        {#if !present}<div class="nav"><button onclick={() => (idx = (idx - 1 + feat.length) % feat.length)}>‹ prev</button><button onclick={() => (idx = (idx + 1) % feat.length)}>next ›</button></div>{/if}
      </section>
    {/if}
    <section class="panel">
      <h2>Ask the library</h2>
      <input class="ask" placeholder="Ask a first-principle question…" bind:value={q} oninput={ask} />
      {#if busy}<p class="text-muted text-sm mt-2">searching…</p>{/if}
      {#if hits}
        <ul class="hits">
          {#each hits as h, i (i)}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
            <li style={`animation-delay:${i * 70}ms`} tabindex="0" onkeydown={keyScore}>
              {#if h.kind === 'implied'}<span class="badge">implied</span><a href={`?tab=explore&sel=${h.item.id}`} onclick={(e) => { e.preventDefault(); onnav('explore', { sel: h.item.id, q }); }}>{h.item.question}</a><small>{h.item.doc.title} · {h.item.doc.author}</small>
              {:else}<span class="badge st">stated</span><a href={h.stated?.link} target="_blank" rel="noopener">{h.stated?.q}</a><small>{h.stated?.doc?.title}</small>{/if}
              <em>{h.score.toFixed(2)}</em>
              <div class="hact">
                {#if h.kind === 'implied'}<ScoreBar paraId={h.item.paraId} question={h.item.question} kind="implied" impliedId={h.item.id} score={h.myScore ?? null} />
                {:else if h.stated?.paraId}<ScoreBar paraId={h.stated.paraId} question={h.stated.q} kind="stated" score={h.myScore ?? null} />{/if}
                <button class="askbtn" onclick={() => onchat(null, { question: h.kind === 'implied' ? h.item.question : h.stated?.q })}>Ask Anís about this</button>
              </div>
            </li>
          {:else}<li class="text-muted">No matches.</li>{/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<style>
  .hero { display: grid; gap: 1.25rem; max-width: 1500px; margin: 0 auto; }
  .headline { padding: 1.5rem 0 .5rem; } .eyebrow { text-transform: uppercase; letter-spacing: .2em; font-size: .75rem; color: var(--accent); margin-bottom: .75rem; }
  h1 { font-size: clamp(1.6rem, 3.2vw, 3rem); line-height: 1.25; font-weight: 300; color: var(--text-secondary); font-family: Georgia, serif; }
  .n { font-weight: 700; color: var(--text-primary); background: linear-gradient(90deg, var(--accent), var(--accent-tertiary)); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; font-variant-numeric: tabular-nums; }
  .arrow { color: var(--accent); } .sub { margin-top: .75rem; color: var(--text-tertiary); font-size: .9rem; max-width: 70ch; }
  .present h1 { font-size: clamp(2.2rem, 4.6vw, 4.6rem); } .present .sub { font-size: 1.15rem; }
  .panel { background: var(--surface-1); border: 1px solid var(--border-default); border-radius: 1rem; padding: 1.25rem 1.5rem; backdrop-filter: blur(6px); }
  h2 { font-size: .75rem; text-transform: uppercase; letter-spacing: .15em; color: var(--text-muted); margin-bottom: .75rem; }
  .grid2 { display: grid; grid-template-columns: 2fr 1fr; gap: 1.25rem; } @media (max-width: 1100px) { .grid2 { grid-template-columns: 1fr; } }
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; align-content: start; }
  .tile { background: var(--surface-1); border: 1px solid var(--border-default); border-radius: 1rem; padding: 1rem; display: grid; gap: .25rem; }
  .tile span { font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); } .tile b { font-size: 1.6rem; color: var(--text-primary); font-variant-numeric: tabular-nums; } i { color: var(--warning); font-style: normal; }
  .cov { display: grid; grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr)); gap: .5rem 1.5rem; } .l1 { display: flex; align-items: baseline; gap: .4rem; } .l1 span { font-weight: 600; color: var(--text-secondary); font-size: .85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .l1 b { color: var(--text-primary); font-size: .85rem; font-variant-numeric: tabular-nums; } .l1 small { margin-left: auto; color: var(--text-muted); font-size: .68rem; white-space: nowrap; }
  .track { height: .3rem; margin-top: .2rem; border-radius: 999px; background: var(--surface-3); overflow: hidden; } .track i { display: block; height: 100%; border-radius: 999px; transition: width 1.2s cubic-bezier(.2, .8, .2, 1); } .lk { color: var(--accent); font-size: .8rem; background: none; border: 0; cursor: pointer; }
  .dh { display: flex; justify-content: space-between; align-items: center; } .dots { display: flex; gap: .4rem; } .dots button { width: .55rem; height: .55rem; border-radius: 50%; background: var(--surface-3); border: 0; cursor: pointer; } .dots .on { background: var(--accent); transform: scale(1.3); }
  .fade { animation: fin .6s ease both; } @keyframes fin { from { opacity: 0; transform: translateY(8px); } } .nav { display: flex; gap: 1rem; margin-top: .75rem; } .nav button { color: var(--text-tertiary); background: none; border: 0; cursor: pointer; } .nav button:hover { color: var(--accent); }
  .ask { width: 100%; font-size: 1.15rem; padding: .8rem 1.1rem; border-radius: .8rem; background: var(--surface-solid); border: 1px solid var(--border-default); color: var(--text-primary); } .ask:focus { outline: 2px solid var(--accent); }
  .hits { list-style: none; margin-top: .75rem; display: grid; gap: .5rem; } .hits li { display: grid; grid-template-columns: auto 1fr auto; gap: .2rem .75rem; align-items: baseline; padding: .5rem .75rem; border-radius: .6rem; background: var(--surface-2); animation: fin .5s ease both; }
  .hits a { color: var(--text-primary); text-decoration: none; font-weight: 600; } .hits a:hover { color: var(--accent); } .hits small { grid-column: 2; color: var(--text-muted); } .hits em { color: var(--text-muted); font-style: normal; font-variant-numeric: tabular-nums; }
.hact { grid-column: 2 / 4; display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; } .askbtn { font-size: .72rem; padding: .1rem .6rem; border-radius: 999px; border: 1px solid var(--accent); color: var(--accent); background: none; cursor: pointer; } .askbtn:hover { background: var(--accent-primary-alpha); }
  .hits li:focus-visible { outline: 2px solid var(--accent); }
  .badge { font-size: .65rem; text-transform: uppercase; letter-spacing: .08em; padding: .1rem .5rem; border-radius: 999px; background: var(--accent-primary-alpha); color: var(--accent); } .badge.st { background: var(--surface-3); color: var(--text-tertiary); }
  .skel { height: 8rem; border-radius: 1rem; background: linear-gradient(90deg, var(--surface-1), var(--surface-2), var(--surface-1)); background-size: 200% 100%; animation: sh 1.4s infinite; } .skel.big { height: 12rem; } @keyframes sh { to { background-position: -200% 0; } }
  @media (prefers-reduced-motion: reduce) { .fade, .hits li, .skel { animation: none; } .track i { transition: none; } }
</style>
