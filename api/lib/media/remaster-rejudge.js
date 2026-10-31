// Re-judge held remasters from their STORED scores (Chad 10-31) + the held page's list. No audio work. Writes meta.json: media worker only. Deps: remaster-quality (the judge), media-repo
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFile, writeFile, rename, stat, mkdir, rm } from 'fs/promises';
import { remasterJudgement, qualityOf, assessmentOf, JUDGE_RULE } from './remaster-quality.js';
import { markAudioPending } from './talk-audio.js';
import { hasQuiet } from './quiet-record.js';

export const COUNTS_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'run', 'remaster-rejudge.json');
const REDO = ['realign', 'web', 'trim', 'update'];
const readJson = async (p, d = null) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return d; } };
const exists = (p) => stat(p).then((s) => s.size > 1024, () => false);
export const writeMeta = async (dir, m) => { const f = join(dir, 'meta.json'), t = `${f}.${process.pid}.rj.tmp`; await writeFile(t, JSON.stringify(m, null, 2)); await rename(t, f); };

/** The talk plays its UniPASE remaster from now on (judge publish, or Chad's publish of a pure copy): listening copy flipped, audio marked pending, status done. Pure on m. */
export function flipToRemaster(m, { verdict, judged, at }) {
  markAudioPending(m);
  if (m.enhancement.listening !== 'unipase') m.enhancement.listening_before = { name: m.enhancement.listening, why: m.enhancement.listening_why || null };
  m.enhancement.listening = 'unipase';
  m.enhancement.listening_why = `UniPASE remaster, ${verdict === 'pass-human-full' ? 'published by Chad' : 'judged same or better than the original'} (Chad 10-31)`;
  m.remaster_tier = m.remaster?.method === 'cleaned' ? 'cleaned' : 'heavy';
  m.remaster = { ...(m.remaster || {}), status: 'done', verdict, ...(judged ? { judged } : {}), decided_at: at };
  delete m.remaster.why;
  return m;
}

/** After a talk is flipped to its remaster: the web copies are redone FROM a master that has its quiet pass. No quiet record yet → the quiet repair runs first (a home worker silences the word-free stretches; it never inserts
 *  original audio) and then queues this same redo; never a media-item run racing it. */
export const queueAfterFlip = (queue, id, m, by) => (hasQuiet(m) ? queue('media-item', { id, remaster: true, redo: REDO }, by) : queue('media-quiet-repair', { ids: [id], redo: REDO }, by));

/** Quiet audit of the published remasters (Chad 10-31: every remaster gets the quiet pass): counts those with / without the quiet record, lists the judge- and Chad-published ones missing it; fix → the quiet repair is queued for them. */
export async function quietAudit({ repo, queue, readMeta, fix = false } = {}) {
  const read = readMeta || ((dir) => readJson(join(dir, 'meta.json')));
  const out = { published: 0, with_quiet: 0, missing: 0, judged_published: 0, judged_missing: [], other_missing: [], queued: 0 };
  for (const it of await repo.heldRows(['usable', 'cleaned'])) {
    const m = await read(it.dir).catch(() => null);
    if (!m?.remaster || m.remaster.status !== 'done') continue;
    const judged = m.remaster.judged?.action === 'publish' || ['pass-judged', 'pass-human-full'].includes(m.remaster.verdict);
    out.published++; if (judged) out.judged_published++;
    if (hasQuiet(m)) { out.with_quiet++; continue; }
    out.missing++; (judged ? out.judged_missing : out.other_missing).push({ id: it.id, slug: it.slug });
  }
  const ids = [...out.judged_missing, ...out.other_missing].map((x) => x.id);
  if (fix && ids.length) { await queue('media-quiet-repair', { ids, limit: ids.length }, 'media-remaster-rejudge'); out.queued = ids.length; }
  out.judged_missing = out.judged_missing.map((x) => x.slug); out.other_missing = out.other_missing.map((x) => x.slug);
  return out;
}

/** A copy written under the retired word guard (Chad 10-31: "There is no reason to ever splice a remaster"): original sentences swapped into the remaster. */
export const isSpliced = (m) => Number(m?.remaster?.swapped) > 0;

/** Purify a spliced talk: the spliced enhanced/unipase.flac (+ its guard json, its stale assessment, the cached A/B clips) is deleted, the swap fields cleared (the old
 *  fallback % is kept as the word-mismatch ASSESSMENT), and a worker rebuilds the PURE copy from unipase.cloud.flac (post: aligned + leveled + quality-checked; no audio work on tower).
 *  No UniPASE output on tower → a full restore order instead. Judged afterwards by the same rule as every talk. */
