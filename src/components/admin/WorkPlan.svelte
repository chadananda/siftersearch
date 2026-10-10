<script>
  // The WorkPlan (Chad 10-10): live checklist of the feature queue. In progress (with Claude's latest status line),
  // the ordered Queue (move up/down, start, block, done), Blocked (and on whom), Done in the last 30 days. Add items.
  // Refreshes every 30 s. Data: /api/admin/workplan → D1 on the edge (worker/ops/workplan.js).
  import { onMount } from 'svelte';
  import { admin } from '../../lib/api.js';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';

  const auth = getAuthState();
  let items = $state([]);
  let error = $state(null);
  let busy = $state(false);
  let draft = $state({ title: '', detail: '', area: '' });

  const by = (s) => items.filter((i) => i.status === s);
  let doing = $derived(by('in_progress'));
  let queue = $derived(by('queued').sort((a, b) => a.position - b.position || a.id - b.id));
  let blocked = $derived(by('blocked'));
  let done = $derived(by('done').sort((a, b) => String(b.done_at).localeCompare(String(a.done_at))));

  async function load() {
    try { items = (await admin.getWorkPlan()).items || []; error = null; } catch (e) { error = e.message || 'Failed to load'; }
  }
  async function act(fn) { busy = true; try { await fn(); await load(); } catch (e) { error = e.message; } finally { busy = false; } }
  const set = (id, patch) => act(() => admin.updateWorkItem(id, patch));
  function move(id, dir) {
    const ids = queue.map((q) => q.id), i = ids.indexOf(id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    act(() => admin.reorderWorkPlan(ids));
  }
  function add(e) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    const d = { ...draft };
    draft = { title: '', detail: '', area: '' };
    act(() => admin.addWorkItem(d));
  }
  const when = (s) => (s ? String(s).slice(0, 16).replace('T', ' ') : '');

  onMount(() => {
    let t;
    (async () => { await initAuth(); if (['admin', 'superadmin'].includes(auth.user?.tier)) { await load(); t = setInterval(load, 30000); } })();
    return () => clearInterval(t);
  });
</script>

<div class="flex flex-col gap-6">
  {#if error}<p class="text-error text-sm">{error}</p>{/if}

  <section>
    <h2 class="text-sm font-semibold uppercase tracking-wider text-muted mb-2">In progress</h2>
    {#if !doing.length}<p class="text-secondary text-sm">Nothing in progress.</p>{/if}
    <ul class="flex flex-col gap-2">
      {#each doing as i (i.id)}
        <li class="rounded-lg border border-accent/40 bg-surface-1 p-3">
          <div class="flex flex-wrap items-baseline gap-2">
            <span class="text-primary font-medium">{i.title}</span>
            {#if i.area}<span class="text-xs text-muted">{i.area}</span>{/if}
            <span class="ml-auto text-xs text-muted">started {when(i.started_at)}</span>
          </div>
          {#if i.note}<p class="text-sm text-accent mt-1">{i.note}</p>{/if}
          {#if i.detail}<p class="text-sm text-secondary mt-1">{i.detail}</p>{/if}
          <div class="flex gap-2 mt-2 text-xs">
            <button class="px-2 py-1 rounded border border-border" disabled={busy} onclick={() => set(i.id, { status: 'done' })}>Done</button>
            <button class="px-2 py-1 rounded border border-border" disabled={busy} onclick={() => set(i.id, { status: 'queued' })}>Back to queue</button>
            <button class="px-2 py-1 rounded border border-border" disabled={busy} onclick={() => set(i.id, { status: 'blocked', blocked_on: 'chad' })}>Blocked</button>
          </div>
        </li>
      {/each}
    </ul>
  </section>

  <section>
    <h2 class="text-sm font-semibold uppercase tracking-wider text-muted mb-2">Queue <span class="normal-case tracking-normal">— top is next</span></h2>
    <ol class="flex flex-col gap-1">
      {#each queue as i, n (i.id)}
        <li class="flex items-start gap-2 rounded-md border border-border-subtle bg-surface-1 px-3 py-2">
          <span class="text-muted text-sm w-6 shrink-0 tabular-nums">{n + 1}</span>
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-baseline gap-2"><span class="text-primary">{i.title}</span>{#if i.area}<span class="text-xs text-muted">{i.area}</span>{/if}</div>
            {#if i.detail}<p class="text-sm text-secondary">{i.detail}</p>{/if}
          </div>
          <div class="flex gap-1 text-xs shrink-0">
            <button class="px-1.5 py-0.5 rounded border border-border" title="Up" disabled={busy || n === 0} onclick={() => move(i.id, -1)}>↑</button>
            <button class="px-1.5 py-0.5 rounded border border-border" title="Down" disabled={busy || n === queue.length - 1} onclick={() => move(i.id, 1)}>↓</button>
            <button class="px-1.5 py-0.5 rounded border border-border" disabled={busy} onclick={() => set(i.id, { status: 'in_progress' })}>Start</button>
            <button class="px-1.5 py-0.5 rounded border border-border" disabled={busy} onclick={() => set(i.id, { status: 'dropped' })}>Drop</button>
          </div>
        </li>
      {/each}
    </ol>
    <form class="flex flex-wrap gap-2 mt-3" onsubmit={add}>
      <input class="flex-1 min-w-48 rounded border border-border bg-surface-0 px-2 py-1 text-sm text-primary" placeholder="New feature…" bind:value={draft.title} />
      <input class="w-32 rounded border border-border bg-surface-0 px-2 py-1 text-sm text-primary" placeholder="area" bind:value={draft.area} />
      <input class="w-full rounded border border-border bg-surface-0 px-2 py-1 text-sm text-primary" placeholder="detail (optional)" bind:value={draft.detail} />
      <button class="px-3 py-1 rounded bg-accent text-white text-sm" disabled={busy}>Add to queue</button>
    </form>
  </section>

  {#if blocked.length}
    <section>
      <h2 class="text-sm font-semibold uppercase tracking-wider text-muted mb-2">Blocked</h2>
      <ul class="flex flex-col gap-1">
        {#each blocked as i (i.id)}
          <li class="rounded-md border border-warning/40 bg-surface-1 px-3 py-2 text-sm">
            <span class="text-primary">{i.title}</span>
            <span class="text-warning"> — on {i.blocked_on || '?'}</span>{#if i.note}<span class="text-secondary">: {i.note}</span>{/if}
            <button class="ml-2 px-1.5 py-0.5 rounded border border-border text-xs" disabled={busy} onclick={() => set(i.id, { status: 'queued' })}>Unblock</button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section>
    <h2 class="text-sm font-semibold uppercase tracking-wider text-muted mb-2">Done — last 30 days</h2>
    <ul class="flex flex-col gap-0.5 text-sm">
      {#each done as i (i.id)}<li class="text-secondary"><span class="text-success">✓</span> {i.title} <span class="text-muted text-xs">{when(i.done_at)}</span></li>{/each}
    </ul>
  </section>
</div>
