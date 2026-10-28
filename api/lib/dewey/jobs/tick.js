// Dewey's dispatcher: one pass over due registry jobs. Tower only DECIDES here — it follows the dewey_items / ingest-folder executors,
// queues them, and reaps dead worker leases. Fetching, unzipping and scanning happen on a worker (jobs/worker.js contract); with no
// worker the job waits ("waiting for a worker"), it never falls back to tower. Runs in siftersearch-reports (reports-worker loop).
import * as realRepo from '../../repos/dewey-jobs-repo.js';
import { makeRegistry } from './registry.js';
import { valve, isAdmin, whoOf, trustLevel } from './policy.js';
import { rm } from 'node:fs/promises';
import { isTerminal } from './states.js';
import { isLive, docUrl } from './live.js';

const AUTO = 'dewey:auto', AUTO_PER_DAY = 100;   // per contributor per day (Chad 10-28: contributors are trusted; was 15 for everyone)
const HELD_PREFIX = 'ingest folder: already in the library';
const soon = (s) => new Date(Date.now() + s * 1000).toISOString();

/** dewey_items state → the job's state. Pure. → { to, step, detail?, reason? } */
export function mapItem(item) {
  const why = String(item.log?.at(-1)?.why || '');
  switch (item.state) {
    case 'received': return { to: 'inspecting', step: 'received' };
    case 'archived': return { to: 'deduping', step: 'check' };
    case 'wanted': case 'researched': case 'lead': case 'to-buy': return { to: 'processing', step: 'research', detail: 'looking for a copy' };
    case 'source': case 'processing': return { to: 'processing', step: 'ingest' };
    case 'needs-ocr': return { to: 'processing', step: 'ocr', detail: 'reading a scan' };
    case 'needs-human': case 'offered': return { to: 'awaiting-decision', step: 'waiting' };
    case 'declined': return { to: 'skipped', step: null, reason: why.startsWith(HELD_PREFIX) || /already (held|in the library)/i.test(why) ? 'duplicate' : 'declined', detail: why };
    case 'failed': return { to: 'failed', step: null };
    case 'ingested': return { to: item.doc_id ? 'processing' : 'failed', step: 'indexing', detail: 'being indexed', ingested: true };
    default: return { to: 'processing', step: item.state };
  }
}

