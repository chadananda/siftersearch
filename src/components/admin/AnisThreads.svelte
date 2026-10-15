<script>
  // Anís Threads (/admin/anis#threads; Chad 10-12): every conversation, each reply with the strategy auditor's verdict —
  // "audit each interaction to determine if a better search strategy was warranted". List + the open thread, round by round.
  import { onMount, tick } from 'svelte';
  import { marked } from 'marked';
  import { admin } from '../../lib/api.js';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';

  const auth = getAuthState();
  let days = $state(30);
  let filter = $state('all');
  let list = $state(null);
  let error = $state(null);
  let openId = $state(null);
  let thread = $state(null);
  let threadError = $state(null);
  let gaps = $state(null);

  const GAP_SECTIONS = [['switches', 'Strategy the auditor would have used instead'], ['needs', 'Needs no strategy serves yet (new strategy / tool)'],
    ['shortfalls', 'Why answers fell short'], ['data_gaps', 'Data gaps'], ['problems', 'Problems by kind']];
  const FILTERS = [['all', 'All'], ['strategy', 'Better strategy warranted'], ['problems', 'Problems'], ['pending', 'Not yet audited']];
  const when = (s) => (s ? new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
  const who = (p) => p?.name && p?.email ? `${p.name} · ${p.email}` : p?.email || p?.name || 'unknown';
  const md = (t) => marked.parse(String(t || ''), { async: false });
  const tone = (v) => (v === 'right' || v === 'fully' ? 'text-success' : v === 'acceptable' || v === 'partly' ? 'text-warning' : v ? 'text-error' : 'text-muted');

  async function loadList() {
    error = null;
    try { list = await admin.getAnisThreads(days, filter); } catch (e) { error = e.message || 'Failed to load'; }
    admin.getAnisStrategyGaps(days).then((g) => { gaps = g; }).catch(() => { gaps = null; });
  }
  // 10-14 (Chad: "the accordion opening of one item jumps badly so I cannot see if it was opened"): opening a row closed
  // the one above it and the page reflowed under the pointer. Now the opened row is brought to the top of the view at
  // once (no smooth scroll), its header stays pinned while reading, and the open row is marked unmistakably.
  async function open(id) {
    if (openId === id) { openId = null; thread = null; history.replaceState(null, '', '#threads'); await tick(); toTop(id); return; }
    openId = id; thread = null; threadError = null;
    history.replaceState(null, '', `#threads:${id}`);
    await tick(); toTop(id);
    try { thread = await admin.getAnisThread(id); } catch (e) { threadError = e.message || 'Failed to load'; }
  }
  // Scroll ONLY when the row's header is out of view (Chad 10-15: "the active block should not move so long as it is
  // within the viewport") — on a refresh the browser restores the position and the row stays where it is.
  function toTop(id) {
    const top = document.getElementById(`thread-${id}`)?.getBoundingClientRect().top;
    if (top != null && (top < 0 || top > window.innerHeight - 48)) document.getElementById(`thread-${id}`).scrollIntoView({ block: 'start' });
  }

  // from the work queue: the thread may be outside the current filter — show All, open it, bring it into view
  async function openFromGap(id) {
    if (!list?.threads.some((t) => t.id === id)) { filter = 'all'; await loadList(); }
    if (openId !== id) await open(id);
    else toTop(id);
  }

  onMount(async () => {
    await initAuth();
    if (!['admin', 'superadmin'].includes(auth.user?.tier)) { error = auth.user ? 'Admins only.' : 'Sign in as an admin to see the threads.'; return; }
    await loadList();
    const want = location.hash.match(/^#threads:(.+)$/)?.[1];
    if (want) open(decodeURIComponent(want));
  });
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center gap-2">
    {#each FILTERS as [id, label] (id)}
      <button class="px-3 py-1 rounded-full border text-sm {filter === id ? 'bg-accent text-white border-accent' : 'border-border text-secondary hover:text-primary'}"
        onclick={() => { filter = id; loadList(); }}>{label}</button>
    {/each}
    <select class="ml-auto px-2 py-1 rounded border border-border bg-surface-1 text-sm text-primary" bind:value={days} onchange={loadList} aria-label="Window">
      <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option>
    </select>
  </div>

  {#if gaps && gaps.audited}
    <details open class="rounded-md border border-border-subtle bg-surface-1 px-4 py-3">
      <summary class="cursor-pointer font-medium text-primary">What the audits ask for — the strategy work queue
        <span class="text-sm font-normal text-secondary">({gaps.warranted} of {gaps.audited} audited replies warranted a better strategy)</span></summary>
      <div class="mt-3 grid gap-4 md:grid-cols-2">
        {#each GAP_SECTIONS as [key, label] (key)}
          {#if gaps[key]?.length}
            <div class="flex flex-col gap-1 min-w-0">
              <h3 class="text-sm font-semibold text-primary">{label}</h3>
              <ul class="flex flex-col gap-1 text-sm">
                {#each gaps[key] as g (g.key)}
                  <li class="min-w-0">
                    <span class="text-warning tabular-nums">{g.n}×</span> <span class="text-primary">{g.key}</span>
                    {#if g.route}<span class="text-secondary"> — {g.route}</span>{/if}
                    <span class="text-xs">{#each g.threads as id, i (id)} <button class="text-accent hover:text-accent-hover" onclick={() => openFromGap(id)}>#{i + 1}</button>{/each}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        {/each}
      </div>
    </details>
  {/if}

  {#if error}<p class="text-error">{error}</p>
  {:else if !list}<p class="text-muted">Loading…</p>
  {:else}
    <p class="text-sm text-secondary">
      {list.totals.threads} threads · {list.totals.replies} replies · {list.totals.audited} audited ·
      <span class={list.totals.better_strategy ? 'text-warning' : ''}>{list.totals.better_strategy} where a better strategy was warranted</span> ·
      {list.totals.problems} problems noted
    </p>
    {#if !list.threads.length}<p class="text-muted">Nothing here for this filter.</p>{/if}
    <div class="flex flex-col gap-2">
      {#each list.threads as t (t.id)}
        {@const isOpen = openId === t.id}
        <div id="thread-{t.id}" class="thread rounded-md border {isOpen ? 'border-accent border-2' : 'border-border-subtle'} bg-surface-1">
          <button class="w-full text-left px-4 py-3 flex flex-col gap-1 {isOpen ? 'sticky top-0 z-10 bg-surface-2 rounded-t-md border-b border-border' : 'hover:bg-surface-2'}"
            onclick={() => open(t.id)} aria-expanded={isOpen}>
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span class="chev text-accent" class:open={isOpen} aria-hidden="true">▸</span>
              <span class="font-medium text-primary">{who(t.person)}</span>
              <span class="text-xs text-muted uppercase tracking-wide">{t.channel || '—'}</span>
              <span class="text-xs text-muted">{when(t.last_at)} · {t.replies} {t.replies === 1 ? 'reply' : 'replies'}</span>
              <span class="ml-auto flex flex-wrap gap-1 text-xs">
                {#if t.better_strategy}<span class="px-2 py-0.5 rounded-full bg-surface-2 text-warning">better strategy ×{t.better_strategy}</span>{/if}
                {#if t.not_answered}<span class="px-2 py-0.5 rounded-full bg-surface-2 text-error">not fully answered ×{t.not_answered}</span>{/if}
                {#if t.problems}<span class="px-2 py-0.5 rounded-full bg-surface-2 text-error">problems ×{t.problems}</span>{/if}
                {#if t.pending}<span class="px-2 py-0.5 rounded-full bg-surface-2 text-muted">{t.pending} awaiting audit</span>{/if}
              </span>
            </div>
            <span class="text-sm text-secondary {isOpen ? 'line-clamp-1' : 'line-clamp-2'}">{t.title || t.first_question || '(no question)'}</span>
            {#if isOpen}<span class="text-xs text-accent">Open — click here to close</span>
            {:else if t.latest_summary}<span class="text-sm {t.latest_summary === 'fine' ? 'text-success' : 'text-primary'}">Latest audit: {t.latest_summary}</span>{/if}
          </button>

          {#if isOpen}
            <div class="px-4 py-4 flex flex-col gap-6">
              {#if threadError}<p class="text-error">{threadError}</p>
              {:else if !thread}<p class="text-muted">Loading thread…</p>
              {:else}
                {#each thread.rounds as r, i (r.round)}
                  <section class="round grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem] {i ? 'pt-6 border-t border-border-subtle' : ''}">
                    <div class="flex flex-col gap-3 min-w-0">
                      <div class="text-xs font-semibold uppercase tracking-wide text-muted">Exchange {i + 1} of {thread.rounds.length}</div>
                      {#if r.question}
                        <div class="rounded-md bg-surface-2 px-3 py-2">
                          <div class="text-xs text-muted mb-1"><b class="text-secondary">{who(thread.person)}</b> wrote · {when(r.question.at)}</div>
                          <div class="text-primary whitespace-pre-wrap">{r.question.text}</div>
                        </div>
                      {/if}
                      {#if r.reply}
                        <div class="pl-3 border-l-2 border-accent">
                          <div class="text-xs text-muted mb-1"><b class="text-secondary">Anís</b> replied · {when(r.reply.at)} · {r.reply.status}</div>
                          <div class="reply text-primary text-sm">{@html md(r.reply.text)}</div>
                        </div>
                      {:else}<p class="text-sm text-muted">No reply in this exchange.</p>{/if}
                    </div>
                    {#if r.reply}
                      {@const a = r.reply.audit}
                      <aside class="audit rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm flex flex-col gap-1 self-start lg:sticky lg:top-28">
                        <div class="text-xs font-semibold uppercase tracking-wide text-muted">Audit of this reply</div>
                        <div class="text-xs text-muted">
                          {#if r.reply.route.gate}{r.reply.route.gate} · {/if}{#if r.reply.route.strategy}strategy <b>{r.reply.route.strategy}</b> · {/if}{#if r.reply.route.format}format {r.reply.route.format} · {/if}{#if r.reply.route.retrieved != null}{r.reply.route.retrieved} passages{/if}
                        </div>
                        {#if a.state === 'pending'}<span class="text-muted">Not audited yet.</span>
                        {:else if a.state === 'error'}<span class="text-error">Audit failed{a.error ? `: ${a.error}` : ''}</span>
                        {:else}
                          <div class="font-medium {a.summary === 'fine' ? 'text-success' : 'text-primary'}">{a.summary || '—'}</div>
                          <dl class="grid grid-cols-[auto_1fr] gap-x-2 text-secondary">
                            <dt>Strategy</dt><dd><span class={tone(a.strategy_verdict)}>{a.strategy_used} ({a.strategy_verdict})</span>{#if a.best_strategy && a.best_strategy !== a.strategy_used} → <b class="text-warning">{a.best_strategy}</b>{/if}</dd>
                            <dt>Answered</dt><dd><span class={tone(a.answered)}>{a.answered}</span>{#if a.cause && a.cause !== 'none'} ({a.cause}){/if}</dd>
                            <dt>Format</dt><dd><span class={tone(a.format_fit)}>{a.format_fit}</span>{#if a.better_format && a.better_format !== 'none'} → {a.better_format}{/if}</dd>
                          </dl>
                          {#if a.better_strategy_warranted}<div class="text-warning">Better strategy warranted: {a.why}</div>{/if}
                          {#if a.new_strategy?.suggested}<div class="text-warning">New strategy needed: {a.new_strategy.need}{#if a.new_strategy.route} — {a.new_strategy.route}{/if}</div>{/if}
                          {#if a.problems.length}
                            <ul class="list-disc pl-5 text-error">
                              {#each a.problems as p, j (j)}<li><span class="text-xs uppercase tracking-wide">{p.where} · {p.kind}</span> — {p.detail}</li>{/each}
                            </ul>
                          {/if}
                          {#if a.data_gap}<div class="text-secondary">Data gap: {a.data_gap}</div>{/if}
                          {#if a.reader_feedback}<div class="text-secondary">Reader feedback ({a.reader_feedback.justified || '?'}): {a.reader_feedback.summary}{#if a.reader_feedback.fix && a.reader_feedback.fix !== 'none'} → {a.reader_feedback.fix}{/if}</div>{/if}
                        {/if}
                      </aside>
                    {/if}
                  </section>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .thread { scroll-margin-top: 0.5rem; }
  .chev { display: inline-block; transition: transform 0.15s; }
  .chev.open { transform: rotate(90deg); }
  .reply :global(p) { margin: 0 0 0.6rem; }
  .reply :global(blockquote) { margin: 0.5rem 0; padding-left: 0.75rem; border-left: 2px solid var(--border-default); color: var(--text-secondary); }
  .reply :global(table) { font-size: 0.8rem; border-collapse: collapse; display: block; overflow-x: auto; }
  .reply :global(td), .reply :global(th) { padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--border-subtle); vertical-align: top; }
  .reply :global(pre) { overflow-x: auto; font-size: 0.75rem; }
  .reply :global(a) { color: var(--accent-primary); }
</style>
