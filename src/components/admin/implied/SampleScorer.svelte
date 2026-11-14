<script>
  // "Score a sample": one random legacy stated question at a time (by fault type) with its passage. Keys 1-5 score + advance, S skips, ← back. Prefetches; tally per fault from scoreStats.byFault.
  import { onMount } from 'svelte';
  import { api } from './api.js';
  import ScoreBar from './ScoreBar.svelte';
  import { num } from './util.js';
  const FAULTS = [['yesNo', 'Yes/no'], ['namedBook', 'Names the book/subject'], ['any', 'Any question (control)']];
  let { onscored = () => {} } = $props();
  let fault = $state('yesNo'), queue = $state([]), idx = $state(0), fetching = $state(false), exhausted = $state(false), error = $state(''), by = $state({});
  let seq = 0;
  const cur = $derived(queue[idx]), tally = $derived(by[fault]);
  async function refill() {
    if (fetching || exhausted) return;
    const my = seq, f = fault; fetching = true; error = '';
    try {
      const r = await api.sample({ fault: f, n: 20 });
      if (my !== seq) return;
      const have = new Set(queue.map((x) => x.paraId + '|' + x.question)), add = r.items.filter((x) => !have.has(x.paraId + '|' + x.question));
      queue = [...queue, ...add]; if (!add.length) exhausted = true;
    } catch (e) { if (my === seq) error = e.message; }
    if (my === seq) fetching = false;
  }
  async function stats() { try { by = (await api.scoreStats()).byFault || {}; } catch { /* tally is a nicety */ } }
  function pick(f) { fault = f; seq++; queue = []; idx = 0; exhausted = false; fetching = false; refill(); }
  async function score(n) {
    const c = cur; if (!c) return;
    error = '';
    try { await api.setScore({ paraId: c.paraId, question: c.question, kind: 'stated', score: n, fault: c.fault }); c.myScore = n; onscored(); stats(); next(); } catch (e) { error = e.message; }
  }
  function next() { if (idx < queue.length) idx++; if (queue.length - idx < 5) refill(); }
  const back = () => { if (idx > 0) idx--; };
  function key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
    if (/^[1-5]$/.test(e.key)) { e.preventDefault(); score(+e.key); }
    else if (e.key === 's' || e.key === 'S') next();
    else if (e.key === 'ArrowLeft') back();
  }
  onMount(() => { refill(); stats(); });
</script>

<svelte:window onkeydown={key} />
<section class="sample">
  <header>
    <h3>Score a sample</h3>
    <div class="picker" role="group" aria-label="Fault type">{#each FAULTS as [v, label] (v)}<button class:on={fault === v} onclick={() => pick(v)}>{label}</button>{/each}</div>
    <p class="tally">{#if tally}<b>{num(tally.n)}</b> scored · avg {tally.avg} · {Math.round(tally.lowShare * 100)}% ≤2{:else}none scored yet{/if}</p>
  </header>
  <p class="hint">{#if fault === 'yesNo'}Yes/no = questions answerable yes or no, written before the seeker label existed — some are real seeker questions, some are narrow facts.{:else if fault === 'namedBook'}Names the book/subject = the question mentions the book's own title or subject, so it only makes sense to someone already reading that book.{:else}Control group: any stated question, no fault filter.{/if}</p>
  {#if error}<p class="text-error">{error}</p>{/if}
  {#if cur}
    {#key cur.paraId + '|' + cur.question}
    <article class="card">
      <p class="q">{cur.question}</p>
      <p class="m"><a href={cur.link} target="_blank" rel="noopener">{cur.doc?.title}{cur.doc?.author ? ` · ${cur.doc.author}` : ''}</a> · <span>¶{cur.paraId}</span></p>
      <p class="text">{cur.text}</p>
      <div class="act"><ScoreBar paraId={cur.paraId} question={cur.question} kind="stated" fault={cur.fault} score={cur.myScore} onchange={(n) => { cur.myScore = n; onscored(); stats(); if (n != null) next(); }} />
        <span class="keys">1–5 score · S skip · ← back · {idx + 1}/{queue.length}</span></div>
    </article>
    {/key}
  {:else if fetching}<div class="skel"></div>
  {:else}<p class="empty">{exhausted ? 'No more questions found for this fault — try another.' : 'Nothing to show.'}</p>{/if}
</section>

<style>
  .sample { background: var(--surface-1); border: 1px solid var(--border-default); border-radius: 1rem; padding: 1rem 1.25rem; margin-bottom: 1rem; display: grid; gap: .6rem; }
  header { display: flex; flex-wrap: wrap; gap: .75rem 1.25rem; align-items: center; } h3 { font-weight: 700; color: var(--text-primary); }
  .picker { display: flex; gap: .35rem; } .picker button { padding: .25rem .8rem; border-radius: 999px; border: 1px solid var(--border-default); background: var(--surface-2); color: var(--text-secondary); font-size: .82rem; cursor: pointer; }
  .picker button.on { background: var(--accent-primary-alpha); color: var(--accent); border-color: var(--accent); }
  .tally { margin-left: auto; font-size: .85rem; color: var(--text-secondary); font-variant-numeric: tabular-nums; } .hint { font-size: .78rem; color: var(--text-muted); }
  .card { display: grid; gap: .5rem; padding: .9rem 1.1rem; border-radius: .8rem; background: var(--surface-2); }
  .q { font-size: 1.35rem; font-weight: 600; color: var(--text-primary); line-height: 1.35; } .m { font-size: .78rem; color: var(--text-muted); } .m a { color: inherit; text-decoration: none; } .m a:hover { color: var(--accent); }
  .text { font-size: .92rem; color: var(--text-secondary); line-height: 1.55; } .act { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; } .keys { font-size: .72rem; color: var(--text-muted); }
  .skel { height: 8rem; border-radius: .8rem; background: var(--surface-2); } .empty { text-align: center; color: var(--text-muted); padding: 1rem 0; }
</style>
