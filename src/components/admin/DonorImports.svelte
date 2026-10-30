<script>
  // Donor-drive review (/admin/imports; planning/donor-intake-plan-20261030.md phase C): a tab per drive grouped by donor; Main grouped by kind,
  // covenant-breaker books apart, set-aside collapsed. Server-paged (100/page) so 20k+ rows stay fast. Deps: api.admin.*Import*.
  import { untrack } from 'svelte';
  import { admin } from '../../lib/api.js';

  const PAGE = 100;
  const KINDS = [['book', 'Books'], ['scan', 'Scans'], ['talk', 'Talks'], ['video', 'Videos'], ['photo-set', 'Photo sets']];
  const MATCHES = { actionable: ['new', 'version', 'unsure'], all: [], new: ['new'], version: ['version'], unsure: ['unsure'], held: ['held'], copy: ['copy'] };
  const DECISIONS = [['undecided', 'Undecided'], ['', 'All'], ['approve', 'Approved'], ['deny', 'Denied'], ['more_info', 'More info']];
  const BADGE = { new: 'text-success border-success', version: 'text-accent border-accent', unsure: 'text-warning border-warning', held: 'text-muted border-border', copy: 'text-muted border-border', junk: 'text-muted border-border' };
  const DECIDED = { approve: ['Approved', 'text-success'], deny: ['Denied', 'text-error'], more_info: ['More info', 'text-warning'] };

  let donors = $state(null), error = $state(null);
  let driveId = $state(new URLSearchParams(globalThis.location?.search || '').get('drive') || '');
  let matchKey = $state('actionable'), decision = $state('undecided'), q = $state(''), qLive = $state('');
  let groups = $state({});          // key → { items, offset, more, loading, error }
  let selected = $state({});        // key → Set-like object { [id]: true }
  let noteFor = $state(null), noteText = $state('');
  let asideOpen = $state(false), busy = $state(false);

  const drives = $derived((donors ?? []).flatMap((d) => d.drives));
  const drive = $derived(drives.find((d) => d.id === driveId) ?? drives[0]);
  const fmtN = (n) => (n ?? 0).toLocaleString();
  const fmtDur = (s) => (!s ? '' : s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`);
  const fmtBytes = (b) => (!b ? '' : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

  /** Rows in the drive's grouped counts that pass the filters (the text query is not counted). Covenant-breaker ignores the match filter. */
  function countOf(d, { section, kind, filtered = true }) {
    const ms = section === 'main' ? MATCHES[matchKey] : [];
    return (d?.counts?.rows ?? []).filter((r) => r.section === section && (!kind || r.kind === kind)
      && (!filtered || ((!ms.length || ms.includes(r.match))
        && (decision === '' || (decision === 'undecided' ? r.decision == null : r.decision === decision)))))
      .reduce((n, r) => n + r.n, 0);
  }
  const sectionTotal = (d, s, kind) => countOf(d, { section: s, kind, filtered: false });

  async function loadDonors() {
    try { donors = (await admin.getImportsDonorsDrives()).donors; } catch (e) { error = e.message; }
  }
  $effect(() => { loadDonors(); });

  function filtersFor(key) {
    const [section, kind] = key.split(':');
    const f = { section, kind: kind || '', q };
    if (section === 'main') { f.match = MATCHES[matchKey].join(','); f.decision = decision; }
    if (section === 'covenant-breaker') f.decision = decision;
    return f;
  }
  async function load(key, append = false) {
    if (!drive) return;
    const g = groups[key] ?? { items: [], offset: 0, more: false };
    const offset = append ? g.offset + PAGE : 0;
    groups[key] = { ...g, loading: true, error: null };
    try {
      const r = await admin.getImportItems(drive.id, { ...filtersFor(key), limit: PAGE, offset });
      groups[key] = { items: append ? [...g.items, ...r.items] : r.items, offset, more: r.more, loading: false };
      if (!append) selected[key] = {};
    } catch (e) { groups[key] = { ...g, loading: false, error: e.message }; }
  }
  function reloadAll() {
    groups = {}; selected = {};
    for (const [k] of KINDS) load(`main:${k}`);
    load('covenant-breaker');
    if (asideOpen) load('set-aside');
  }
  // Reload whenever the drive or a filter changes (q applies on Enter / blur, not per keystroke).
  $effect(() => { void drive?.id; void matchKey; void decision; void q; if (drive) untrack(reloadAll); });

  function pickDrive(id) {
    driveId = id; asideOpen = false;
    try { const u = new URL(location.href); u.searchParams.set('drive', id); history.replaceState(null, '', u); } catch {}
  }

  let countsTimer;
  const refreshCountsSoon = () => { clearTimeout(countsTimer); countsTimer = setTimeout(loadDonors, 1500); };
  function patch(item) {
    for (const k of Object.keys(groups)) {
      const i = groups[k].items.findIndex((x) => x.id === item.id);
      if (i >= 0) groups[k].items[i] = item;
    }
  }
  async function decide(it, d, note = null) {
    try { patch((await admin.decideImportItem(it.id, d, note)).item); refreshCountsSoon(); } catch (e) { alert(e.message); }
  }
  async function sendNote(it) {
    if (!noteText.trim()) return;
    await decide(it, 'more_info', noteText.trim()); noteFor = null; noteText = '';
  }
  const selIds = (key) => Object.keys(selected[key] ?? {}).filter((id) => selected[key][id]).map(Number);
  function toggleAll(key, on) { selected[key] = on ? Object.fromEntries((groups[key]?.items ?? []).map((x) => [x.id, true])) : {}; }
  async function bulk(key, d) {
    const ids = selIds(key);
    if (!ids.length || !confirm(`${d === 'approve' ? 'Approve' : 'Deny'} ${ids.length} item(s)?`)) return;
    busy = true;
    try {
      await admin.decideImportItems(ids, d);
      for (const k of Object.keys(groups)) groups[k].items = groups[k].items.map((x) => (ids.includes(x.id) ? { ...x, decision: d, decision_note: null } : x));
      selected[key] = {}; refreshCountsSoon();
    } catch (e) { alert(e.message); } finally { busy = false; }
  }
  const copy = (t) => navigator.clipboard?.writeText(t).catch(() => {});
</script>

{#snippet row(it, key)}
  {@const dec = DECIDED[it.decision]}
  {@const copies = it.metadata?.copies ?? (it.rel_paths?.length || 1)}
  <li class="py-3 border-b border-border-subtle flex gap-3 {it.decision ? 'opacity-80' : ''}">
    <input type="checkbox" class="mt-1 shrink-0" aria-label="Select {it.title}" checked={!!selected[key]?.[it.id]}
      onchange={(e) => (selected[key] = { ...(selected[key] ?? {}), [it.id]: e.currentTarget.checked })} />
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span class="font-medium text-primary break-words">{it.title || '(untitled)'}</span>
        {#if it.year}<span class="text-secondary text-sm">{it.year}</span>{/if}
        {#if it.creator}<span class="text-secondary text-sm">· {it.creator}</span>{/if}
        <span class="text-xs px-1.5 rounded border {BADGE[it.match] ?? 'text-muted border-border'}">{it.match ?? '—'}</span>
        <span class="text-xs text-muted">{it.kind} · {fmtN(it.files)} file{it.files === 1 ? '' : 's'}{copies > 1 ? ` · ${copies} copies` : ''}{it.bytes ? ` · ${fmtBytes(it.bytes)}` : ''}{it.duration_s ? ` · ${fmtDur(it.duration_s)}` : ''}{it.score != null ? ` · score ${Math.round(it.score)}` : ''}</span>
      </div>
      {#if it.why}<p class="text-sm text-secondary mt-0.5">{it.why}</p>{/if}
      {#if it.destination}<p class="text-xs text-muted mt-0.5">→ {it.destination}</p>{/if}
      <button class="text-xs text-muted hover:text-primary mt-0.5 text-left break-all font-mono" title="Copy path" onclick={() => copy(it.primary_rel)}>{it.primary_rel}</button>
      {#if dec}
        <p class="text-xs mt-1"><b class={dec[1]}>{dec[0]}</b>{#if it.decision_note} — {it.decision_note}{/if}{#if it.decided_by} <span class="text-muted">· {it.decided_by}</span>{/if}</p>
      {/if}
      {#if noteFor === it.id}
        <form class="mt-2 flex gap-2" onsubmit={(e) => { e.preventDefault(); sendNote(it); }}>
          <input class="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-border bg-surface-0 text-primary" placeholder="What should the worker look into?" bind:value={noteText} />
          <button class="px-2 py-1 text-sm rounded bg-accent text-white" type="submit">Send</button>
          <button class="px-2 py-1 text-sm text-muted" type="button" onclick={() => (noteFor = null)}>Cancel</button>
        </form>
      {/if}
    </div>
    <div class="shrink-0 flex flex-col sm:flex-row gap-1 items-end sm:items-start">
      <button class="px-2 py-1 text-xs rounded border {it.decision === 'approve' ? 'border-success text-success' : 'border-border text-secondary hover:text-success'}" onclick={() => decide(it, it.decision === 'approve' ? null : 'approve')}>Approve</button>
      <button class="px-2 py-1 text-xs rounded border {it.decision === 'deny' ? 'border-error text-error' : 'border-border text-secondary hover:text-error'}" onclick={() => decide(it, it.decision === 'deny' ? null : 'deny')}>Deny</button>
      <button class="px-2 py-1 text-xs rounded border {it.decision === 'more_info' ? 'border-warning text-warning' : 'border-border text-secondary hover:text-warning'}" onclick={() => { noteFor = it.id; noteText = it.decision_note ?? ''; }}>More info</button>
    </div>
  </li>
{/snippet}

{#snippet group(key, title, total)}
  {@const g = groups[key]}
  {@const sel = selIds(key).length}
  <section class="mb-6">
    <div class="flex flex-wrap items-center gap-3 border-b border-border pb-1 mb-1">
      <h3 class="text-lg font-semibold text-primary">{title} <span class="text-sm font-normal text-muted">{fmtN(total)}</span></h3>
      {#if g?.items?.length}
        <label class="text-xs text-muted flex items-center gap-1"><input type="checkbox" checked={sel > 0 && sel === g.items.length} onchange={(e) => toggleAll(key, e.currentTarget.checked)} /> select page</label>
        {#if sel}
          <span class="text-xs text-secondary">{sel} selected</span>
          <button disabled={busy} class="px-2 py-0.5 text-xs rounded border border-success text-success" onclick={() => bulk(key, 'approve')}>Approve selected</button>
          <button disabled={busy} class="px-2 py-0.5 text-xs rounded border border-error text-error" onclick={() => bulk(key, 'deny')}>Deny selected</button>
        {/if}
      {/if}
    </div>
    {#if g?.error}<p class="text-error text-sm">{g.error}</p>{/if}
    {#if g?.items?.length}
      <ul>{#each g.items as it (it.id)}{@render row(it, key)}{/each}</ul>
      {#if g.more}<button class="mt-2 text-sm text-accent hover:text-accent-hover" disabled={g.loading} onclick={() => load(key, true)}>{g.loading ? 'Loading…' : `Load ${PAGE} more (${fmtN(g.items.length)} shown)`}</button>{/if}
    {:else if g?.loading || !g}<p class="text-muted text-sm py-2">Loading…</p>
    {:else}<p class="text-muted text-sm py-2">Nothing here with these filters.</p>{/if}
  </section>
{/snippet}

<div class="p-6 max-w-6xl">
  <h1 class="text-2xl font-semibold text-primary mb-1">Donor imports</h1>
  <p class="text-muted mb-4">Each donated drive, catalogued and ranked. Approve what should enter the library, deny the rest, or ask for more information. Decisions survive re-cataloguing.</p>
  {#if error}<p class="text-error mb-4">{error}</p>{/if}

  {#if !donors}<p class="text-muted">Loading…</p>
  {:else if !drives.length}<p class="text-muted">No drives catalogued yet.</p>
  {:else}
    <div class="flex flex-wrap gap-x-6 gap-y-2 border-b border-border mb-4" role="tablist">
      {#each donors.filter((d) => d.drives.length) as dn (dn.id)}
        <div class="flex items-end gap-1">
          <span class="text-xs text-muted pb-2 mr-1">{dn.name}{#if dn.drives.length > 1} <a class="text-accent hover:text-accent-hover" href="/admin/imports/report?donor={encodeURIComponent(dn.id)}" title="Printable report covering every drive from {dn.name}">report</a>{/if}</span>
          {#each dn.drives as dr (dr.id)}
            <button role="tab" aria-selected={drive?.id === dr.id} onclick={() => pickDrive(dr.id)}
              class="px-3 py-2 text-sm font-medium border-b-2 -mb-px {drive?.id === dr.id ? 'border-accent text-primary' : 'border-transparent text-muted hover:text-primary'}">
              {dr.label || dr.id}
              <span class="ml-1 font-normal text-xs text-muted">{fmtN(dr.counts?.section?.main)} main · {fmtN(dr.counts?.decision?.undecided)} open</span>
            </button>
          {/each}
        </div>
      {/each}
    </div>

    {#if drive}
      <p class="text-sm text-secondary mb-3">
        <b class="text-primary">{drive.label || drive.id}</b> · {drive.status} · {fmtN(drive.counts?.total)} items
        {#each Object.entries(drive.counts?.match ?? {}) as [m, n] (m)}<span class="ml-2"><span class={(BADGE[m] ?? 'text-muted').split(' ')[0]}>{m}</span> {fmtN(n)}</span>{/each}
        · <span class="text-success">{fmtN(drive.counts?.decision?.approve)} approved</span> · <span class="text-error">{fmtN(drive.counts?.decision?.deny)} denied</span> · <span class="text-warning">{fmtN(drive.counts?.decision?.more_info)} more info</span>
        · <a class="text-accent hover:text-accent-hover" href="/admin/imports/report?drive={encodeURIComponent(drive.id)}">Printable report</a>
        · <a class="text-accent hover:text-accent-hover" href="/admin/imports/report?donor={encodeURIComponent(drive.donor_id)}">all from {donors.find((x) => x.id === drive.donor_id)?.name ?? 'this donor'}</a>
      </p>

      <div class="flex flex-wrap gap-3 items-center mb-5 text-sm">
        <label class="text-muted">Match
          <select class="ml-1 px-2 py-1 rounded border border-border bg-surface-0 text-primary" bind:value={matchKey}>
            <option value="actionable">new · version · unsure</option><option value="all">all</option>
            {#each ['new', 'version', 'unsure', 'held', 'copy'] as m (m)}<option value={m}>{m}</option>{/each}
          </select>
        </label>
        <label class="text-muted">Decision
          <select class="ml-1 px-2 py-1 rounded border border-border bg-surface-0 text-primary" bind:value={decision}>
            {#each DECISIONS as [v, l] (v)}<option value={v}>{l}</option>{/each}
          </select>
        </label>
        <input class="px-2 py-1 rounded border border-border bg-surface-0 text-primary min-w-0 w-64" placeholder="Search title, author, path (Enter)" bind:value={qLive}
          onkeydown={(e) => { if (e.key === 'Enter') q = qLive.trim(); }} onblur={() => (q = qLive.trim())} />
      </div>

      <h2 class="text-xl font-semibold text-primary mb-2">Main <span class="text-sm font-normal text-muted">{fmtN(sectionTotal(drive, 'main'))} items</span></h2>
      {#each KINDS as [k, label] (k)}
        {#if sectionTotal(drive, 'main', k)}
          {@render group(`main:${k}`, label, countOf(drive, { section: 'main', kind: k }))}
        {/if}
      {/each}

      {#if sectionTotal(drive, 'covenant-breaker')}
        <h2 class="text-xl font-semibold text-primary mt-8 mb-1">Covenant-breaker books</h2>
        <p class="text-sm text-muted mb-2">Kept apart from the main ranking. Author and year are shown so works written before the break can be picked.</p>
        {@render group('covenant-breaker', 'Covenant-breaker', countOf(drive, { section: 'covenant-breaker' }))}
      {/if}

      <h2 class="text-xl font-semibold text-primary mt-8 mb-2">
        <button class="hover:text-accent" onclick={() => { asideOpen = !asideOpen; if (asideOpen && !groups['set-aside']) load('set-aside'); }}>
          {asideOpen ? '▾' : '▸'} Set aside <span class="text-sm font-normal text-muted">{fmtN(sectionTotal(drive, 'set-aside'))} junk and copies</span>
        </button>
      </h2>
      {#if asideOpen}{@render group('set-aside', 'Set aside', sectionTotal(drive, 'set-aside'))}{/if}
    {/if}
  {/if}
</div>
