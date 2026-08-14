<script>
  // Book Notes — the instructor-notes review surface. The loop Chad described: pick a book + chapter,
  // run it, then accept / edit / reject each note. ONLY KEPT NOTES enter the repetition ledger, so a
  // rejection here is not merely cosmetic: it decides what later chapters are told has already been taught.
  // Deps: api.admin.getBookNotes* / reviewBookNote / runBookNotesChapter.
  import { admin } from '../../lib/api.js';

  let books = $state(null);
  let error = $state(null);
  let docId = $state(21308);              // Dawn-Breakers, the first book
  let book = $state(null);
  let chapter = $state(null);
  let notes = $state([]);
  let running = $state(false);
  let runResult = $state(null);
  let editing = $state({});               // id → draft text

  const load = async () => {
    try {
      books = await admin.getBookNotes();
      book = await admin.getBookNotesBook(docId);
    } catch (e) { error = e.message; }
  };
  $effect(() => { load(); });

  const openChapter = async (c) => {
    chapter = c; runResult = null;
    try { notes = (await admin.getBookNotesChapter(docId, c)).notes ?? []; } catch (e) { error = e.message; }
  };

  // A dry run costs a few cents and writes nothing; applying records notes as 'pending' for review.
  const run = async (apply) => {
    running = true; error = null;
    try {
      runResult = await admin.runBookNotesChapter(docId, chapter, { apply });
      if (apply) await openChapter(chapter);
    } catch (e) { error = e.message; } finally { running = false; }
  };

  const review = async (n, verdict) => {
    try {
      await admin.reviewBookNote(n.id, verdict, verdict === 'edited' ? (editing[n.id] ?? n.body) : null);
      await openChapter(chapter);
    } catch (e) { error = e.message; }
  };

  const kept = (n) => n.review === 'accepted' || n.review === 'edited';
  const byPara = $derived(Object.entries(
    notes.reduce((m, n) => { (m[n.paragraph_index] ||= []).push(n); return m; }, {}),
  ).sort((a, b) => Number(a[0]) - Number(b[0])));
</script>

<div class="p-6 max-w-5xl">
  <h1 class="text-2xl font-semibold text-primary mb-1">Book Notes</h1>
  <p class="text-muted mb-5">
    Instructor notes, a chapter at a time. Notes arrive <em>pending</em>; only the ones you keep enter the
    repetition ledger, so later chapters are told a subject is covered <em>only</em> when you accepted the
    note that covered it. Rejecting is therefore safe — it never silently suppresses a better note later.
  </p>

  {#if error}<div class="text-error mb-4">{error}</div>{/if}

  {#if book}
    <div class="mb-4 text-sm text-secondary">
      {book.progress.paragraphsProcessed} ¶ processed · {book.progress.accepted + book.progress.edited} kept ·
      {book.progress.pending} pending · {book.progress.rejected} rejected
      {#if book.progress.keepRate !== null}· <strong>keep rate {book.progress.keepRate}%</strong>{/if}
    </div>

    <div class="flex flex-wrap gap-2 mb-5">
      {#each book.chapters as c (c.chapter_num)}
        <button class="px-3 py-1.5 text-sm rounded border border-border hover:bg-surface-2 transition-colors"
                class:bg-surface-2={chapter === c.chapter_num}
                onclick={() => openChapter(c.chapter_num)}>
          {c.chapter_num} <span class="text-muted">({c.kept}/{c.notes})</span>
        </button>
      {/each}
      {#if !book.chapters.length}
        <span class="text-muted text-sm">No notes yet — run a chapter below.</span>
      {/if}
    </div>
  {/if}

  {#if chapter}
    <div class="flex gap-2 mb-4">
      <button class="px-3 py-1.5 text-sm rounded bg-surface-2 border border-border" disabled={running}
              onclick={() => run(false)}>{running ? 'Running…' : 'Dry run'}</button>
      <button class="px-3 py-1.5 text-sm rounded bg-accent text-white" disabled={running}
              onclick={() => run(true)}>Run &amp; save</button>
    </div>
  {/if}

  {#if runResult}
    <div class="mb-6 border border-border rounded p-4">
      <div class="text-sm text-secondary mb-2">
        {runResult.applied ? 'Saved' : 'Dry run'} · {runResult.stats.processed} ¶ ·
        kept {runResult.stats.kept} · held {runResult.stats.held} · dropped {runResult.stats.dropped} ·
        no-note {runResult.stats.empty}
      </div>
      <!-- Rejections FIRST: a review that only shows survivors hides why a prompt is going wrong. -->
      {#if runResult.rejections?.length}
        <details class="mb-3">
          <summary class="cursor-pointer text-sm text-warning">{runResult.rejections.length} removed by the gates — why</summary>
          <ul class="mt-2 text-sm text-muted space-y-1">
            {#each runResult.rejections as r}
              <li>¶{r.paragraph} <span class="uppercase text-xs">{r.verdict}</span> {r.category}: {r.reason}</li>
            {/each}
          </ul>
        </details>
      {/if}
      <pre class="text-sm whitespace-pre-wrap text-primary">{runResult.markdown}</pre>
    </div>
  {/if}

  {#each byPara as [idx, group] (idx)}
    <div class="mb-5">
      <div class="font-semibold text-primary mb-2">¶ {idx}</div>
      {#each group as n (n.id)}
        <div class="border border-border rounded p-3 mb-2" class:opacity-50={n.review === 'rejected'}>
          <div class="text-xs text-muted mb-1">
            {n.category}{n.claim_kind ? ` · ${n.claim_kind}` : ''} · {n.review}
          </div>
          {#if editing[n.id] !== undefined}
            <textarea class="w-full text-sm p-2 border border-border rounded bg-surface-1" rows="3" bind:value={editing[n.id]}></textarea>
          {:else}
            <div class="text-sm text-primary">{n.edited_body || n.body}</div>
          {/if}
          <div class="flex gap-2 mt-2">
            <button class="text-xs px-2 py-1 rounded border border-border" onclick={() => review(n, 'accepted')}>Accept</button>
            {#if editing[n.id] === undefined}
              <button class="text-xs px-2 py-1 rounded border border-border" onclick={() => (editing = { ...editing, [n.id]: n.edited_body || n.body })}>Edit</button>
            {:else}
              <button class="text-xs px-2 py-1 rounded border border-border" onclick={() => review(n, 'edited')}>Save edit</button>
            {/if}
            <button class="text-xs px-2 py-1 rounded border border-border text-error" onclick={() => review(n, 'rejected')}>Reject</button>
          </div>
        </div>
      {/each}
    </div>
  {/each}
</div>