export async function purifySpliced(it, m, { queue, now = () => new Date().toISOString() }) {
  const enh = join(it.dir, 'enhanced'), r = m.remaster || {}, at = now();
  for (const f of ['unipase.flac', 'unipase.guard.json', 'restored.guard.json']) await rm(join(enh, f), { force: true });
  await rm(join(it.dir, 'held'), { recursive: true, force: true });
  const hasCloud = (await exists(join(enh, 'unipase.cloud.flac'))) && (await exists(join(enh, 'unipase.asr.json')));
  const why = hasCloud ? 'the spliced copy was deleted: a worker rebuilds the pure UniPASE copy and checks its quality (Chad 10-31: never splice)' : 'the spliced copy was deleted and no UniPASE output is on tower: remastering again';
  m.remaster = { ...r, status: 'waiting', verdict: undefined, why, judged: undefined, output_assessment: undefined, swapped: 0, swapped_pct: 0, fallback_sent_pct: 0, flagged_sent_pct: r.flagged_sent_pct ?? r.fallback_sent_pct ?? null,
    spliced_before: { swapped: r.swapped, sentences: r.sentences, fallback_sent_pct: r.fallback_sent_pct ?? null, purified_at: at }, at };
  if (m.qa?.remaster) m.qa.remaster = { ...m.qa.remaster, output_assessment: undefined };
  m.enhancement.variants = (m.enhancement.variants || []).filter((v) => v.name !== 'unipase');
  if (m.enhancement.listening === 'unipase') { m.enhancement.listening = m.enhancement.listening_before?.name || 'safe'; m.enhancement.listening_why = 'the spliced remaster was deleted; the pure remaster is being rebuilt'; markAudioPending(m); }
  delete m.remaster_tier; delete m.stages?.verify;
  await queue('media-cloud-order', { mode: hasCloud ? 'post' : 'restore', ids: [it.id], redo: true }, 'media-remaster-rejudge');
  return hasCloud;
}

/** Judge one held talk and apply it. → 'publish' | 'rerun' | 'hold' | 'requeued' | 'purified' | 'unchanged'. Idempotent: a hold already recorded under this rule is left alone. */
export async function rejudgeOne(it, m, { repo, queue, now = () => new Date().toISOString(), force = false } = {}) {
  const r = m.remaster || {}, at = now(), j = remasterJudgement(m), judged = { action: j.action, reason: j.reason, problems: j.problems, rule: JUDGE_RULE, at };
  const purify = async () => { await purifySpliced(it, m, { queue, now }); m.qa = { ...(m.qa || {}), remaster: qualityOf(m) }; await writeMeta(it.dir, m); const { indexFields } = await import('./item.js'); await repo.setIndex(it.id, indexFields(m)); return 'purified'; };
  if (isSpliced(m) && m.enhancement) return purify();   // before the unchanged check: a hold recorded for a spliced copy never stands
  if (!force && r.status === 'review' && r.judged?.action === 'hold' && r.judged.rule === JUDGE_RULE) return 'unchanged';
  const save = async () => { m.qa = { ...(m.qa || {}), remaster: qualityOf(m) }; await writeMeta(it.dir, m); const { indexFields } = await import('./item.js'); await repo.setIndex(it.id, indexFields(m)); };
  // back into the remaster queue in normal order: nothing here plays the original (a kept/deferred talk without a stored assessment, or an assessment to redo)
  const requeue = async (why) => { m.remaster = { ...r, status: 'waiting', verdict: undefined, why, judged: { ...judged, action: 'requeue', reason: why } }; await save(); return 'requeued'; };
  if (['kept', 'deferred'].includes(r.status) && !assessmentOf(m)) return requeue('back in the remaster queue: no talk plays the original (Chad 10-31)');
  if (j.action === 'hold') {
    m.remaster = { ...r, status: 'review', verdict: 'review', why: j.reason, judged };
    await save(); return 'hold';
  }
  if (j.action === 'rerun' && j.stages[0] === 'remaster') return requeue(j.reason);
  const v = (m.enhancement?.variants || []).find((x) => x.name === 'unipase');
  if (!m.enhancement || !v?.file || !(await exists(join(it.dir, v.file)))) return requeue('the remaster file is not on tower: remastering again');
  flipToRemaster(m, { verdict: 'pass-judged', judged: { ...judged, action: 'publish' }, at });
  if (j.action === 'rerun') m.remaster.rerun_n = Number(r.rerun_n || 0) + 1;
  await save();
  await queueAfterFlip(queue, it.id, m, 'media-remaster-rejudge');
  return j.action === 'rerun' ? 'rerun' : 'publish';
}

