<script>
  // "Scored" view: every question score (newest first), filter by max score / kind, stats header (counts by score, top tags). Rescore inline.
  import { untrack } from 'svelte';
  import { api } from './api.js';
  import ScoreBar from './ScoreBar.svelte';
  import SampleScorer from './SampleScorer.svelte';
  import { num } from './util.js';
  let { p, setp } = $props();
  let rows = $state([]), next = $state(null), stats = $state(null), loading = $state(false), error = $state('');
  const max = $derived(p.max || ''), kind = $derived(p.kind || '');
  let seq = 0;
  async function load(more = false) {
    const my = ++seq; loading = true; error = '';
    try {
      const [r, s] = await Promise.all([api.scores({ max, kind, limit: 50, cursor: more ? next : '' }), more ? stats : api.scoreStats()]);
      if (my !== seq) return;
      rows = more ? [...rows, ...r.scores] : r.scores; next = r.next; stats = s;
    } catch (e) { if (my === seq) error = e.message; }
    if (my === seq) loading = false;
  }
  $effect(() => { JSON.stringify([max, kind]); untrack(() => load()); });
  const peak = $derived(Math.max(1, ...Object.values(stats?.byScore || {})));
</script>

<SampleScorer onscored={() => load()} />
<section class="stats">
  {#if stats}
    <div class="bars" aria-label="Scores by value">
      {#each [1, 2, 3, 4, 5] as n (n)}
        <button class="bar" class:bad={n <= 2} class:on={String(max) === String(n)} onclick={() => setp({ max: String(max) === String(n) ? '' : n })} title={`show scores ≤ ${n}`}>
          <i style={`height:${Math.round(((stats.byScore[n] || 0) / peak) * 100)}%`}></i><b>{num(stats.byScore[n] || 0)}</b><span>{n}</span>
        </button>
      {/each}
    </div>
    <div class="meta"><p><b>{num(stats.total)}</b> scored{#each Object.entries(stats.byKind || {}) as [k, v] (k)} · {k} {num(v.n)} (avg {v.avg}){/each}</p>
      {#if stats.topTags?.length}<p class="tags">{#each stats.topTags as t (t.tag)}<span>{t.tag} <em>{t.n}</em></span>{/each}</p>{:else}<p class="text-muted text-sm">No reasons tagged yet.</p>{/if}</div>
  {:else if loading}<div class="skel"></div>{/if}
</section>
<div class="filters">
  <select value={max} onchange={(e) => setp({ max: e.target.value })}><option value="">all scores</option>{#each [1, 2, 3, 4] as n (n)}<option value={n}>{n} or lower</option>{/each}</select>
  <select value={kind} onchange={(e) => setp({ kind: e.target.value })}><option value="">stated + implied</option><option value="stated">stated</option><option value="implied">implied</option></select>
</div>
{#if error}<p class="text-error">{error}</p>{/if}
<ul class="list">
  {#each rows as r (r.id)}
    <li>
      <span class={`n ${r.score <= 2 ? 'bad' : ''}`}>{r.score}</span>
      <div><p class="q">{r.question}</p>
        <p class="m"><span class="k">{r.kind}</span>{#each r.tags || [] as t (t)}<span class="t">{t}</span>{/each}{#if r.note} <i>“{r.note}”</i>{/if}</p>
        <p class="m"><a href={r.link} target="_blank" rel="noopener">{r.doc?.title}{r.doc?.author ? ` · ${r.doc.author}` : ''}</a></p></div>
      <ScoreBar paraId={r.paraId} question={r.question} kind={r.kind} impliedId={r.impliedId} score={r.score} />
    </li>
  {:else}{#if !loading}<li class="empty">Nothing scored{max ? ` at ${max} or lower` : ''} yet. Score questions with the 1–5 boxes anywhere, or press 1–5 on a focused row.</li>{/if}{/each}
</ul>
{#if next}<button class="more" onclick={() => load(true)} disabled={loading}>{loading ? 'Loading…' : 'Load more'}</button>{/if}

<style>
  .stats { display: flex; gap: 2rem; align-items: end; flex-wrap: wrap; background: var(--surface-1); border: 1px solid var(--border-default); border-radius: 1rem; padding: 1rem 1.25rem; margin-bottom: 1rem; }
  .bars { display: flex; gap: .5rem; height: 6rem; align-items: end; } .bar { position: relative; width: 3rem; height: 100%; display: grid; grid-template-rows: 1fr auto auto; justify-items: center; align-items: end; background: none; border: 0; cursor: pointer; color: var(--text-muted); font-size: .75rem; }
  .bar i { display: block; width: 100%; min-height: 2px; border-radius: .3rem .3rem 0 0; background: var(--accent); opacity: .7; } .bar.bad i { background: var(--error); } .bar.on i, .bar:hover i { opacity: 1; } .bar b { color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .meta { flex: 1; min-width: 14rem; display: grid; gap: .4rem; color: var(--text-secondary); font-size: .9rem; } .tags { display: flex; flex-wrap: wrap; gap: .35rem; } .tags span { font-size: .72rem; padding: .1rem .55rem; border-radius: 999px; background: var(--surface-2); } .tags em { font-style: normal; color: var(--accent); margin-left: .25rem; }
  .filters { display: flex; gap: .5rem; margin-bottom: .75rem; } .filters select { background: var(--surface-solid); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: .5rem; padding: .35rem .6rem; font-size: .85rem; }
  .list { list-style: none; display: grid; gap: .5rem; } .list li { display: grid; grid-template-columns: auto 1fr auto; gap: .75rem; align-items: center; padding: .6rem .9rem; border-radius: .7rem; background: var(--surface-1); border: 1px solid var(--border-default); }
  .n { width: 1.8rem; height: 1.8rem; display: grid; place-items: center; border-radius: 50%; background: var(--accent-primary-alpha); color: var(--accent); font-weight: 700; } .n.bad { background: color-mix(in srgb, var(--error) 18%, transparent); color: var(--error); }
  .q { color: var(--text-primary); font-weight: 600; } .m { font-size: .78rem; color: var(--text-muted); } .m a { color: inherit; text-decoration: none; } .m a:hover { color: var(--accent); } .k, .t { display: inline-block; margin-right: .35rem; padding: 0 .45rem; border-radius: 999px; background: var(--surface-2); text-transform: uppercase; font-size: .62rem; letter-spacing: .06em; } .t { text-transform: none; color: var(--error); }
  .empty { display: block; text-align: center; color: var(--text-muted); padding: 2rem 0; } .more { margin: 1rem auto; display: block; padding: .5rem 1.5rem; border-radius: .5rem; border: 1px solid var(--border-default); color: var(--text-primary); background: var(--surface-2); }
  .skel { height: 6rem; width: 100%; border-radius: 1rem; background: var(--surface-2); }
</style>
