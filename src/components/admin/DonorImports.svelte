<script>
  // Donor intake desk (/admin/imports; planning/donor-intake-plan-20261030.md): drive tabs → section/kind navigator → ranked list → detail pane.
  // Kind reads from icon + hue alone (--kind-* tokens). Keyboard triage: J/K move, A import, S skip, Q ask, U clear, Space listen, X select.
  // Server-paged (100/page, auto-loads on scroll). Deps: api.admin.*Import*, svcFixed (title pages via the image service).
  import { untrack, tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { admin } from '../../lib/api.js';
  import { svcFixed } from '../../lib/imagekit.js';
  // title pages are written by archive-sample to the public `siftersearch` bucket, which the image service resizes (/img/a/…)
  const R2 = 'https://pub-e57ab96621a24ba18bcce728b4c51de2.r2.dev/';
  const titleImg = (key, w, h) => svcFixed(`${R2}${key}`, w, h);

  const PAGE = 100;
  const ACT = ['new', 'version', 'unsure'];
  const KIND = {
    talk: { label: 'Talks', one: 'talk' }, video: { label: 'Videos', one: 'video' }, book: { label: 'Books & docs', one: 'document' },
    scan: { label: 'Scanned pages', one: 'scan' }, 'photo-set': { label: 'Photo sets', one: 'photo set' }, junk: { label: 'Junk', one: 'junk' },
  };
  const KIND_ORDER = ['talk', 'video', 'book', 'scan', 'photo-set', 'junk'];
  const SECTIONS = [
    { id: 'main', label: 'Candidates', icon: 'inbox', hint: 'Ranked best first' },
    { id: 'covenant-breaker', label: 'Covenant-breaker', icon: 'shield', hint: 'Kept apart from the ranking' },
    { id: 'set-aside', label: 'Set aside', icon: 'archive', hint: 'Junk, copies, photo sets' },
  ];
  const MATCH = {
    new: { label: 'New', icon: 'spark', cls: 'm-new', tip: 'Not in the library' },
    version: { label: 'Better copy', icon: 'up', cls: 'm-version', tip: 'The library holds a weaker copy' },
    unsure: { label: 'Unsure', icon: 'dashed', cls: 'm-unsure', tip: 'Possibly in the library; check' },
    held: { label: 'In library', icon: 'library', cls: 'm-held', tip: 'Already in the library' },
    copy: { label: 'Copy', icon: 'copy', cls: 'm-held', tip: 'Another copy of an item on this drive' },
    junk: { label: 'Junk', icon: 'ban', cls: 'm-held', tip: 'Set aside as junk' },
  };
  const DECISIONS = [['open', 'To decide'], ['approve', 'Import'], ['deny', 'Skip'], ['more_info', 'Asked'], ['', 'All']];
  const DEC = { approve: { label: 'Import', icon: 'check', cls: 'd-approve' }, deny: { label: 'Skip', icon: 'x', cls: 'd-deny' }, more_info: { label: 'Asked', icon: 'ask', cls: 'd-ask' } };

  // Lucide-style 24px stroke paths
  const ICON = {
    talk: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
    video: '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><path d="M8 7h8"/><path d="M8 11h6"/>',
    scan: '<path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z"/><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/>',
    'photo-set': '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    junk: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    ask: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    spark: '<path d="M12 3l1.9 5.8L20 10.7l-5.8 1.9L12 18.4l-1.9-5.8L4 10.7l5.8-1.9Z"/>',
    up: '<circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/>',
    dashed: '<circle cx="12" cy="12" r="10" stroke-dasharray="4 3"/><path d="M12 16h.01"/><path d="M12 8v4"/>',
    library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    reply: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  };

  let donors = $state(null), error = $state(null);
  const qs = new URLSearchParams(globalThis.location?.search || '');
  let driveId = $state(qs.get('drive') || '');
  let section = $state(qs.get('section') || 'main');
  let kind = $state(qs.get('kind') ?? 'talk');
  let matches = $state(ACT);
  let decision = $state('open');
  let q = $state(''), qLive = $state('');

  let items = $state([]), more = $state(false), loading = $state(false), listError = $state(null), offset = 0, loadSeq = 0;
  let focusId = $state(null);
  const selected = new SvelteSet();
  let lastClicked = null;
  let asking = $state(false), askText = $state('');
  let toast = $state(null), toastTimer;
  let searchEl = $state(), askEl = $state(), listEl = $state(), sentinel = $state(), audioEl = $state();

  const drives = $derived((donors ?? []).flatMap((d) => d.drives));
  const drive = $derived(drives.find((d) => d.id === driveId) ?? drives[0]);
  const donorOf = (dr) => donors?.find((d) => d.id === dr?.donor_id);
  const focused = $derived(items.find((x) => x.id === focusId) ?? null);
  const focusIdx = $derived(items.findIndex((x) => x.id === focusId));

  const fmtN = (n) => (n ?? 0).toLocaleString();
  const fmtDur = (s) => (!s ? '' : s >= 3600 ? `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}m` : `${Math.max(1, Math.round(s / 60))} min`);
  const fmtBytes = (b) => (!b ? '' : b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
  const fmtDate = (t) => (t ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
  const ext = (it) => (it.metadata?.ext || it.primary_rel?.split('.').pop() || '').toUpperCase().slice(0, 4);
  const copiesOf = (it) => it.metadata?.copies ?? (it.rel_paths?.length || 1);
  const pathsOf = (it) => [it.primary_rel, ...(it.metadata?.also ?? [])].filter(Boolean);
  const isMedia = (it) => it.kind === 'talk' || it.kind === 'video';
  const speechPct = (s) => (s?.speech_s != null ? Math.round((100 * s.speech_s) / (s.clip?.secs || 60)) : null);
  const excerpt = (it) => (it.sample?.text || '').replace(/\s+/g, ' ').trim();
  const why = (it) => (it.sample?.rec?.why || it.why || '').replace(/\s*First minute:.*$/s, '');

  // ── counts (from the drive's grouped rows) ──
  const rowsOf = (sec, k) => (drive?.counts?.rows ?? []).filter((r) => r.section === sec && (!k || r.kind === k));
  const passDecision = (r) => decision === '' || (decision === 'open' ? r.decision == null : r.decision === decision);
  const passMatch = (r) => r.section !== 'main' || !matches.length || matches.includes(r.match);
  const sum = (rows) => rows.reduce((n, r) => n + r.n, 0);
  // a drive's open queue: undecided candidates (main new/version/unsure + covenant-breaker), never the set-aside pile
  const openOf = (dr) => sum((dr.counts?.rows ?? []).filter((r) => r.decision == null && (r.section === 'covenant-breaker' || (r.section === 'main' && ACT.includes(r.match)))));
  const shown = (sec, k) => sum(rowsOf(sec, k).filter((r) => passMatch(r) && passDecision(r)));
  function progress(sec, k) {
    const pool = rowsOf(sec, k).filter((r) => sec !== 'main' || ACT.includes(r.match));
    const total = sum(pool), done = sum(pool.filter((r) => r.decision != null));
    return { total, done, pct: total ? (100 * done) / total : 0 };
  }
  const kindsIn = (sec) => KIND_ORDER.filter((k) => sum(rowsOf(sec, k)) > 0);
  const matchChips = $derived(Object.keys(MATCH).map((m) => ({ m, n: sum(rowsOf(section, kind).filter((r) => r.match === m && passDecision(r))) })).filter((c) => c.n));
  const deciding = $derived.by(() => {
    const p = ['main', 'covenant-breaker'].map((s) => progress(s));
    const all = (drive?.counts?.rows ?? []).filter((r) => r.section !== 'set-aside' && (r.section !== 'main' || ACT.includes(r.match)));
    const by = (d) => sum(all.filter((r) => r.decision === d));
    return { total: p[0].total + p[1].total, done: p[0].done + p[1].done, approve: by('approve'), deny: by('deny'), ask: by('more_info') };
  });

  // ── data ──
  async function loadDonors() {
    try { donors = (await admin.getImportsDonorsDrives()).donors; } catch (e) { error = e.message; }
  }
  $effect(() => { loadDonors(); });

  async function load(append = false) {
    if (!drive) return;
    const seq = ++loadSeq;
    const off = append ? offset + PAGE : 0;
    loading = true; listError = null;
    const f = { section, kind: kind || '', q, limit: PAGE, offset: off };
    if (section === 'main') f.match = matches.join(',');
    if (section !== 'set-aside' || decision) f.decision = decision === 'open' ? 'undecided' : decision;
    try {
      const r = await admin.getImportItems(drive.id, f);
      if (seq !== loadSeq) return;
      items = append ? [...items, ...r.items] : r.items; more = r.more; offset = off;
      if (!append) { selected.clear(); focusId = r.items[0]?.id ?? null; listEl?.scrollTo?.({ top: 0 }); }
    } catch (e) { if (seq === loadSeq) listError = e.message; } finally { if (seq === loadSeq) loading = false; }
  }
  $effect(() => {
    void drive?.id; void section; void kind; void matches; void decision; void q;
    if (drive) untrack(() => load());
  });
  $effect(() => {   // keep the place in the URL so a reload lands on the same queue
    const d = drive?.id, s = section, k = kind;
    if (!d) return;
    try { const u = new URL(location.href); u.searchParams.set('drive', d); u.searchParams.set('section', s); u.searchParams.set('kind', k); history.replaceState(null, '', u); } catch {}
  });
  $effect(() => {   // infinite scroll
    if (!sentinel) return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting && more && !loading) load(true); }, { root: listEl, rootMargin: '600px' });
    io.observe(sentinel);
    return () => io.disconnect();
  });

  function pickDrive(id) { driveId = id; section = 'main'; kind = 'talk'; }
  function pick(sec, k) {
    section = sec; kind = k;
    if (sec !== 'main') matches = ACT;
  }
  function toggleMatch(m) { matches = matches.includes(m) ? matches.filter((x) => x !== m) : [...matches, m]; }

  let countsTimer;
  const refreshCountsSoon = () => { clearTimeout(countsTimer); countsTimer = setTimeout(loadDonors, 1200); };
  function flash(msg, undo = null) {
    clearTimeout(toastTimer); toast = { msg, undo };
    toastTimer = setTimeout(() => (toast = null), undo ? 8000 : 4000);
  }
  const patch = (item) => { const i = items.findIndex((x) => x.id === item.id); if (i >= 0) items[i] = item; };

  async function decide(it, d, note = null, advance = false) {
    if (!it) return;
    const before = { ...it };
    patch({ ...it, decision: d, decision_note: note });
    if (advance) step(1);
    try { patch((await admin.decideImportItem(it.id, d, note)).item); refreshCountsSoon(); }
    catch (e) { patch(before); flash(`Not saved: ${e.message}`); }
  }
  async function bulk(d) {
    const ids = [...selected];
    if (!ids.length) return;
    const prev = new Map(items.filter((x) => selected.has(x.id)).map((x) => [x.id, x.decision]));
    items = items.map((x) => (selected.has(x.id) ? { ...x, decision: d, decision_note: null } : x));
    selected.clear();
    try {
      await admin.decideImportItems(ids, d); refreshCountsSoon();
      flash(`${d === 'approve' ? 'Import' : 'Skip'}: ${ids.length} item${ids.length === 1 ? '' : 's'}`, async () => {
        items = items.map((x) => (prev.has(x.id) ? { ...x, decision: prev.get(x.id) } : x));
        await admin.decideImportItems(ids, null).catch((e) => flash(`Undo failed: ${e.message}`)); refreshCountsSoon();
      });
    } catch (e) { items = items.map((x) => (prev.has(x.id) ? { ...x, decision: prev.get(x.id) } : x)); flash(`Not saved: ${e.message}`); }
  }
  function openAsk() { if (!focused) return; asking = true; askText = focused.decision === 'more_info' ? (focused.decision_note ?? '') : ''; tick().then(() => askEl?.focus()); }
  async function sendAsk() {
    if (!askText.trim()) return;
    const it = focused; asking = false;
    await decide(it, 'more_info', askText.trim(), true); askText = '';
  }

  function step(dir) {
    if (!items.length) return;
    const i = Math.min(items.length - 1, Math.max(0, (focusIdx < 0 ? -1 : focusIdx) + dir));
    focus(items[i].id);
    if (i >= items.length - 6 && more && !loading) load(true);
  }
  function focus(id) {
    if (focusId !== id) { asking = false; stopAudio(); }
    focusId = id;
    tick().then(() => document.getElementById(`it-${id}`)?.scrollIntoView({ block: 'nearest' }));
  }
  function clickSelect(e, it) {
    e.stopPropagation();
    const on = !selected.has(it.id);
    if (e.shiftKey && lastClicked != null) {
      const a = items.findIndex((x) => x.id === lastClicked), b = items.findIndex((x) => x.id === it.id);
      for (const x of items.slice(Math.min(a, b), Math.max(a, b) + 1)) on ? selected.add(x.id) : selected.delete(x.id);
    } else on ? selected.add(it.id) : selected.delete(it.id);
    lastClicked = it.id;
  }
  function selectPage(on) { selected.clear(); if (on) for (const x of items) selected.add(x.id); }
  const copyText = (t) => navigator.clipboard?.writeText(t).then(() => flash('Path copied')).catch(() => {});

  // ── audio: one player for the whole desk; clip URLs are signed per item on demand ──
  const clipUrls = {};
  let playingId = $state(null), paused = $state(true), cur = $state(0), dur = $state(0), clipErr = $state(null);
  async function togglePlay(it) {
    if (!it?.sample?.clip?.key || !audioEl) return;
    if (playingId === it.id) { audioEl.paused ? audioEl.play() : audioEl.pause(); return; }
    clipErr = null;
    try {
      clipUrls[it.id] ||= (await admin.getImportClip(it.id)).url;
      playingId = it.id; audioEl.src = clipUrls[it.id]; await audioEl.play();
    } catch (e) { clipErr = e.message; playingId = null; }
  }
  function stopAudio() { if (audioEl && !audioEl.paused) audioEl.pause(); playingId = null; cur = 0; }
  function seek(e) {
    if (!audioEl || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    audioEl.currentTime = ((e.clientX - r.left) / r.width) * dur;
  }

  function onKey(e) {
    const t = e.target;
    if (t?.closest?.('input, textarea, select, [contenteditable]')) {
      if (e.key === 'Escape') { t.blur(); asking = false; }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const act = {
      j: () => step(1), arrowdown: () => step(1), k: () => step(-1), arrowup: () => step(-1),
      a: () => decide(focused, 'approve', null, true), s: () => decide(focused, 'deny', null, true), q: openAsk,
      u: () => decide(focused, null), x: () => focused && (selected.has(focused.id) ? selected.delete(focused.id) : selected.add(focused.id)),
      ' ': () => togglePlay(focused), '/': () => searchEl?.focus(), escape: () => selected.clear(),
    }[k];
    if (act) { e.preventDefault(); act(); }
  }
</script>

<svelte:window onkeydown={onKey} />

{#snippet icon(name, size = 16, extra = '')}
  <svg class="ico {extra}" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html ICON[name] ?? ''}</svg>
{/snippet}

{#snippet tile(it, big = false)}
  {@const k = it.match === 'junk' ? 'junk' : it.kind}
  {@const img = it.sample?.title_image}
  <div class="tile k-{k} {big ? 'tile-big' : ''}" title={KIND[k]?.one ?? k}>
    {#if img}
      <img {...titleImg(img, big ? 240 : 40, big ? 320 : 52)} width={big ? 240 : 40} height={big ? 320 : 52} loading="lazy" alt="Title page of {it.title}" />
      <span class="tile-badge">{@render icon(k, big ? 14 : 10)}</span>
    {:else}
      {@render icon(k, big ? 40 : 18)}
      {#if !isMedia(it) && ext(it)}<span class="tile-ext">{it.kind === 'scan' ? `${fmtN(it.files)} pp` : ext(it)}</span>{/if}
      {#if isMedia(it) && it.duration_s}<span class="tile-ext">{fmtDur(it.duration_s)}</span>{/if}
    {/if}
  </div>
{/snippet}

{#snippet matchPill(m, withLabel = true)}
  {@const mm = MATCH[m]}
  {#if mm}<span class="pill {mm.cls}" title={mm.tip}>{@render icon(mm.icon, 12)}{#if withLabel}<span>{mm.label}</span>{/if}</span>{/if}
{/snippet}

{#snippet meta(it)}
  {@const s = it.sample ?? {}}
  {@const sp = speechPct(s)}
  <span class="meta">
    {#if it.creator}<span class="text-secondary">{it.creator}</span>{/if}
    {#if isMedia(it)}
      {#if it.duration_s}<span>{fmtDur(it.duration_s)}</span>{/if}
      {#if sp != null}<span class="speech" title="Speech in the first minute: {Math.round(s.speech_s)} of {s.clip?.secs || 60} s"><i style="--p:{Math.min(100, sp)}%"></i>{sp}% speech</span>{/if}
    {:else if it.kind === 'scan'}<span>{fmtN(it.files)} page images</span>
    {:else}<span>{ext(it)}</span>{#if s.pages}<span>{s.pages} pp</span>{/if}{/if}
    {#if s.language}<span class="uppercase">{s.language}</span>{/if}
    <span>{fmtBytes(it.bytes)}</span>
    {#if copiesOf(it) > 1}<span title="Identical copies on the drive">×{copiesOf(it)}</span>{/if}
  </span>
{/snippet}

{#snippet row(it)}
  {@const d = DEC[it.decision]}
  {@const s = it.sample ?? {}}
  {@const ex = excerpt(it)}
  <li id="it-{it.id}" class="row {d?.cls ?? ''} {focusId === it.id ? 'focused' : ''}" aria-selected={focusId === it.id}>
    <button class="row-hit" aria-label="Open {it.title}" onclick={() => focus(it.id)}></button>
    <label class="sel" title="Select (X) · shift-click for a range">
      <input type="checkbox" checked={selected.has(it.id)} onclick={(e) => clickSelect(e, it)} aria-label="Select {it.title}" />
    </label>
    <div class="row-tile">
      {@render tile(it)}
      {#if isMedia(it) && s.clip?.key}
        <button class="tile-play" aria-label="Play first minute" onclick={(e) => { e.stopPropagation(); focus(it.id); togglePlay(it); }}>
          {@render icon(playingId === it.id && !paused ? 'pause' : 'play', 16)}
        </button>
      {/if}
    </div>
    <div class="row-main">
      <div class="row-title">
        <span class="t">{it.title || '(untitled)'}</span>
        {#if it.year}<span class="yr">{it.year}</span>{/if}
        {#if it.info_answer && !it.decision}<span class="pill m-answer" title="A worker answered your question">{@render icon('reply', 12)}<span>Answer</span></span>{/if}
      </div>
      <div class="row-sub">
        {@render meta(it)}
        {#if ex}<span class="ex">“{ex.slice(0, 220)}”</span>
        {:else if s.queued && !s.sampled_at}<span class="ex muted-i">sampling on a worker…</span>
        {:else if s.error}<span class="ex muted-i">no sample: {s.error}</span>
        {:else if why(it)}<span class="ex">{why(it)}</span>{/if}
      </div>
    </div>
    <div class="row-match">{@render matchPill(it.match)}</div>
    <div class="row-acts">
      {#if it.imported_at}<span class="pill m-new" title={it.imported_ref}>{@render icon('library', 12)}<span>Imported</span></span>
      {:else}
        <button class="act a-approve {it.decision === 'approve' ? 'on' : ''}" title="Import (A)" aria-label="Import" onclick={(e) => { e.stopPropagation(); decide(it, it.decision === 'approve' ? null : 'approve'); }}>{@render icon('check', 16)}</button>
        <button class="act a-deny {it.decision === 'deny' ? 'on' : ''}" title="Skip (S)" aria-label="Skip" onclick={(e) => { e.stopPropagation(); decide(it, it.decision === 'deny' ? null : 'deny'); }}>{@render icon('x', 16)}</button>
        <button class="act a-ask {it.decision === 'more_info' ? 'on' : ''}" title="Ask a worker to look closer (Q)" aria-label="Ask" onclick={(e) => { e.stopPropagation(); focus(it.id); openAsk(); }}>{@render icon('ask', 16)}</button>
      {/if}
    </div>
  </li>
{/snippet}

<audio bind:this={audioEl} bind:paused bind:currentTime={cur} bind:duration={dur} onended={() => (playingId = null)} preload="none" class="hidden"></audio>

<div class="desk-root">
  {#if error}<p class="text-error mb-3">{error}</p>{/if}
  {#if !donors}<p class="text-muted p-6">Loading…</p>
  {:else if !drives.length}<p class="text-muted p-6">No drives catalogued yet. A new drive starts with an <code>archive-copy</code> job.</p>
  {:else}
    <!-- ── drives: one card per donated drive, grouped by donor ── -->
    <header class="drives" role="tablist" aria-label="Donated drives">
      {#each donors.filter((d) => d.drives.length) as dn (dn.id)}
        <div class="donor">
          <span class="donor-name">{dn.name}
            <a class="lnk" href="/admin/imports/report?donor={encodeURIComponent(dn.id)}" title="Printable report: everything from {dn.name}">{@render icon('printer', 12)}</a>
          </span>
          <div class="donor-drives">
            {#each dn.drives as dr (dr.id)}
              {@const on = drive?.id === dr.id}
              <button role="tab" aria-selected={on} class="drive {on ? 'on' : ''}" onclick={() => pickDrive(dr.id)}>
                <span class="drive-label">{dr.label || dr.id}</span>
                <span class="drive-n">{fmtN(openOf(dr))} to decide</span>
              </button>
            {/each}
          </div>
        </div>
      {/each}

      {#if drive}
        <div class="drive-facts">
          <div class="facts-line">
            <span>{drive.source || drive.root}</span>
            <span>{fmtN(drive.files)} files · {fmtBytes(drive.bytes)} · {fmtN(drive.counts?.total)} items</span>
          </div>
          <ol class="custody" aria-label="Custody">
            {#each [['received_at', 'Received'], ['copied_at', 'Copied'], ['verified_at', 'Verified'], ['returned_at', 'Returned']] as [f, l] (f)}
              <li class={drive[f] ? 'done' : ''} title={drive[f] ? fmtDate(drive[f]) : 'not recorded'}><i></i>{l}</li>
            {/each}
          </ol>
          <div class="overall" title="{fmtN(deciding.done)} of {fmtN(deciding.total)} candidates decided">
            <div class="bar">
              <i class="b-approve" style="width:{deciding.total ? (100 * deciding.approve) / deciding.total : 0}%"></i><i class="b-deny" style="width:{deciding.total ? (100 * deciding.deny) / deciding.total : 0}%"></i><i class="b-ask" style="width:{deciding.total ? (100 * deciding.ask) / deciding.total : 0}%"></i>
            </div>
            <span class="overall-n"><b>{fmtN(deciding.done)}</b> / {fmtN(deciding.total)} decided</span>
            <span class="legend"><i class="b-approve"></i>{fmtN(deciding.approve)} import <i class="b-deny"></i>{fmtN(deciding.deny)} skip <i class="b-ask"></i>{fmtN(deciding.ask)} asked</span>
          </div>
          <a class="lnk report" href="/admin/imports/report?drive={encodeURIComponent(drive.id)}">{@render icon('printer', 14)} Drive report</a>
        </div>
      {/if}
    </header>

    {#if drive}
      <div class="desk">
        <!-- ── navigator ── -->
        <nav class="rail" aria-label="Sections">
          {#each SECTIONS as sec (sec.id)}
            {@const ks = kindsIn(sec.id)}
            {#if ks.length}
              <div class="sec sec-{sec.id}">
                <button class="sec-head {section === sec.id && !kind ? 'on' : ''}" onclick={() => pick(sec.id, '')} title="{sec.hint} — show every kind">
                  {@render icon(sec.icon, 15)}<span class="sec-label">{sec.label}</span><span class="n">{fmtN(shown(sec.id))}</span>
                </button>
                {#each ks as k (k)}
                  {@const p = progress(sec.id, k)}
                  <button class="kind-item k-{k} {section === sec.id && kind === k ? 'on' : ''}" onclick={() => pick(sec.id, k)}>
                    <span class="kind-ico">{@render icon(k, 15)}</span>
                    <span class="kind-label">{KIND[k]?.label ?? k}</span>
                    <span class="n">{fmtN(shown(sec.id, k))}</span>
                    {#if sec.id !== 'set-aside' && p.total}<span class="prog" title="{fmtN(p.done)} of {fmtN(p.total)} decided"><i style="width:{p.pct}%"></i></span>{/if}
                  </button>
                {/each}
              </div>
            {/if}
          {/each}

          <div class="keys">
            <div><kbd>J</kbd><kbd>K</kbd> move</div>
            <div><kbd>A</kbd> import <kbd>S</kbd> skip</div>
            <div><kbd>Q</kbd> ask <kbd>U</kbd> clear</div>
            <div><kbd>Space</kbd> listen <kbd>X</kbd> select</div>
            <div><kbd>/</kbd> search</div>
          </div>
        </nav>

        <!-- ── queue ── -->
        <section class="queue" aria-label="Items">
          <div class="qhead">
            <div class="qtitle">
              {#if kind}<span class="qt-ico k-{kind}">{@render icon(kind, 18)}</span>{:else}<span class="qt-ico">{@render icon(SECTIONS.find((s) => s.id === section)?.icon ?? 'inbox', 18)}</span>{/if}
              <h2>{kind ? KIND[kind]?.label : 'Everything'}</h2>
              <span class="qt-sec">in {SECTIONS.find((s) => s.id === section)?.label}</span>
              <span class="qt-n">{fmtN(shown(section, kind))}</span>
              <label class="search">{@render icon('search', 14)}
                <input bind:this={searchEl} bind:value={qLive} placeholder="Title, author, path…" onkeydown={(e) => { if (e.key === 'Enter') q = qLive.trim(); }} onblur={() => (q = qLive.trim())} />
              </label>
            </div>
            <div class="qfilters">
              {#if section === 'main'}
                <div class="chips" role="group" aria-label="Library match">
                  {#each matchChips as c (c.m)}
                    <button class="chip {MATCH[c.m].cls} {matches.includes(c.m) ? 'on' : ''}" aria-pressed={matches.includes(c.m)} onclick={() => toggleMatch(c.m)} title={MATCH[c.m].tip}>
                      {@render icon(MATCH[c.m].icon, 12)}{MATCH[c.m].label}<span class="n">{fmtN(c.n)}</span>
                    </button>
                  {/each}
                </div>
              {:else if section === 'covenant-breaker'}
                <p class="cb-note">{@render icon('shield', 13)} Works by authors who later broke the Covenant. Each shows when the author broke, so works written before can be taken.</p>
              {:else}
                <p class="cb-note">Kept on the drive, never recommended. Look here only to rescue a misfiled item.</p>
              {/if}
              <div class="seg" role="group" aria-label="Decision">
                {#each DECISIONS as [v, l] (v)}
                  <button class={decision === v ? 'on' : ''} aria-pressed={decision === v} onclick={() => (decision = v)}>{l}</button>
                {/each}
              </div>
            </div>
            {#if selected.size}
              <div class="bulkbar">
                <b>{fmtN(selected.size)}</b> selected
                <button class="bb a-approve" onclick={() => bulk('approve')}>{@render icon('check', 14)} Import all</button>
                <button class="bb a-deny" onclick={() => bulk('deny')}>{@render icon('x', 14)} Skip all</button>
                <button class="bb-clear" onclick={() => selected.clear()}>Clear</button>
              </div>
            {:else if items.length}
              <div class="bulkbar quiet">
                <label><input type="checkbox" onchange={(e) => selectPage(e.currentTarget.checked)} /> Select the {fmtN(items.length)} loaded</label>
              </div>
            {/if}
          </div>

          <ul class="list" bind:this={listEl}>
            {#each items as it (it.id)}{@render row(it)}{/each}
            {#if listError}<li class="empty text-error">{listError}</li>
            {:else if loading && !items.length}<li class="empty">Loading…</li>
            {:else if !items.length}<li class="empty">Nothing here with these filters.</li>{/if}
            <li bind:this={sentinel} class="sentinel">{#if loading && items.length}Loading more…{:else if more}…{/if}</li>
          </ul>
        </section>

        <!-- ── detail ── -->
        <aside class="detail" aria-label="Item detail">
          {#if focused}
            {@const it = focused}
            {@const s = it.sample ?? {}}
            {@const rec = s.rec ?? {}}
            {@const d = DEC[it.decision]}
            <div class="d-head k-{it.kind}">
              <span class="d-kind">{@render icon(it.match === 'junk' ? 'junk' : it.kind, 14)} {KIND[it.kind]?.one ?? it.kind}</span>
              {@render matchPill(it.match)}
              {#if it.score != null}<span class="score" title="Recommendation score">{Math.round(it.score)}</span>{/if}
            </div>
            <h3 class="d-title">{it.title || '(untitled)'}</h3>
            <p class="d-by">{[it.creator, it.year].filter(Boolean).join(' · ')}</p>

            {#if isMedia(it)}
              {#if s.clip?.key}
                <div class="player">
                  <button class="pbtn" onclick={() => togglePlay(it)} aria-label={playingId === it.id && !paused ? 'Pause' : 'Play first minute'}>{@render icon(playingId === it.id && !paused ? 'pause' : 'play', 20)}</button>
                  <div class="ptrack" role="slider" tabindex="-1" aria-label="Seek" aria-valuemin="0" aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(cur)} onclick={seek} onkeydown={() => {}}>
                    <i style="width:{playingId === it.id && dur ? (100 * cur) / dur : 0}%"></i>
                  </div>
                  <span class="ptime">{playingId === it.id ? `${Math.floor(cur)}s` : 'first'} / {s.clip.secs ?? 60}s</span>
                </div>
                {#if clipErr && !playingId}<p class="d-note">No clip: {clipErr}</p>{/if}
              {:else if s.clip?.error}<p class="d-note">No clip: {s.clip.error}</p>
              {:else if s.queued}<p class="d-note">Sample queued on a worker.</p>{/if}
            {:else if s.title_image}
              <div class="d-page">{@render tile(it, true)}</div>
            {/if}

            {#if rec.title || rec.creator || rec.year}
              <dl class="d-rec">
                <dt>Sample suggests</dt>
                <dd>{[rec.title, rec.creator, rec.year].filter(Boolean).join(' · ')}</dd>
              </dl>
            {/if}

            {#if why(it)}<p class="d-why">{why(it)}</p>{/if}

            {#if it.info_answer}
              <div class="d-answer"><b>{@render icon('reply', 13)} Worker's answer</b><p>{it.info_answer}</p></div>
            {/if}

            {#if s.text}
              <figure class="d-text">
                <figcaption>{isMedia(it) ? 'First-minute transcript' : `First ${s.pages ?? ''} pages${s.ocr ? ' · OCR' : ''}`}{#if speechPct(s) != null} · {speechPct(s)}% speech{/if}</figcaption>
                <blockquote>{s.text}</blockquote>
              </figure>
            {:else if s.error}<p class="d-note">Sample failed: {s.error}</p>{/if}

            <dl class="d-facts">
              <dt>Goes to</dt><dd>{it.destination || '—'}</dd>
              <dt>Size</dt><dd>{fmtN(it.files)} file{it.files === 1 ? '' : 's'} · {fmtBytes(it.bytes)}{#if it.duration_s} · {fmtDur(it.duration_s)}{/if}</dd>
              <dt>{copiesOf(it) > 1 ? `${copiesOf(it)} copies` : 'Path'}</dt>
              <dd class="paths">
                {#each pathsOf(it).slice(0, 6) as p, i (p)}
                  <button class="path {i ? 'alt' : ''}" title="Copy path" onclick={() => copyText(p)}>{p}</button>
                {/each}
                {#if pathsOf(it).length > 6}<span class="text-muted text-xs">+{pathsOf(it).length - 6} more</span>{/if}
              </dd>
            </dl>

            <div class="d-actions">
              {#if it.imported_at}
                <p class="d-imported">{@render icon('library', 14)} Imported {fmtDate(it.imported_at)}{#if it.imported_ref} · {it.imported_ref}{/if}</p>
              {:else}
                <button class="big a-approve {it.decision === 'approve' ? 'on' : ''}" onclick={() => decide(it, it.decision === 'approve' ? null : 'approve', null, it.decision !== 'approve')}>{@render icon('check', 18)} Import <kbd>A</kbd></button>
                <button class="big a-deny {it.decision === 'deny' ? 'on' : ''}" onclick={() => decide(it, it.decision === 'deny' ? null : 'deny', null, it.decision !== 'deny')}>{@render icon('x', 18)} Skip <kbd>S</kbd></button>
                <button class="big a-ask {it.decision === 'more_info' ? 'on' : ''}" onclick={openAsk}>{@render icon('ask', 18)} Ask <kbd>Q</kbd></button>
              {/if}
            </div>
            {#if asking}
              <form class="d-askform" onsubmit={(e) => { e.preventDefault(); sendAsk(); }}>
                <textarea bind:this={askEl} bind:value={askText} rows="2" placeholder="What should a worker look into? (Enter to send, Esc to cancel)"
                  onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAsk(); } }}></textarea>
              </form>
            {/if}
            {#if d}
              <p class="d-decided {d.cls}">{@render icon(d.icon, 13)} {d.label}{#if it.decision_note} — {it.decision_note}{/if}{#if it.decided_by}<span class="text-muted"> · {it.decided_by}{#if it.decided_at}, {fmtDate(it.decided_at)}{/if}</span>{/if}</p>
            {/if}
          {:else}
            <div class="d-empty">{@render icon('arrow', 28)}<p>Pick an item, or press <kbd>J</kbd>.</p></div>
          {/if}
        </aside>
      </div>
    {/if}
  {/if}

  {#if toast}
    <div class="toast" role="status">{toast.msg}{#if toast.undo}<button onclick={() => { const u = toast.undo; toast = null; u(); }}>Undo</button>{/if}</div>
  {/if}
</div>

<style>
  .desk-root { --top: 4.25rem; --line: var(--border-default); font-size: 0.875rem; }
  .ico { flex-shrink: 0; display: block; }
  kbd { font-family: ui-monospace, monospace; font-size: 0.68rem; padding: 0 0.3rem; border: 1px solid var(--border-strong); border-bottom-width: 2px; border-radius: 4px; color: var(--text-secondary); background: var(--surface-1); }

  /* kind hues */
  .k-talk { --k: var(--kind-talk); } .k-video { --k: var(--kind-video); } .k-book { --k: var(--kind-book); }
  .k-scan { --k: var(--kind-scan); } .k-photo-set { --k: var(--kind-photo); } .k-junk { --k: var(--kind-junk); }

  /* ── drives strip ── */
  .drives { display: flex; align-items: stretch; gap: 1.5rem; padding: 0.25rem 0 0.75rem; border-bottom: 1px solid var(--line); margin-bottom: 0; flex-wrap: wrap; }
  .donor { display: flex; flex-direction: column; gap: 0.2rem; }
  .donor-name { display: flex; align-items: center; gap: 0.35rem; font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
  .donor-drives { display: flex; gap: 0.35rem; }
  .drive { display: flex; flex-direction: column; align-items: flex-start; padding: 0.35rem 0.8rem 0.4rem; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-0); color: var(--text-secondary); transition: border-color .15s, background .15s; }
  .drive:hover { border-color: var(--border-strong); }
  .drive.on { border-color: var(--accent); background: var(--accent-primary-alpha); color: var(--text-primary); }
  .drive-label { font-family: var(--font-marquee); font-size: 1.15rem; line-height: 1.15; letter-spacing: 0.01em; }
  .drive-n { font-size: 0.7rem; color: var(--text-muted); }
  .drive-facts { flex: 1; display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; gap: 0.35rem 1.5rem; align-items: center; min-width: 30rem; }
  .facts-line { display: flex; gap: 1.25rem; color: var(--text-secondary); font-size: 0.78rem; }
  .facts-line span + span { color: var(--text-muted); }
  .custody { display: flex; gap: 0.9rem; list-style: none; margin: 0; padding: 0; font-size: 0.7rem; color: var(--text-muted); justify-self: end; }
  .custody li { display: flex; align-items: center; gap: 0.3rem; }
  .custody i { width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--border-strong); }
  .custody li.done { color: var(--text-secondary); } .custody li.done i { background: var(--success); border-color: var(--success); }
  .overall { display: flex; align-items: center; gap: 0.8rem; font-size: 0.75rem; color: var(--text-muted); }
  .bar { display: flex; width: 16rem; height: 6px; border-radius: 3px; background: var(--surface-3); overflow: hidden; }
  .bar i { display: block; height: 100%; }
  .b-approve { background: var(--success); } .b-deny { background: var(--error); } .b-ask { background: var(--warning); }
  .overall-n { font-family: var(--font-dial); font-size: 0.95rem; letter-spacing: 0.02em; color: var(--text-secondary); }
  .overall-n b { color: var(--text-primary); font-weight: 700; }
  .legend { display: flex; align-items: center; gap: 0.35rem; }
  .legend i { width: 7px; height: 7px; border-radius: 2px; display: inline-block; margin-left: 0.35rem; }
  .lnk { color: var(--accent); display: inline-flex; align-items: center; gap: 0.3rem; }
  .lnk:hover { color: var(--accent-hover); }
  .report { justify-self: end; font-size: 0.78rem; }

  /* ── desk grid ── */
  .desk { display: grid; grid-template-columns: 232px minmax(0, 1fr) clamp(380px, 32%, 560px); align-items: start; }

  /* navigator */
  .rail { position: sticky; top: var(--top); max-height: calc(100vh - var(--top)); overflow-y: auto; padding: 0.75rem 0.75rem 1rem 0; border-right: 1px solid var(--line); }
  .sec + .sec { margin-top: 0.9rem; padding-top: 0.9rem; border-top: 1px solid var(--border-subtle); }
  .sec-head { width: 100%; display: flex; align-items: center; gap: 0.45rem; padding: 0.3rem 0.5rem; border-radius: 6px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-tertiary); }
  .sec-head:hover { color: var(--text-primary); } .sec-head.on { background: var(--surface-2); color: var(--text-primary); }
  .sec-covenant-breaker .sec-head { color: var(--warning); }
  .sec-label { flex: 1; text-align: left; }
  .n { font-family: var(--font-dial); font-weight: 600; font-size: 0.85rem; letter-spacing: 0.02em; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .kind-item { position: relative; width: 100%; display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 0.5rem; padding: 0.42rem 0.5rem 0.55rem; border-radius: 6px; color: var(--text-secondary); text-align: left; }
  .kind-item:hover { background: var(--surface-1); color: var(--text-primary); }
  .kind-item.on { background: color-mix(in oklab, var(--k) 13%, transparent); color: var(--text-primary); box-shadow: inset 3px 0 0 var(--k); }
  .kind-item.on .n { color: var(--text-primary); }
  .kind-ico { color: var(--k); display: grid; place-items: center; }
  .kind-label { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .prog { position: absolute; left: 2.25rem; right: 0.5rem; bottom: 0.22rem; height: 2px; border-radius: 1px; background: var(--surface-3); overflow: hidden; }
  .prog i { display: block; height: 100%; background: var(--k); }
  .keys { margin-top: 1.5rem; padding: 0.6rem 0.5rem; border-top: 1px dashed var(--line); display: grid; gap: 0.35rem; font-size: 0.7rem; color: var(--text-muted); }

  /* queue */
  .queue { min-width: 0; border-right: 1px solid var(--line); }
  .qhead { position: sticky; top: var(--top); z-index: 5; background: var(--surface-solid); border-bottom: 1px solid var(--line); padding: 0.7rem 0.9rem 0; }
  .qtitle { display: flex; align-items: center; gap: 0.55rem; }
  .qt-ico { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 7px; color: var(--k, var(--text-secondary)); background: color-mix(in oklab, var(--k, var(--text-muted)) 15%, transparent); }
  .qtitle h2 { font-family: var(--font-marquee); font-size: 1.35rem; line-height: 1; color: var(--text-primary); margin: 0; }
  .qt-sec { color: var(--text-muted); font-size: 0.8rem; }
  .qt-n { font-family: var(--font-dial); font-weight: 700; font-size: 1.15rem; color: var(--text-secondary); }
  .search { margin-left: auto; display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.6rem; border: 1px solid var(--line); border-radius: 7px; color: var(--text-muted); background: var(--surface-0); width: min(20rem, 40%); }
  .search:focus-within { border-color: var(--accent); }
  .search input { flex: 1; min-width: 0; background: transparent; border: 0; outline: 0; color: var(--text-primary); font-size: 0.82rem; }
  .qfilters { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin: 0.6rem 0 0.55rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.55rem; border-radius: 999px; border: 1px solid var(--line); color: var(--text-muted); font-size: 0.75rem; }
  .chip .n { font-size: 0.78rem; }
  .chip.on { color: var(--mc); border-color: color-mix(in oklab, var(--mc) 55%, transparent); background: color-mix(in oklab, var(--mc) 10%, transparent); }
  .chip.on .n { color: var(--mc); }
  .cb-note { display: flex; align-items: center; gap: 0.4rem; color: var(--text-tertiary); font-size: 0.76rem; margin: 0; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; flex-shrink: 0; }
  .seg button { padding: 0.22rem 0.65rem; font-size: 0.75rem; color: var(--text-muted); border-left: 1px solid var(--line); }
  .seg button:first-child { border-left: 0; }
  .seg button.on { background: var(--surface-3); color: var(--text-primary); font-weight: 600; }
  .bulkbar { display: flex; align-items: center; gap: 0.6rem; margin: 0 -0.9rem; padding: 0.4rem 0.9rem; background: var(--accent-primary-alpha); font-size: 0.78rem; color: var(--text-primary); }
  .bulkbar.quiet { background: transparent; color: var(--text-muted); padding-top: 0.2rem; }
  .bulkbar.quiet label { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; }
  .bb { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.6rem; border-radius: 6px; border: 1px solid; font-weight: 600; }
  .bb.a-approve { color: var(--success); } .bb.a-deny { color: var(--error); }
  .bb-clear { color: var(--text-muted); margin-left: auto; }

  /* match colors */
  .m-new { --mc: var(--success); } .m-version { --mc: var(--info); } .m-unsure { --mc: var(--warning); } .m-held { --mc: var(--text-muted); } .m-answer { --mc: var(--warning); }
  .pill { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.08rem 0.45rem 0.08rem 0.35rem; border-radius: 999px; font-size: 0.7rem; font-weight: 600; color: var(--mc); background: color-mix(in oklab, var(--mc) 12%, transparent); white-space: nowrap; }

  /* rows */
  .list { list-style: none; margin: 0; padding: 0; }
  .row { position: relative; display: grid; grid-template-columns: 26px 44px minmax(0, 1fr) 7.2rem auto; align-items: center; gap: 0.7rem; padding: 0.5rem 0.9rem 0.5rem 0.6rem; border-bottom: 1px solid var(--border-subtle); scroll-margin-top: 11rem; scroll-margin-bottom: 2rem; }
  .row::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: transparent; }
  .row:hover { background: var(--surface-1); }
  .row.focused { background: var(--accent-primary-alpha); }
  .row.focused::before { background: var(--accent); }
  .row.d-approve::before { background: var(--success); } .row.d-deny::before { background: var(--error); } .row.d-ask::before { background: var(--warning); }
  .row.d-deny .row-main, .row.d-deny .row-tile, .row.d-deny .row-match { opacity: 0.45; }
  .row.d-deny .t { text-decoration: line-through; text-decoration-color: color-mix(in oklab, var(--error) 50%, transparent); }
  .row-hit { position: absolute; inset: 0; z-index: 0; cursor: pointer; }
  .sel, .row-tile, .row-acts, .tile-play { position: relative; z-index: 1; }
  .sel { display: grid; place-items: center; height: 100%; cursor: pointer; }
  .row-main { min-width: 0; pointer-events: none; }
  .row-match { pointer-events: none; }
  .row-title { display: flex; align-items: baseline; gap: 0.5rem; min-width: 0; }
  .t { font-weight: 550; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .yr { font-family: var(--font-dial); font-weight: 600; font-size: 0.9rem; color: var(--text-tertiary); flex-shrink: 0; }
  .row-sub { display: flex; align-items: baseline; gap: 0.75rem; min-width: 0; margin-top: 0.12rem; font-size: 0.75rem; color: var(--text-muted); }
  .meta { display: inline-flex; align-items: center; gap: 0.55rem; flex-shrink: 0; white-space: nowrap; }
  .speech { display: inline-flex; align-items: center; gap: 0.3rem; }
  .speech i { width: 26px; height: 4px; border-radius: 2px; background: linear-gradient(90deg, var(--kind-talk) var(--p), var(--surface-3) var(--p)); }
  .ex { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-quote); font-style: italic; color: var(--text-tertiary); }
  .muted-i { font-family: inherit; color: var(--text-muted); }
  .row-acts { display: flex; gap: 0.25rem; }
  .act { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--line); color: var(--text-muted); background: var(--surface-0); transition: color .12s, border-color .12s, background .12s; }
  .act.a-approve:hover, .act.a-approve.on { color: var(--success); border-color: var(--success); }
  .act.a-deny:hover, .act.a-deny.on { color: var(--error); border-color: var(--error); }
  .act.a-ask:hover, .act.a-ask.on { color: var(--warning); border-color: var(--warning); }
  .act.on { background: color-mix(in oklab, currentColor 14%, transparent); }
  .empty { padding: 2rem 1rem; color: var(--text-muted); text-align: center; }
  .sentinel { padding: 0.75rem; text-align: center; color: var(--text-muted); font-size: 0.75rem; }

  /* kind tile: the one place a row says what it is */
  .row-tile { position: relative; width: 40px; height: 52px; }
  .tile { position: relative; width: 40px; height: 52px; border-radius: 5px; display: grid; place-items: center; color: var(--k); background: color-mix(in oklab, var(--k) 13%, transparent); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--k) 30%, transparent); overflow: hidden; }
  .k-talk.tile, .k-video.tile { border-radius: 50% / 40%; }
  .k-scan.tile { box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--k) 30%, transparent), 3px 3px 0 -1px color-mix(in oklab, var(--k) 25%, transparent); }
  .tile img { width: 100%; height: 100%; object-fit: cover; }
  .tile-badge { position: absolute; right: 2px; bottom: 2px; display: grid; place-items: center; padding: 2px; border-radius: 4px; color: #fff; background: var(--k); }
  .tile-ext { position: absolute; bottom: 3px; left: 0; right: 0; text-align: center; font-family: var(--font-dial); font-weight: 700; font-size: 0.6rem; letter-spacing: 0.04em; }
  .tile:has(.tile-ext) > .ico { margin-top: -10px; }
  .tile-play { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 50% / 40%; color: #fff; background: color-mix(in oklab, var(--k, var(--kind-talk)) 85%, black); opacity: 0; transition: opacity .12s; }
  .row:hover .tile-play, .row.focused .tile-play { opacity: 1; }
  .row-tile:has(.k-talk) .tile-play { --k: var(--kind-talk); } .row-tile:has(.k-video) .tile-play { --k: var(--kind-video); }
  .tile-big { width: 240px; height: 320px; border-radius: 6px; }
  .tile-big .tile-ext { font-size: 0.9rem; bottom: 1rem; }

  /* detail */
  .detail { position: sticky; top: var(--top); max-height: calc(100vh - var(--top)); overflow-y: auto; padding: 1rem 0 1.5rem 1.25rem; }
  .d-head { display: flex; align-items: center; gap: 0.5rem; }
  .d-kind { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--k); }
  .score { margin-left: auto; font-family: var(--font-dial); font-weight: 700; font-size: 1.2rem; color: var(--text-tertiary); }
  .d-title { font-family: var(--font-marquee); font-size: 1.45rem; line-height: 1.2; color: var(--text-primary); margin: 0.45rem 0 0.15rem; overflow-wrap: anywhere; }
  .d-by { color: var(--text-secondary); margin: 0 0 0.8rem; min-height: 1em; }
  .player { display: flex; align-items: center; gap: 0.7rem; padding: 0.55rem 0.7rem; border-radius: 10px; background: color-mix(in oklab, var(--kind-talk) 10%, transparent); margin-bottom: 0.9rem; }
  .pbtn { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; color: #fff; background: var(--kind-talk); flex-shrink: 0; }
  .ptrack { flex: 1; height: 6px; border-radius: 3px; background: var(--surface-3); cursor: pointer; overflow: hidden; }
  .ptrack i { display: block; height: 100%; background: var(--kind-talk); }
  .ptime { font-family: var(--font-dial); font-size: 0.85rem; color: var(--text-secondary); min-width: 5.5rem; text-align: right; }
  .d-page { margin-bottom: 0.9rem; }
  .d-rec { margin: 0 0 0.6rem; padding: 0.5rem 0.7rem; border-left: 3px solid var(--accent); background: var(--surface-1); border-radius: 0 6px 6px 0; }
  .d-rec dt { font-size: 0.66rem; letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-muted); }
  .d-rec dd { margin: 0.1rem 0 0; color: var(--text-primary); font-weight: 550; }
  .d-why { color: var(--text-secondary); margin: 0 0 0.8rem; line-height: 1.45; }
  .d-answer { margin: 0 0 0.8rem; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1px solid color-mix(in oklab, var(--warning) 50%, transparent); background: color-mix(in oklab, var(--warning) 8%, transparent); }
  .d-answer b { display: flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; color: var(--warning); }
  .d-answer p { margin: 0.3rem 0 0; white-space: pre-line; color: var(--text-primary); }
  .d-text { margin: 0 0 0.9rem; }
  .d-text figcaption { font-size: 0.66rem; letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.3rem; }
  .d-text blockquote { margin: 0; max-height: 15rem; overflow-y: auto; padding: 0.65rem 0.8rem; border-radius: 8px; background: var(--surface-1); font-family: var(--font-quote); font-size: 0.88rem; line-height: 1.6; color: var(--text-primary); white-space: pre-line; }
  .d-facts { display: grid; grid-template-columns: 5.5rem 1fr; gap: 0.35rem 0.75rem; margin: 0 0 1rem; font-size: 0.78rem; }
  .d-facts dt { color: var(--text-muted); }
  .d-facts dd { margin: 0; color: var(--text-secondary); min-width: 0; }
  .paths { display: flex; flex-direction: column; gap: 0.2rem; }
  .path { text-align: left; font-family: ui-monospace, monospace; font-size: 0.7rem; color: var(--text-secondary); overflow-wrap: anywhere; }
  .path.alt { color: var(--text-muted); }
  .path:hover { color: var(--accent); }
  .d-actions { position: sticky; bottom: 0; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.45rem; padding: 0.6rem 0; background: var(--surface-solid); }
  .big { display: flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.55rem 0.5rem; border-radius: 8px; border: 1.5px solid; font-weight: 650; background: var(--surface-0); }
  .big kbd { margin-left: 0.2rem; }
  .big.a-approve { color: var(--success); } .big.a-deny { color: var(--error); } .big.a-ask { color: var(--warning); }
  .big:hover, .big.on { background: color-mix(in oklab, currentColor 13%, transparent); }
  .big.on { box-shadow: inset 0 0 0 1px currentColor; }
  .d-askform textarea { width: 100%; padding: 0.5rem 0.6rem; border-radius: 8px; border: 1px solid var(--warning); background: var(--surface-0); color: var(--text-primary); font-size: 0.85rem; resize: vertical; }
  .d-decided { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.4rem; font-size: 0.78rem; font-weight: 600; }
  .d-decided.d-approve { color: var(--success); } .d-decided.d-deny { color: var(--error); } .d-decided.d-ask { color: var(--warning); }
  .d-imported { grid-column: 1 / -1; display: flex; align-items: center; gap: 0.4rem; color: var(--success); font-weight: 600; margin: 0; }
  .d-note { font-size: 0.78rem; color: var(--text-muted); margin: 0 0 0.8rem; }
  .d-empty { display: grid; place-items: center; gap: 0.5rem; padding: 5rem 1rem; color: var(--text-muted); text-align: center; }

  .toast { position: fixed; left: 50%; bottom: 1.25rem; transform: translateX(-50%); z-index: 60; display: flex; align-items: center; gap: 1rem; padding: 0.55rem 1rem; border-radius: 10px; background: var(--text-primary); color: var(--surface-solid); font-size: 0.82rem; box-shadow: 0 8px 30px rgb(0 0 0 / 0.25); }
  .toast button { color: var(--accent-primary-light); font-weight: 700; }
</style>
