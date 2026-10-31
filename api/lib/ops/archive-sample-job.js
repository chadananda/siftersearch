// archive-sample ops job: a donor drive's candidates SAMPLED ON HOME WORKERS (planning/donor-intake-plan-20261030.md steps 5-7). Tower only
// gathers: it stages each item's input to the LAN queue (type 'intake'; a talk's head bytes, a book's file or first page images) and pulls the
// results — clip → R2 (private, signed for listening), title page → R2 `siftersearch` (served through /img), text + recommendation → the item.
// Workers (scripts/media/worker/intake-agent.mjs) transcribe and OCR. Priority = score (order, never a filter); "More info" → a deeper look
// (5 min of transcript / 15 pages) whose answer returns the item to the undecided view. Idempotent and resumable: an item is staged once
// (sample.queued), a job id is the item id. One run = passes for up to ~20 min, then it requeues itself while work remains. Lane 'archive'.
import { join, normalize, extname } from 'path';
import { createReadStream } from 'fs';
import { stat, mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { getDrive, itemsToSample, itemsWantingInfo, setSample, setRec, answerInfo, getItem } from '../repos/archives-repo.js';
import { recommendFromSample, infoAnswer } from '../archives/sample-rec.js';

export const SAMPLE_SECS = 60, DEEP_SECS = 300, PAGES = 3, DEEP_PAGES = 15;
export const clipKey = (drive, id, ext, deep = false) => `intake/${drive}/${id}${deep ? '-deep' : ''}.${ext}`;
export const titleKey = (drive, id) => `intake/${drive}/${id}-title.jpg`;
const TALK = new Set(['talk', 'video']);
const WHOLE = new Set(['mp4', 'm4a', 'm4v', 'mov', '3gp', 'm4b']);   // the index (moov) may sit at the end: the head alone may not play
const IMG = /\.(jpe?g|png|tiff?|gif|bmp)$/i;
const MB = 1 << 20;

/** Path of an item's file under the drive root, or null if the stored path would leave it. Pure. */
export function itemPath(root, rel) {
  const p = normalize(join(root, String(rel || '')));
  return rel && p.startsWith(normalize(root) + '/') ? p : null;
}

/** What to stage for an item → { kind, files: [{ name, src, end? }], secs?, pages? } (end = last byte of a head copy). Pure apart from size. */
export async function stagePlan(root, it, { deep = false, size = async (p) => (await stat(p)).size } = {}) {
  if (TALK.has(it.kind)) {
    const src = itemPath(root, it.primary_rel);
    if (!src) throw new Error('path outside the drive');
    const ext = extname(src).slice(1).toLowerCase(), bytes = await size(src), secs = deep ? DEEP_SECS : SAMPLE_SECS;
    let end = null;
    if (WHOLE.has(ext)) { if (bytes > 1.5e9) end = 300 * MB; }
    else end = it.duration_s > 0 ? Math.ceil((bytes / it.duration_s) * secs * 1.5 + 2 * MB) : 40 * MB;
    return { kind: 'talk', secs, files: [{ name: `in/0.${ext || 'bin'}`, src, ...(end != null && end < bytes ? { end: end - 1 } : {}) }] };
  }
  const pages = deep ? DEEP_PAGES : PAGES;
  const rels = (it.rel_paths?.length ? it.rel_paths : [it.primary_rel]);
  const imgs = rels.filter((r) => IMG.test(r)).sort();
  const picked = imgs.length === rels.length && imgs.length > 1 ? imgs.slice(0, pages) : [it.primary_rel];
  const files = picked.map((r, i) => {
    const src = itemPath(root, r);
    if (!src) throw new Error('path outside the drive');
    return { name: `in/${String(i).padStart(3, '0')}${extname(r).toLowerCase()}`, src };
  });
  if (picked.length === 1 && await size(files[0].src) > 1.2e9) throw new Error('too big to sample (over 1.2 GB)');
  return { kind: 'book', pages, files };
}

const jobId = (id, deep) => `intake-${id}${deep ? '-deep' : ''}`;
async function stage(q, drive, it, deep) {
  const plan = await stagePlan(drive.root, it, { deep });
  const id = jobId(it.id, deep);
  let bytes = 0;
  for (const f of plan.files) bytes += (await q.put('files', id, f.name, createReadStream(f.src, f.end != null ? { end: f.end } : {}))).bytes;
  await q.enqueue([{ id, file_id: id, item_id: it.id, type: 'intake', stages: [plan.kind === 'talk' ? 'intake-talk' : 'intake-book'], invoice: { audio_s: 0, bytes },
    priority: Math.round(Number(it.score) || 0) + (deep ? 1000 : 0), drive: drive.id, kind: plan.kind, deep, secs: plan.secs, pages: plan.pages, lang: it.lang || null }]);
  return bytes;
}

/** One pass: pull finished and failed jobs, then stage "More info" looks and new samples up to the window. → counts */
export async function samplePass({ drive, window = 24, deps }) {
  const { q, store, imgStore, save = setSample, rec = setRec, answer = answerInfo, item = getItem, toSample = itemsToSample, wanting = itemsWantingInfo } = deps;
  const out = { pulled: 0, failed: 0, staged: 0, deep: 0, errors: {} };
  const note = (why) => { why = String(why).slice(0, 160); out.errors[why] = (out.errors[why] || 0) + 1; };
  for (const j of await q.listDone(50, 'intake')) {
    const b = j.body || {}, tmp = await mkdtemp(join(tmpdir(), 'intake-'));
    try {
      const names = (j.result?.outputs || []).map((o) => o.name);
      const local = async (n) => q.get('results', j.id, n, join(tmp, n));
      const s = JSON.parse(await readFile(await local('sample.json'), 'utf8'));
      const at = new Date().toISOString(), it = await item(j.item_id);
      const patch = {};
      if (names.includes('clip.mp3')) { const key = clipKey(b.drive, j.item_id, 'mp3', b.deep); patch.clip = { key, ext: 'mp3', secs: s.secs, bytes: await store.put(key, await local('clip.mp3')), at }; }
      if (names.includes('title.jpg') && imgStore) { const key = titleKey(b.drive, j.item_id); await imgStore.put(key, await local('title.jpg')); patch.title_image = key; }
      if (it) {
        if (b.deep) {
          await save(j.item_id, { deep: { text: s.text, language: s.language ?? null, secs: s.secs ?? null, pages: s.pages ?? null, ocr: !!s.ocr, at }, ...(patch.clip ? { deep_clip: patch.clip } : {}) });
          if (it.decision === 'more_info') await answer(j.item_id, infoAnswer(it.decision_note, s));
        } else {
          await save(j.item_id, { ...patch, text: s.text, language: s.language ?? null, speech_s: s.speech_s ?? null, ocr: !!s.ocr, pages: s.pages ?? null, sampled_at: at });
          await rec(j.item_id, recommendFromSample(it, s));
        }
      }
      out.pulled++;
    } catch (e) { note(e.message); await save(j.item_id, { error: String(e.message).slice(0, 300) }).catch(() => {}); }
    finally { await rm(tmp, { recursive: true, force: true }); await q.ack([j.id]); }
  }
  for (const j of await q.listDone(50, 'intake', 'failed')) {   // the queue gave up after its attempts: recorded, never retried blindly
    const b = j.body || {};
    await save(j.item_id, { [b.deep ? 'deep_error' : 'error']: String(j.error || 'failed').slice(-300) }).catch(() => {});
    if (b.deep) await answer(j.item_id, `The deeper look failed: ${String(j.error || '').slice(-200)}`).catch(() => {});
    note(String(j.error || 'failed').split(':').slice(1).join(':').trim().slice(0, 80) || 'failed'); out.failed++;
    await q.ack([j.id]);
  }
  const d = deps.drive;
  for (const it of await wanting(drive, { limit: 20 })) {   // "More info" first: Chad is waiting on these
    try {
      if (!TALK.has(it.kind) && !['book', 'scan'].includes(it.kind)) { await answer(it.id, `No deeper look is available for a ${it.kind}.`); continue; }
      await stage(q, d, it, true); await save(it.id, { deep_queued: new Date().toISOString() }); out.deep++;
    } catch (e) { note(e.message); await save(it.id, { deep_queued: new Date().toISOString(), deep_error: e.message }); await answer(it.id, `The deeper look could not start: ${e.message}`); }
  }
  const queued = (await q.stats('intake'))?.states?.queued?.n || 0;
  for (const it of window > queued ? await toSample(drive, { limit: window - queued }) : []) {
    try { await stage(q, d, it, false); await save(it.id, { queued: new Date().toISOString() }); out.staged++; }
    catch (e) { note(e.message); await save(it.id, { queued: new Date().toISOString(), error: e.message }); }
  }
  return out;
}

export async function archiveSampleJob({ drive, window = 24, minutes = 20, round = 1 } = {}, deps = {}) {
  if (!drive) throw new Error('archive-sample needs drive');
  const d = await (deps.getDrive || getDrive)(drive);
  if (!d?.root) throw new Error(`no drive ${drive}`);
  const { r2StageStore } = await import('../media/r2-stage.js');
  const q = deps.q || (await import('../repos/media-queue-repo.js')).localQueue();
  const store = deps.store !== undefined ? deps.store : await r2StageStore();
  if (!store) throw new Error('no R2 store (CLOUDFLARE_API_TOKEN/ACCOUNT_ID)');
  // title pages go to the public `siftersearch` bucket: the image service (/img/a/…) only resizes from there
  const imgStore = deps.imgStore !== undefined ? deps.imgStore : await r2StageStore({ ...process.env, MEDIA_STAGE_BUCKET: 'siftersearch' });
  const draining = deps.draining || (await import('../drain.js')).isDraining;
  const nap = deps.nap || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const total = { drive, round, passes: 0, pulled: 0, failed: 0, staged: 0, deep: 0, errors: {} };
  const until = Date.now() + minutes * 60_000;
  for (;;) {
    const p = await samplePass({ drive, window, deps: { ...deps, q, store, imgStore, drive: d } });
    total.passes++;
    for (const k of ['pulled', 'failed', 'staged', 'deep']) total[k] += p[k];
    for (const [k, v] of Object.entries(p.errors)) total.errors[k] = (total.errors[k] || 0) + v;
    if (draining() || Date.now() >= until) break;
    await nap(60_000);
  }
  const st = await q.stats('intake'), inFlight = (st?.states?.queued?.n || 0) + (st?.states?.leased?.n || 0) + (st?.states?.done?.n || 0);
  total.in_flight = inFlight;
  total.remaining = (await (deps.toSample || itemsToSample)(drive, { limit: 1 })).length;
  if ((inFlight || total.remaining) && !deps.noRequeue) await (deps.requeue || (async (p) => (await import('../repos/ops-report-repo.js')).enqueue('archive-sample', p, 'archive-sample')))({ drive, window, minutes, round: round + 1 });
  return total;
}
