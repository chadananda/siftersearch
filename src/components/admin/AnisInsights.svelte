<script module>
  // Shared by every tab on the page: one request per window size.
  const shared = new Map();   // days → promise
</script>

<script>
  // One tab of the Anís hub (/admin/anis): activity · costs · assessment · system1. All four share ONE fetch of
  // /api/admin/anis/overview (module-level promise), so opening the page costs one request.
  import { usd } from '../../lib/money.js';
  import { onMount } from 'svelte';
  import { admin } from '../../lib/api.js';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';

  let { view = 'activity' } = $props();
  const auth = getAuthState();
  let data = $state(null);
  let error = $state(null);
  let days = $state(30);

  function load(d) {
    if (!shared.has(d)) shared.set(d, admin.getAnisOverview(d));
    return shared.get(d);
  }

  async function refresh() {
    error = null;
    try { data = await load(days); } catch (e) { error = e.message || 'Failed to load'; }
  }

  onMount(async () => { await initAuth(); if (['admin', 'superadmin'].includes(auth.user?.tier)) refresh(); });

  const num = (n) => (n == null ? '—' : Number(n).toLocaleString());
  const entries = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]);
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  let byDay = $derived.by(() => {
    const m = new Map();
    for (const r of data?.activity?.byDay || []) m.set(r.day, (m.get(r.day) || 0) + r.n);
    return [...m.entries()];
  });
  let dayMax = $derived(Math.max(1, ...byDay.map(([, n]) => n)));
  let channels = $derived.by(() => {
    const m = {};
    for (const r of data?.activity?.byDay || []) m[r.channel] = (m[r.channel] || 0) + r.n;
    return m;
  });
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-center gap-2 text-sm text-secondary">
    <span>Window</span>
    {#each [7, 30, 90] as d}
      <button class="px-2 py-1 rounded border border-border {days === d ? 'bg-accent text-white' : 'bg-surface-1 text-primary'}"
        onclick={() => { days = d; refresh(); }}>{d} days</button>
    {/each}
  </div>

  {#if error}
    <p class="text-error">{error}</p>
  {:else if !data}
    <p class="text-secondary">Loading…</p>
  {:else if view === 'activity'}
    {@const a = data.activity}
    {#if a.available === false}<p class="text-error">Activity unavailable: {a.error}</p>{:else}
      <div class="flex flex-wrap gap-6">
        <div><div class="text-2xl font-semibold text-primary">{num(a.replies)}</div><div class="text-xs text-muted">replies · {a.days}d</div></div>
        <div><div class="text-2xl font-semibold text-primary">{num(a.people)}</div><div class="text-xs text-muted">people</div></div>
        {#each entries(channels) as [ch, n]}
          <div><div class="text-2xl font-semibold text-primary">{num(n)}</div><div class="text-xs text-muted">{ch}</div></div>
        {/each}
      </div>
      {#if byDay.length}
        <div class="flex items-end gap-1 h-28 border-b border-border-subtle" aria-label="Replies per day">
          {#each byDay as [day, n]}
            <div class="flex-1 bg-accent/70 rounded-t-sm min-w-1" style="height: {(n / dayMax) * 100}%" title="{day}: {n}"></div>
          {/each}
        </div>
      {/if}
      <div class="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 class="text-sm font-semibold text-primary">What each turn became</h3>
          <ul class="text-sm">
            {#each a.byPath as p}<li class="flex justify-between border-b border-border-subtle py-1"><span class="text-primary">{p.path}</span><span class="text-secondary">{num(p.n)} · {pct(p.n, a.replies)}</span></li>{/each}
          </ul>
        </div>
        <div>
          <h3 class="text-sm font-semibold text-primary">Search strategy chosen</h3>
          <ul class="text-sm">
            {#each a.byStrategy || [] as p}<li class="flex justify-between border-b border-border-subtle py-1"><span class="text-primary">{p.strategy}</span><span class="text-secondary">{num(p.n)} · {pct(p.n, a.replies)}</span></li>{/each}
          </ul>
        </div>
      </div>
      <h3 class="text-sm font-semibold text-primary">Recent questions</h3>
      <ul class="flex flex-col gap-1 text-sm">
        {#each a.recent || [] as r}
          <li class="flex flex-wrap gap-x-3 border-b border-border-subtle py-1">
            <span class="text-primary flex-1 min-w-0">{r.question || '—'}</span>
            <span class="text-secondary">{r.strategy || r.path}{r.format ? ` → ${r.format}` : ''} · {r.channel} · {String(r.at || '').slice(0, 16)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if view === 'costs'}
    {@const c = data.costs}
    {#if c.available === false}<p class="text-error">Costs unavailable: {c.error}</p>{:else}
      {@const audit = data.assessment?.usd || 0}
      <div class="flex flex-wrap gap-6">
        <div><div class="text-2xl font-semibold text-primary">{usd(c.usd)}</div><div class="text-xs text-muted">Anís calls · {c.days}d</div></div>
        <div><div class="text-2xl font-semibold text-primary">{usd(audit)}</div><div class="text-xs text-muted">assessment audits · {c.days}d</div></div>
        <div><div class="text-2xl font-semibold text-primary">{usd(c.usd + audit)}</div><div class="text-xs text-muted">total</div></div>
        <div><div class="text-2xl font-semibold text-primary">{data.activity?.replies ? usd((c.usd + audit) / data.activity.replies) : '—'}</div><div class="text-xs text-muted">per reply</div></div>
      </div>
      {#if c.unpriced?.length}
        <p class="text-sm text-warning">Unpriced (calls counted, cost unknown until a rate is set): {c.unpriced.join(', ')}</p>
      {/if}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-muted"><th class="py-1">Caller</th><th>Model</th><th class="text-right">Calls</th><th class="text-right">Tokens in / out</th><th class="text-right">Cost</th></tr></thead>
          <tbody>
            {#each c.rows as r}
              <tr class="border-t border-border-subtle"><td class="py-1 text-primary">{r.caller}</td><td class="text-secondary">{r.provider} · {r.model}</td>
                <td class="text-right">{num(r.calls)}</td><td class="text-right">{num(r.input_tokens)} / {num(r.output_tokens)}</td>
                <td class="text-right">{c.unpriced?.includes(r.model) ? 'unpriced' : usd(r.usd)}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {:else if view === 'assessment'}
    {@const s = data.assessment}
    {#if !s?.available}<p class="text-secondary">No assessment store on the server yet.</p>{:else}
      <p class="text-sm text-secondary">Every Anís exchange is audited after the fact: was the search strategy right, did the evidence answer, did the format fit, what went wrong.</p>
      <div class="flex flex-wrap gap-6">
        <div><div class="text-2xl font-semibold text-primary">{num(s.audited)}</div><div class="text-xs text-muted">audited · {s.days}d</div></div>
        <div><div class="text-2xl font-semibold text-primary">{num(s.errors)}</div><div class="text-xs text-muted">audit errors</div></div>
        <div><div class="text-2xl font-semibold text-primary">{usd(s.usd)}</div><div class="text-xs text-muted">audit cost</div></div>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        {#each [['Strategy', s.strategy], ['Evidence answered', s.answered], ['Format fit', s.format], ['Problems', s.problems]] as [label, t]}
          <div><h3 class="font-semibold text-primary mb-1">{label}</h3>
            <ul>{#each entries(t) as [k, n]}<li class="flex justify-between"><span class="text-secondary">{k}</span><span class="text-primary">{n}</span></li>{/each}</ul></div>
        {/each}
      </div>
      <h3 class="text-sm font-semibold text-primary">Recent audits</h3>
      <ul class="flex flex-col gap-2 text-sm">
        {#each s.recent as r}
          <li class="p-2 rounded border border-border-subtle bg-surface-1">
            <div class="text-secondary">#{r.message_id} · {r.channel} · {r.asked_at || ''} · strategy {r.strategy || '—'} ({r.verdict || r.status}{r.best && r.best !== r.strategy ? `, better: ${r.best}` : ''}) · answered {r.answered || '—'}</div>
            {#each r.problems as p}<div class="text-primary mt-1"><strong>{p.kind}</strong> — {p.detail}</div>{/each}
          </li>
        {/each}
      </ul>
    {/if}
  {:else if view === 'system1'}
    {@const y = data.system1}
    {#if !y?.available}<p class="text-secondary">No System-1 log on the server.</p>{:else}
      <p class="text-sm text-secondary">The fast decisions behind each turn (triage, search plan, format, source resolution, persona check). Jev serves today; Clef shadows it, and agreement is the evidence for switching a task to Clef.</p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-muted"><th class="py-1">Task</th><th>Served by</th><th class="text-right">Calls · {y.days}d</th></tr></thead>
          <tbody>{#each y.calls as r}<tr class="border-t border-border-subtle"><td class="py-1 text-primary">{r.task}</td><td class="text-secondary">{r.served_by}</td><td class="text-right">{num(r.n)}</td></tr>{/each}</tbody>
        </table>
      </div>
      <h3 class="text-sm font-semibold text-primary">Clef agreement with Jev</h3>
      {#if !y.agreement.length}<p class="text-sm text-secondary">No shadow comparisons in this window.</p>{:else}
        <ul class="text-sm">{#each y.agreement as g}<li class="flex justify-between border-b border-border-subtle py-1"><span class="text-primary">{g.task} · {g.backend}</span><span class="text-secondary">{g.same}/{g.compared} · {pct(g.same, g.compared)}</span></li>{/each}</ul>
      {/if}
    {/if}
  {/if}
</div>
