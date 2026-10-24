<script>
  // Dewey's upload panel: many files or a folder, big or small, straight to the edge (resumable, parallel). Logic: src/lib/dewey-uploader.js
  import { onMount } from 'svelte';
  import { getAccessToken } from '../../lib/api.js';
  import { UploadQueue, makeStore } from '../../lib/dewey-uploader.js';

  let items = $state([]), over = $state(false), unfinished = $state([]), open = $state(false);
  const API = import.meta.env.PUBLIC_API_URL || '';
  const q = new UploadQueue({ base: API, authHeaders: () => (getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}), onChange: (i) => { items = [...i]; } });
  let prog = $derived((items, q.progress()));
  let busy = $derived(items.some((i) => i.state === 'uploading' || i.state === 'queued'));
  const mb = (n) => n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1048576))} MB`;
  const eta = (s) => s == null ? '' : s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`;
  let tick = $state(0); onMount(() => { const t = setInterval(() => tick++, 1000); return () => clearInterval(t); });   // speed and ETA refresh each second
  let sp = $derived((tick, items, q.progress()));
  const LABEL = { queued: 'Waiting', uploading: 'Uploading', paused: 'Paused', done: 'Sent', error: 'Stopped', rejected: 'Not accepted', canceled: 'Canceled' };
  onMount(() => { unfinished = makeStore().list(); const warn = (e) => { if (busy) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); });
  const take = (list) => { q.add([...list]); open = true; unfinished = makeStore().list().filter((u) => !items.some((i) => i.fp === u.fp)); };
  async function dropped(e) {
    e.preventDefault(); over = false;
    const out = [];
    const walk = async (entry) => {   // a dropped folder: every file inside it
      if (entry.isFile) out.push(await new Promise((r) => entry.file(r)));
      else { const rd = entry.createReader(); for (let b; (b = await new Promise((r) => rd.readEntries(r))).length;) for (const c of b) await walk(c); }
    };
    const entries = [...(e.dataTransfer?.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (entries.length) for (const en of entries) await walk(en); else out.push(...e.dataTransfer.files);
    take(out);
  }
</script>

<section class="up">
  <button class="head" onclick={() => (open = !open)} aria-expanded={open}>
    <span>⬆ Upload files for Dewey{#if busy} — {prog.pct}%{/if}</span><span aria-hidden="true">{open ? '–' : '+'}</span>
  </button>
  {#if open || items.length}
    <div class="body">
      <div class="drop" class:over role="button" tabindex="0" ondragover={(e) => { e.preventDefault(); over = true; }} ondragleave={() => (over = false)} ondrop={dropped}>
        <p>Drop files or a folder here — audio, video, PDF, Word, EPUB, text, photos. Big files are fine (up to 50 GB each); dozens at once are fine.</p>
        <label class="act">Choose files<input type="file" multiple class="sr-only" onchange={(e) => { take(e.currentTarget.files); e.currentTarget.value = ''; }} /></label>
        <label class="act">Choose a folder<input type="file" webkitdirectory class="sr-only" onchange={(e) => { take(e.currentTarget.files); e.currentTarget.value = ''; }} /></label>
      </div>
      {#if unfinished.length}
        <p class="note">Unfinished from before: {unfinished.map((u) => `${u.name} (${u.done}/${u.parts} parts)`).join(', ')}. Choose the same file(s) again and it carries on where it stopped.</p>
      {/if}
      {#if items.length}
        <div class="bar" role="progressbar" aria-valuenow={prog.pct} aria-valuemin="0" aria-valuemax="100"><i style="width:{prog.pct}%"></i></div>
        <p class="note">{prog.done} of {prog.files} files sent · {mb(sp.sent)} of {mb(sp.total)}{#if busy && sp.bps} · {(sp.bps / 1048576).toFixed(1)} MB/s{#if sp.etaSec != null} · about {eta(sp.etaSec)} left{/if}{/if}.</p>
        {#if busy}<p class="keep">Keep this tab open until every file shows “Sent”. If the connection drops, nothing is lost — it carries on by itself, and if you close the page, choose the same files again to resume.</p>{/if}
        <ul>
          {#each items as it (it.id)}
            <li class={it.state}>
              <div class="row"><span class="nm" title={it.name}>{it.name}</span><span class="st">{LABEL[it.state]}{it.state === 'uploading' ? ` ${Math.floor((it.sent / it.size) * 100)}%` : ''} · {mb(it.size)}</span></div>
              {#if it.state === 'uploading' || it.state === 'paused'}<div class="bar sm"><i style="width:{Math.floor((it.sent / it.size) * 100)}%"></i></div>{/if}
              {#if it.error}<p class="err">{it.error}</p>{/if}
              <div class="btns">
                {#if it.state === 'uploading' || it.state === 'queued'}<button onclick={() => q.pause(it.id)}>Pause</button>{/if}
                {#if it.state === 'paused'}<button onclick={() => q.resume(it.id)}>Resume</button>{/if}
                {#if it.state === 'error'}<button onclick={() => q.retry(it.id)}>Retry</button>{/if}
                {#if ['queued', 'uploading', 'paused', 'error'].includes(it.state)}<button onclick={() => q.cancel(it.id)}>Cancel</button>{/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</section>

<style>
  .up { border: 1px solid var(--border, #ccc); border-radius: 0.75rem; background: var(--surface-1, #fff); }
  .head { width: 100%; display: flex; justify-content: space-between; padding: 0.55rem 0.9rem; font-weight: 600; color: var(--text-primary, inherit); }
  .body { padding: 0 0.9rem 0.8rem; max-height: 45vh; overflow: auto; }
  .drop { border: 2px dashed var(--border, #ccc); border-radius: 0.6rem; padding: 0.8rem; text-align: center; display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; align-items: center; }
  .drop.over { border-color: var(--accent, #08c); background: var(--surface-2, #f4f4f4); }
  .drop p { width: 100%; margin: 0; font-size: 0.9rem; color: var(--text-secondary, #555); }
  .act, .btns button { padding: 0.4rem 0.8rem; border-radius: 0.5rem; border: 1px solid var(--border, #ccc); cursor: pointer; font-size: 0.9rem; min-height: 2.25rem; }
  .note { font-size: 0.85rem; color: var(--text-secondary, #555); margin: 0.4rem 0; }
  .bar { height: 0.6rem; border-radius: 99px; background: var(--surface-2, #eee); overflow: hidden; margin: 0.5rem 0; } .bar.sm { height: 0.35rem; margin: 0.25rem 0; }
  .bar i { display: block; height: 100%; background: var(--accent, #08c); transition: width 0.3s; }
  ul { list-style: none; padding: 0; margin: 0; } li { padding: 0.4rem 0; border-top: 1px solid var(--border-subtle, #eee); }
  .row { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.9rem; } .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .st { white-space: nowrap; color: var(--text-secondary, #555); }
  .keep { font-size: 0.85rem; font-weight: 600; margin: 0.2rem 0; color: var(--text-primary, inherit); }
  .err { color: var(--error, #b00); font-size: 0.85rem; margin: 0.2rem 0; } li.done .st { color: var(--success, #080); }
  .btns { display: flex; gap: 0.4rem; margin-top: 0.2rem; }
</style>