export async function tick(deps = {}) {
  const { repo = realRepo, reg = makeRegistry(repo), items, live = isLive, queue, pending, power = () => false, limit = 50, remove = (p) => rm(p, { force: true }) } = deps;
  const it = items || (await import('../../repos/dewey-repo.js'));
  const q = queue || (await import('../../repos/ops-report-repo.js')).enqueue;
  const check = deps.check || (async (input) => { const { checkWithMemo } = await import('../check-memo.js'); const { identifyAndCheckOffThread } = await import('../holdings.js'); return checkWithMemo(input, () => identifyAndCheckOffThread(input)); });
  const archive = deps.archive || (async (...a) => (await import('../intake.js')).archiveFile(...a));
  const pend = pending || (await import('../../repos/ops-report-repo.js')).pendingRuns;
  if (power()) return { held: 'power' };
  const v = await valve(repo);
  const out = { seen: 0, moved: 0, published: 0, reaped: 0, held: v.on ? null : v.why };
  let ingestQueued = false;

  const syncItem = async (job, item) => {
    const m = mapItem(item);
    let to = m.to, extra = {};
    if (m.ingested && item.doc_id) {
      const l = await live(item.doc_id);
      if (l.live) { to = 'published'; extra = { result: { outcome: 'added', doc_id: item.doc_id, title: item.title, author: item.author, url: docUrl(item.doc_id), points: l.points } }; out.published++; }
      else extra = { detail: l.points === null ? 'search engine unreachable; checking again' : 'being indexed', result: { outcome: 'indexing', doc_id: item.doc_id, title: item.title } };
    }
    if (to === 'skipped') extra = { result: { outcome: m.reason, reason: m.reason, title: item.title, why: m.detail, duplicate_of: item.log?.at(-1)?.why } };
    if (to === 'failed') extra = { error: String(item.log?.at(-1)?.why || 'processing failed').slice(0, 300) };
    if (to === 'awaiting-decision') extra = { question: { text: `Waiting for approval: “${item.title}”${item.author ? ` by ${item.author}` : ''} is new to the library — ${String(item.log?.at(-1)?.why || 'worth adding?').slice(0, 160)}`, item_id: item.id, options: [{ id: 'add', label: 'Add it to the library' }, { id: 'skip', label: 'Keep it out' }] }, result: { outcome: 'needs-decision', title: item.title, author: item.author, item_id: item.id } };
    const before = job.state + job.step;
    await reg.advance(job.id, to, { step: m.step, detail: extra.detail || m.detail, itemId: item.id, ...(extra.result ? { result: extra.result } : {}), ...(extra.question ? { question: extra.question } : {}), ...(extra.error ? { error: extra.error } : {}) });
    if (!isTerminal(to)) await repo.schedule(job.id, soon(to === 'processing' && m.step === 'indexing' ? 120 : 60));
    if (before !== to + m.step) out.moved++;
  };

  // A file child (from a fetched link or an unpacked archive): duplicate check FIRST (the existing holdings check, memoised by sha256), then
  // an item. Admin requests are taken in; everyone else's new works wait for a yes ("ask first") unless they asserted rights, are trusted, and
  // today's auto-add allowance (15) is not spent.
  const handleFile = async (job) => {
    const p = job.params || {};
    const known = p.sha256 ? await it.findBySha(p.sha256) : null;
    if (known) { await reg.advance(job.id, 'deduping', { step: 'check', itemId: known.id }); return { item: known }; }
    if (!p.path) { await reg.advance(job.id, 'failed', { error: 'no file path recorded' }); return null; }
    await reg.advance(job.id, 'deduping', { step: 'check', detail: 'checking the library for this work' });
    let doc;
    try { doc = await check({ path: p.path }); } catch (e) { await reg.fail(job.id, e); return null; }
    const v = doc?.result?.verdict;
    if (v === 'held') {
      const top = doc.result.candidates?.[0];
      await reg.advance(job.id, 'skipped', { result: { outcome: 'duplicate', reason: 'duplicate', title: doc.identified?.title || p.name, why: top ? `already in the library as “${top.title}”` : 'already in the library', duplicate_of: top ? `#${top.id} ${top.title}` : null } });
      await remove(p.path); return null;
    }
    if (v === 'undetermined' || String(v || '').startsWith('error')) { await reg.advance(job.id, 'failed', { error: 'could not read enough of it to check the library' }); return null; }
    const id = doc.identified || {}, by = job.created_by;
    const admin = isAdmin(by), autoKey = `${AUTO}:${whoOf(by)}`, sure = p.rights !== false && !!whoOf(by).includes('@') && (await repo.usageOf(autoKey)).jobs < AUTO_PER_DAY;   // known contributor + rights not denied + clean check (duplicates/unreadable returned above) + under their daily allowance
    const auto = false;   // Chad 10-28: NO book/document is added without his yes (talks/media are taken in by trust elsewhere); `admin`/`sure` stay for the record
    const arc = await archive(p.path, { itemId: null, by, job: job.id });
    const item = await it.createItem({ title: id.title || p.name, author: id.author || null, kind: id.kind || null, identified: { ...id, _text: undefined, file_name: p.name, job: job.id }, by: `${whoOf(by)} (job ${job.id})`,
      state: 'offered', why: `waiting for approval - ${id.title || p.name}${id.author ? ` by ${id.author}` : ''} (from ${admin ? 'the operator' : whoOf(by)}'s ${job.channel || ''} job, ${p.name})` });
    await it.updateItem(item.id, { original_path: arc.path, sha256: arc.sha256 }, `source archived (${Math.round(arc.bytes / 1024)} KB)`);
    if (auto) { await q('dewey-intake', { id: item.id }, by || 'dewey-jobs'); if (sure && !admin) await repo.bumpUsage(autoKey, { jobs: 1 }); }
    await repo.updateJob(job.id, { item_id: item.id });
    await remove(p.path);
    return { item: await it.getItem(item.id) };
  };

  for (const job of await repo.dueJobs(undefined, limit)) {
    out.seen++;
    try {
      // a worker's lease ran out: the worker died or lost us — retry with backoff, never run it here
      if (['fetch', 'archive'].includes(job.kind) && job.state === 'fetching' && job.lease_until && job.lease_until <= new Date().toISOString()) { await reg.fail(job.id, 'the worker stopped reporting (lease expired)'); out.reaped++; continue; }
      if (['fetch', 'archive'].includes(job.kind)) {
        if (job.state === 'received' && job.step !== 'waiting for a worker') { await reg.advance(job.id, 'received', { step: 'waiting for a worker' }); await reg.note(job.id, 'waiting-for-worker', { note: 'no worker has taken it yet; it never runs on tower' }); }
        await repo.schedule(job.id, soon(60));
        continue;
      }
      if (job.kind === 'media') {
        const p = job.params || {};
        const run = await q('media-scan', { urls: p.url ? [p.url] : [], paths: p.path ? [p.path] : [], roots: [], batch: 1 }, job.created_by || 'dewey-jobs');
        await reg.advance(job.id, 'handed-off', { step: null, result: { outcome: 'media-queued', run: run?.id ?? null, title: p.name || p.url, note: 'the media pipeline checks holdings, transcribes and publishes it at /media' } });
        continue;
      }
      if (job.kind === 'file' && !job.item_id) {
        const r = await handleFile(job);
        if (r?.item) await syncItem(await repo.getJob(job.id), r.item);
        continue;
      }
      if (job.item_id) {
        const item = await it.getItem(job.item_id);
        if (!item) { await reg.advance(job.id, 'failed', { error: 'its Dewey item is gone' }); continue; }
        await syncItem(job, item);
      } else if (!isTerminal(job.state)) await repo.schedule(job.id, soon(300));
    } catch (e) { await reg.note(job.id, 'tick-error', { error: String(e.message).slice(0, 200) }).catch(() => {}); await repo.schedule(job.id, soon(120)).catch(() => {}); }
  }
  return out;
}