const pass = { cursor: 0, nextScan: 0 };
export const resetRejudge = () => { pass.cursor = 0; pass.nextScan = 0; };
/** One paced tick (30 s feed): up to `limit` held talks judged; cursor through the held list, rescanned every 30 min for new holds. Counts persist in COUNTS_FILE. */
export async function rejudgePass({ repo, queue, readMeta, limit = 3, ids = null, force = false, countsFile = COUNTS_FILE, pending = null, nowMs = Date.now } = {}) {
  const read = readMeta || ((dir) => readJson(join(dir, 'meta.json')));
  if (!ids && nowMs() < pass.nextScan) return { idle: true };
  if (!ids && pending && (await pending()) > 30) return { paused: 'media-item queue is busy' };
  const rows = ids ? (await Promise.all([].concat(ids).map((x) => (/^\d+$/.test(String(x)) ? repo.getMediaItem(Number(x)) : repo.getMediaBySlug(String(x)))))).filter((x) => x?.dir) : await repo.heldCandidates(pass.cursor, 60);
  const out = { judged: 0, publish: 0, hold: 0, rerun: 0, requeued: 0, purified: 0, unchanged: 0, errors: [] };
  for (const it of rows) {
    if (!ids) pass.cursor = it.id;
    if (out.judged >= limit) { if (!ids) pass.cursor = it.id - 1; break; }
    const m = await read(it.dir).catch(() => null);
    if (!m?.remaster) continue;
    if (!['review', 'kept', 'deferred'].includes(m.remaster.status) && !(m.remaster.status === 'done' && isSpliced(m))) continue;
    try {
      const o = await rejudgeOne(it, m, { repo, queue, force });
      out[o]++; if (o !== 'unchanged') out.judged++;
    } catch (err) { out.errors.push(`${it.slug}: ${String(err.message).slice(0, 120)}`); }
  }
  if (!ids && !rows.length) { pass.cursor = 0; pass.nextScan = nowMs() + 30 * 60_000; }
  if (out.judged) {
    const c = await readJson(countsFile, {});
    for (const k of ['publish', 'hold', 'rerun', 'requeued', 'purified']) c[k] = (c[k] || 0) + out[k];
    c.at = new Date().toISOString(); c.rule = JUDGE_RULE;
    await mkdir(dirname(countsFile), { recursive: true }).catch(() => {});
    await writeFile(countsFile, JSON.stringify(c, null, 1)).catch(() => {});
  }
  return out;
}

const PROBLEM_TEXT = { overall_regression: 'overall quality dropped', speech_regression: 'the speech sounds worse', bad_excerpt: 'a stretch sounds clearly worse', clipping: 'distortion', nisqa_down: 'speech score fell', duration: 'length differs', word_fallback: 'words differ from the original transcript', spliced: 'old spliced copy being rebuilt', realign_failed: 'word timing failed' };
/** Excerpts to listen to: the quality samples (worst first) and the sentences the remaster changed. → [{ start_s, len_s, note }] */
export function excerptsOf(m, guard = null) {
  const a = assessmentOf(m), out = [];
  const rows = (a?.samples || []).map((s) => ({ start_s: s.start_s, len_s: 20, d: (s.restored?.nisqa?.[0] ?? 0) - (s.reference?.nisqa?.[0] ?? 0) })).sort((x, y) => x.d - y.d);
  for (const s of rows.slice(0, 3)) out.push({ start_s: Math.round(s.start_s), len_s: s.len_s, note: `speech score ${s.d >= 0 ? '+' : ''}${Math.round(s.d * 100) / 100} in this stretch` });
  for (const g of (guard?.detail || []).filter((x) => x.swap).slice(0, 2)) out.push({ start_s: Math.max(0, Math.round(g.s - 3)), len_s: 15, note: 'the remaster\'s words differ from the original transcript here' });
  return out;
}

/** The held page's data: talks held for Chad (judged hold) and the archived, with reasons, scores and signed A/B clip URLs. `sign(slug, which, start, end)` → query string. */
export async function heldList({ repo, readMeta, sign }) {
  const read = readMeta || ((dir) => readJson(join(dir, 'meta.json')));
  const held = [], archived = [], count = { unjudged: 0, by_problem: {} };
  for (const it of await repo.heldRows()) {
    const m = await read(it.dir).catch(() => null);
    const r = m?.remaster;
    if (!r) continue;
    if (r.status === 'review' && !r.judged) { count.unjudged++; continue; }
    if (!['review', 'archived'].includes(r.status)) continue;
    const j = remasterJudgement(m), guard = r.fallback_sent_pct > 0 ? await readJson(join(it.dir, 'enhanced', 'unipase.guard.json'), null) : null;
    const ex = excerptsOf(m, guard).map((e) => ({ ...e, original_url: `/api/media/admin/held/${it.slug}/clip/original?${sign(it.slug, 'original', e.start_s, e.start_s + e.len_s)}`, remaster_url: `/api/media/admin/held/${it.slug}/clip/remaster?${sign(it.slug, 'remaster', e.start_s, e.start_s + e.len_s)}` }));
    const row = { id: it.id, slug: it.slug, title: m.title || it.title || it.slug, speaker: m.speaker || it.speaker || null, duration_s: it.duration_s || m.duration_s || null, grade: m.quality?.overall || null,
      status: r.status === 'archived' ? 'archived' : 'held', reason: r.status === 'archived' ? (r.archived_why || 'archived') : (r.judged?.reason || r.why || j.reason), problems: r.judged?.problems || j.problems, scores: j.scores, excerpts: ex, page: `/media/${it.slug}` };
    if (row.status === 'archived') archived.push(row); else { held.push(row); for (const p of row.problems) count.by_problem[p] = (count.by_problem[p] || 0) + 1; }
  }
  return { counts: { held: held.length, archived: archived.length, ...count }, problem_text: PROBLEM_TEXT, held, archived };
}
