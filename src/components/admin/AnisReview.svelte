<script>
  // Review what the edge Anís generates (Chad 11-13), from tower's mirror: questions (the research cache — curate or retire
  // a cached answer — and the question log), conversations, and the documents he made. One component, `view` picks the tab.
  import { onMount } from 'svelte';
  import { admin } from '../../lib/api.js';

  let { view = 'questions' } = $props();
  let data = $state(null), error = $state(null), open = $state(null), status = $state(''), days = $state(30), sync = $state(null);

  const when = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '—');
  const kb = (b) => `${Math.max(1, Math.round(b / 1024))} KB`;

  async function refresh() {
    error = null; data = null; open = null;
    try {
      if (view === 'questions') {
        const [s, q] = await Promise.all([admin.getAnisReview(`edge/sets${status ? `?status=${status}` : ''}`), admin.getAnisReview(`edge/questions?days=${days}`)]);
        data = { sets: s.sets, questions: q.questions };
      } else if (view === 'conversations') data = await admin.getAnisReview(`edge/conversations?days=${days}`);
      else data = await admin.getAnisReview('documents');
      const st = await admin.getAnisReview('edge/status').catch(() => null);
      sync = st?.anis?.reduce((m, t) => (t.synced_at > m ? t.synced_at : m), '') || null;
    } catch (e) { error = e.message || 'Failed to load'; }
  }
  async function openSet(id) { open = open?.id === id ? null : await admin.getAnisReview(`edge/sets/${id}`).catch((e) => ({ id, error: e.message })); }
  async function openConv(id) { open = open?.conversation?.id === id ? null : await admin.getAnisReview(`edge/conversations/${encodeURIComponent(id)}`).catch((e) => ({ error: e.message })); }
  async function setStatus(s, to) {
    try { const r = await admin.setAnisSetStatus(s.id, to); s.status = r.status; if (open?.id === s.id) open.status = r.status; }
    catch (e) { error = e.message; }
  }

  onMount(refresh);
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center gap-2 text-sm text-secondary">
    {#if view !== 'documents'}
      <span>Window</span>
      {#each [7, 30, 90] as d}
        <button class="px-2 py-1 rounded border border-border {days === d ? 'bg-accent text-white' : 'bg-surface-1 text-primary'}" onclick={() => { days = d; refresh(); }}>{d} days</button>
      {/each}
    {/if}
    {#if view === 'questions'}
      <span class="ml-3">Cache</span>
      {#each [['', 'all'], ['candidate', 'candidate'], ['curated', 'curated'], ['stale', 'retired']] as [v, label]}
        <button class="px-2 py-1 rounded border border-border {status === v ? 'bg-accent text-white' : 'bg-surface-1 text-primary'}" onclick={() => { status = v; refresh(); }}>{label}</button>
      {/each}
    {/if}
    <span class="ml-auto text-xs text-muted">{view === 'documents' ? 'tower copy: /tank/documents/anis' : `mirrored from the edge${sync ? ` · last sync ${sync} UTC` : ''}`}</span>
  </div>

  {#if error}<p class="text-error">{error}</p>{/if}
  {#if !data && !error}<p class="text-secondary">Loading…</p>
  {:else if data && view === 'questions'}
    <h3 class="text-sm font-semibold text-primary">Research cache · {data.sets.length}</h3>
    <p class="text-xs text-muted">A cached answer serves every reader who asks the same question. Curate a good one so it is kept; retire a weak one so the next reader gets fresh research.</p>
    <ul class="flex flex-col text-sm">
      {#each data.sets as s (s.id)}
        <li class="border-b border-border-subtle py-1">
          <div class="flex flex-wrap items-center gap-x-3">
            <button class="text-left text-primary flex-1 min-w-0 hover:text-accent" onclick={() => openSet(s.id)}>{s.question}</button>
            <span class="text-secondary">{s.passages} passages · {s.hits} hits · {when(s.updated_at)}</span>
            <span class="px-1.5 rounded text-xs {s.status === 'curated' ? 'bg-success/20 text-success' : s.status === 'stale' ? 'bg-error/15 text-error' : 'bg-surface-2 text-secondary'}">{s.status === 'stale' ? 'retired' : s.status}</span>
            {#if s.status !== 'curated'}<button class="text-xs text-accent hover:text-accent-hover" onclick={() => setStatus(s, 'curated')}>Curate</button>{/if}
            {#if s.status !== 'stale'}<button class="text-xs text-error" onclick={() => setStatus(s, 'stale')}>Retire</button>{/if}
            {#if s.status === 'stale'}<button class="text-xs text-accent" onclick={() => setStatus(s, 'candidate')}>Restore</button>{/if}
          </div>
          {#if open?.id === s.id}
            <div class="mt-2 ml-3 flex flex-col gap-2">
              {#if open.error}<p class="text-error">{open.error}</p>{/if}
              {#each open.passages || [] as p, i}
                <div class="text-sm border-l-2 border-border pl-2">
                  <div class="text-xs text-muted">{i + 1}. {p.title || p.doc_title || ''}{p.author ? ` — ${p.author}` : ''}{p.role ? ` · ${p.role}` : ''}</div>
                  <div class="text-primary">{(p.text || p.content || '').slice(0, 600)}</div>
                </div>
              {/each}
              {#if open.asked?.length}
                <div class="text-xs text-muted">Asked as: {open.asked.map((a) => `“${a.question}” (${a.outcome}${a.site ? `, ${a.site}` : ''})`).join(' · ')}</div>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    <h3 class="text-sm font-semibold text-primary">Questions asked · {data.questions.length}</h3>
    <ul class="flex flex-col text-sm">
      {#each data.questions as q (q.id)}
        <li class="flex flex-wrap gap-x-3 border-b border-border-subtle py-1">
          <span class="text-primary flex-1 min-w-0">{q.question}</span>
          <span class="text-secondary">{q.outcome}{q.similarity != null ? ` ${Number(q.similarity).toFixed(2)}` : ''} · {q.site || q.channel || '—'}{q.ms ? ` · ${(q.ms / 1000).toFixed(1)} s` : ''} · {when(q.at)}</span>
        </li>
      {/each}
    </ul>
  {:else if data && view === 'conversations'}
    <ul class="flex flex-col text-sm">
      {#each data.conversations as c (c.id)}
        <li class="border-b border-border-subtle py-1">
          <div class="flex flex-wrap gap-x-3">
            <button class="text-left text-primary flex-1 min-w-0 hover:text-accent" onclick={() => openConv(c.id)}>{c.first_question || c.id}</button>
            <span class="text-secondary">{Math.ceil(c.turns / 2)} turns · {c.site || c.channel || '—'} · {when(c.updated_at)}</span>
          </div>
          {#if open?.conversation?.id === c.id}
            <div class="mt-2 ml-3 flex flex-col gap-2">
              {#each open.turns as t}
                <div class="border-l-2 {t.role === 'user' ? 'border-accent' : 'border-border'} pl-2">
                  <div class="text-xs text-muted">{t.role === 'user' ? 'Reader' : 'Anís'} · round {t.round} · {when(t.at)}{t.meta?.timings?.total_ms ? ` · ${(t.meta.timings.total_ms / 1000).toFixed(1)} s` : ''}</div>
                  <div class="text-primary whitespace-pre-wrap">{t.content}</div>
                </div>
              {/each}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if data}
    <ul class="flex flex-col text-sm">
      {#each data.documents as d (d.key)}
        <li class="flex flex-wrap gap-x-3 border-b border-border-subtle py-1">
          {#if d.short}<a class="text-primary flex-1 min-w-0 hover:text-accent" href={d.short} target="_blank" rel="noopener">{d.title}</a>
          {:else}<span class="text-primary flex-1 min-w-0">{d.title}</span>{/if}
          <span class="text-secondary">{kb(d.bytes)} · {d.cached ? 'shared' : 'personal'} · {d.at.slice(0, 16).replace('T', ' ')}</span>
        </li>
      {:else}<li class="text-secondary">No documents yet.</li>{/each}
    </ul>
  {/if}
</div>
