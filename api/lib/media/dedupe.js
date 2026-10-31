// Duplicate talks (Chad 10-31: "duplicate talks should merge metadata and eliminate all but the best"). A group = every copy of
// one talk. The best = MEASURED quality (remaster NISQA when every copy has one, else the original's) then completeness — never
// length or bitrate. Its metadata gains what the others knew (gaps filled, conflicts recorded, every provenance kept); the rest
// get terminal outcome 'duplicate' (off air, out of search, out of every queue, files kept, slug → 301 to the best).
// Groups are CONFIRMED by content (the gate: same audio, or the whole transcripts the same speech + dates agree), never by a label;
// a copy the gate dissolves has what media-dedupe did reversed. intakeDedupe = the preview stage's check; mediaDedupeJob = every group.
import { join } from 'path';
import { isComplete, indexFields, COMPLETE_STAGES } from './item.js';
import { words } from './preview.js';

export const NOISE = 0.2;   // NISQA MOS: two copies closer than this are the same quality as far as the measurement can tell
const RUN_NAMES = ['media-item', 'media-compute', 'media-asr', 'media-diar', 'media-llm', 'media-fetch'];
const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
const fmt = (v) => (v == null ? '?' : String(Math.round(v * 100) / 100));
const GRADES = 'ABCDE';

/** One copy's measured quality: remaster output NISQA, original NISQA, grade letter, on air, stages missing. */
export function copyQuality(meta) {
  if (!meta) return { remaster: null, original: null, grade: null, on_air: false, missing: COMPLETE_STAGES.length };
  const a = meta.remaster?.output_assessment || meta.qa?.remaster?.output_assessment || {};
  const remaster = meta.remaster?.status === 'done' || meta.remaster?.status == null ? num(a.restored?.nisqa?.[0]) : null;
  const original = num(meta.quality?.raw?.nisqa?.mos) ?? num(a.reference?.nisqa?.[0]);
  return { remaster, original, grade: meta.quality?.overall || null, on_air: isComplete(meta), missing: indexFields(meta).stages_missing };
}

const live = (c) => c.state === 'done' && Number(c.restored) === 1;
// completeness order: on air, fewer stages missing, better grade, the older row
const fuller = (a, b) => (b.q.on_air - a.q.on_air) || (a.q.missing - b.q.missing)
  || ((a.q.grade ? GRADES.indexOf(a.q.grade) : 9) - (b.q.grade ? GRADES.indexOf(b.q.grade) : 9)) || (a.id - b.id);

/** copies [{id, slug, meta, state?, restored?}] → { best, basis, reason, ambiguous }. A copy with no meta (never processed) never wins over one that has. */
export function pickBest(copies) {
  const all = copies.map((c) => ({ c, id: Number(c.id), q: copyQuality(c.meta), has: !!c.meta }));
  for (const x of all) x.q.on_air = x.q.on_air || (x.c.state !== undefined && live(x.c));
  const measured = all.filter((x) => x.has);
  const pool = measured.length ? measured : all;
  const basis = pool.length > 1 && pool.every((x) => x.q.remaster != null) ? 'remaster' : 'original';
  const score = (x) => x.q[basis];
  const scored = pool.filter((x) => score(x) != null).sort((a, b) => score(b) - score(a) || fuller(a, b));
  if (!scored.length) {
    const best = [...pool].sort(fuller)[0];
    return { best: best.c, basis, reason: `no ${basis} NISQA measured; the more complete copy`, ambiguous: pool.length > 1, unmeasured: pool.length > 1 };
  }
  const top = score(scored[0]);
  const near = scored.filter((x) => top - score(x) < NOISE);
  const ambiguous = near.length > 1;
  const best = ambiguous ? [...near].sort(fuller)[0] : scored[0];
  const rest = pool.filter((x) => x !== best).map((x) => fmt(score(x))).join(', ');
  const reason = `${basis} NISQA ${fmt(score(best))} vs ${rest || '—'}${ambiguous ? ` (within noise ${NOISE}; the more complete copy${best.q.on_air ? ', on air' : ''})` : ''}`;
  return { best: best.c, basis, reason, ambiguous };
}

// ── the content gate (10-31): Dewey's label is a candidate, never proof. Two copies are the same talk only when the content
// says so — the same audio file, or transcripts whose word sequences overlap on their shared portion — AND their dates agree.
export const GATE = { containment: 0.5, coverage: 0.3, minWords: 150 };   // set from the measured distribution (planning/media-dedupe-gate-20261031.md)
const GRAM = 5;
/** text → Set of word 5-grams (the normalizer Dewey's preview uses). */
export function gramSet(text) {
  const ws = words(text), s = new Set();
  for (let i = 0; i + GRAM <= ws.length; i++) s.add(ws.slice(i, i + GRAM).join(' '));
  return { grams: s, words: ws.length };
}
/** Two gram sets → { containment: shared / smaller (a trimmed intro or tail costs nothing), coverage: shared / larger }. */
export function overlap(a, b) {
  if (!a?.grams.size || !b?.grams.size) return null;
  const [small, large] = a.grams.size <= b.grams.size ? [a.grams, b.grams] : [b.grams, a.grams];
  let hit = 0; for (const g of small) if (large.has(g)) hit++;
  return { containment: hit / small.size, coverage: hit / large.size };
}
const fullDate = (v) => /\b(1[89]\d\d|20\d\d)-(\d\d)-(\d\d)\b/.exec(String(v ?? ''))?.[0] || null;
/** Dates agree, or one side has none: two full dates must be equal, otherwise the years must be. */
export function datesAgree(ma = {}, mb = {}) {
  const da = fullDate(ma?.date), db = fullDate(mb?.date);
  if (da && db) return da === db;
  const ya = yearOf(ma?.date) || yearOf(ma?.year), yb = yearOf(mb?.date) || yearOf(mb?.year);
  return !ya || !yb || ya === yb;
}
const sameAudio = (a, b) => {
  const sa = a.meta?.source?.sha256, sb = b.meta?.source?.sha256, fa = a.meta?.fingerprint ?? a.fingerprint, fb = b.meta?.fingerprint ?? b.fingerprint;
  return (sa && sa === sb) ? 'same file (sha256)' : (fa && fa === fb) ? 'same audio fingerprint' : null;
};
/** Two copies (each { meta, text: gramSet|null }) → { same, by, containment?, coverage?, dates_agree }. */
export function confirmPair(a, b, gate = GATE) {
  const dates = datesAgree(a.meta, b.meta);
  const audio = sameAudio(a, b);
  const ok = (x) => x.text && x.text.words >= gate.minWords;
  const ov = ok(a) && ok(b) ? overlap(a.text, b.text) : null;
  const r = { dates_agree: dates, ...(ov ? { containment: Math.round(ov.containment * 1000) / 1000, coverage: Math.round(ov.coverage * 1000) / 1000 } : {}) };
  if (audio) return { ...r, same: dates, by: audio };
  if (!ov) return { ...r, same: false, by: 'content unconfirmed (no transcript to compare)' };
  const content = ov.containment >= gate.containment && ov.coverage >= gate.coverage;
  return { ...r, same: content && dates, by: content ? 'transcript overlap' : 'transcripts differ' };
}
/** Pair results → components (confirmed groups, ≥2 copies) + dissolved copies. Edges are confirmed pairs only. */
export function componentsOf(copies, pairs) {
  const idx = new Map(copies.map((c, i) => [name(c), i])), parent = copies.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) x = parent[x]; return x; };
  for (const p of pairs) if (p.same) parent[find(idx.get(p.b))] = find(idx.get(p.a));
  const comp = new Map();
  copies.forEach((c, i) => { const k = find(i); comp.set(k, [...(comp.get(k) || []), c]); });
  const components = [...comp.values()].filter((g) => g.length > 1), inComp = new Set(components.flat());
  return { components, dissolved: copies.filter((c) => !inComp.has(c)) };
}
/** A candidate group (copies with { meta, text }) → { components, dissolved, pairs }. */
export function gateGroup(copies, gate = GATE) {
  const pairs = [];
  for (let i = 0; i < copies.length; i++) for (let j = i + 1; j < copies.length; j++) pairs.push({ a: name(copies[i]), b: name(copies[j]), ...confirmPair(copies[i], copies[j], gate) });
  return { ...componentsOf(copies, pairs), pairs };
}

// fields filled from the other copies when the best lacks them (summary/topics/description come from the best's own transcript)
const FILL = ['speaker', 'date', 'year', 'place', 'occasion', 'event', 'series', 'part', 'language'];
const empty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
const yearOf = (v) => (v == null ? null : /\b(1[89]\d\d|20\d\d)\b/.exec(String(v))?.[1] || null);
const norm = (v) => String(v).trim().toLowerCase().replace(/\s+/g, ' ');

/** Provenance entries a copy carries: its labels (donor sidecar, meta.provenance) and its source path. */
function provenanceOf(c) {
  const out = [...(c.meta?.provenance || []), ...(c.sidecar ? [c.sidecar] : [])].map((p) => (typeof p === 'string' ? { label: p } : p));
  const path = c.meta?.source?.path || c.source_ref;
  if (path) out.push({ path, slug: c.slug || null, id: c.id ?? null });
  return out;
}
const provKey = (p) => (p.label ? `l:${p.label}` : p.path ? `p:${p.path}` : JSON.stringify(p));

/** best + others → { patch, merged:[{field,value,from}], conflicts:[{field,kept,other,from}], changed }. Never overwrites the best. */
export function mergeMeta(best, others) {
  const bm = best.meta || {}, patch = {}, merged = [], conflicts = [];
  for (const o of others) {
    const om = o.meta;
    if (!om) continue;
    for (const f of FILL) {
      const ov = om[f];
      if (empty(ov)) continue;
      const cur = f in patch ? patch[f] : bm[f];
      // a date and a year must agree: a year that contradicts the best's date (or a date its year) is a conflict, never a fill
      const clash = empty(cur) && ((f === 'year' && yearOf(patch.date ?? bm.date) && yearOf(patch.date ?? bm.date) !== yearOf(ov))
        || (f === 'date' && yearOf(patch.year ?? bm.year) && yearOf(patch.year ?? bm.year) !== yearOf(ov)));
      if (clash) { if (!conflicts.some((x) => x.field === f && norm(x.other) === norm(ov))) conflicts.push({ field: f, kept: f === 'year' ? (patch.date ?? bm.date) : (patch.year ?? bm.year), other: ov, from: o.slug }); }
      else if (empty(cur)) { patch[f] = ov; merged.push({ field: f, value: ov, from: o.slug }); }
      else if (norm(cur) !== norm(ov) && !conflicts.some((x) => x.field === f && norm(x.other) === norm(ov))) conflicts.push({ field: f, kept: cur, other: ov, from: o.slug });
    }
  }
  const titles = [...(bm.alt_titles || [])];
  for (const o of others) {
    const t = o.meta?.title;
    if (t && norm(t) !== norm(bm.title || '') && !titles.some((x) => norm(x) === norm(t))) titles.push(t);
  }
  if (titles.length !== (bm.alt_titles || []).length) patch.alt_titles = titles;
  const prov = [...(bm.provenance || [])].map((p) => (typeof p === 'string' ? { label: p } : p));
  const seen = new Set(prov.map(provKey));
  for (const p of [...provenanceOf({ ...best, meta: { ...bm, provenance: [] } }), ...others.flatMap(provenanceOf)]) {
    const k = provKey(p);
    if (!seen.has(k)) { seen.add(k); prov.push(p); }
  }
  if (prov.length !== (bm.provenance || []).length) patch.provenance = prov;
  return { patch, merged, conflicts, changed: Object.keys(patch).length > 0 };
}

/** media rows → groups (arrays of rows): joined by dup_group, Dewey's "duplicate of <slug>", "same file as item N", meta.dedup.of. */
export function groupsFromRows(rows) {
  const byId = new Map(rows.map((r) => [Number(r.id), r])), bySlug = new Map(rows.filter((r) => r.slug).map((r) => [r.slug, r]));
  const parent = new Map(rows.map((r) => [Number(r.id), Number(r.id)]));
  const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x; };
  const union = (a, b) => { const x = find(a), y = find(b); if (x !== y) parent.set(Math.max(x, y), Math.min(x, y)); };
  const linked = new Set();
  const byGroup = new Map();
  for (const r of rows) {
    const id = Number(r.id);
    if (r.dup_group != null) { const g = Number(r.dup_group); if (byGroup.has(g)) union(id, byGroup.get(g)); else byGroup.set(g, id); if (byId.has(g)) union(id, g); linked.add(id); }
    const m = /^Dewey duplicate of (\S+)/.exec(r.why || '') || (r.meta?.dedup?.verdict === 'duplicate' && r.meta.dedup.of ? [null, r.meta.dedup.of] : null);
    if (m && bySlug.has(m[1])) { union(id, Number(bySlug.get(m[1]).id)); linked.add(id); linked.add(Number(bySlug.get(m[1]).id)); }
    const s = /^same file as item (\d+)/.exec(r.why || '');
    if (s && byId.has(Number(s[1]))) { union(id, Number(s[1])); linked.add(id); linked.add(Number(s[1])); }
  }
  const out = new Map();
  for (const r of rows) {
    const id = Number(r.id);
    if (!linked.has(id)) continue;
    const k = find(id);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return [...out.values()].filter((g) => g.length > 1);
}

/** The preview stage's dedupe check: { item, meta, verdict } (verdict 'duplicate' of a held slug) → { action:'duplicate'|'best', best, group, reason }. */
export async function intakeDedupe({ item, meta, verdict, text = null }, { repo, readMeta, readText = defaultReadText, gate = GATE }) {
  if (meta?.dedup?.verdict === 'best') return { action: 'best', best: meta.slug || null, group: meta.dedup.group ?? null, reason: meta.dedup.reason || 'chosen best earlier' };
  const held = verdict?.of ? await repo.getMediaBySlug(verdict.of) : null;
  if (!held) return { action: 'new', best: null, group: null, reason: `held copy ${verdict?.of || '?'} not found: content not confirmed` };
  const heldMeta = held.dir ? await readMeta(held.dir).catch(() => null) : null;
  // the content gate: the whole transcripts must be the same speech (and the dates agree), not just the preview windows
  const heldText = held.dir ? await readText(held.dir).catch(() => '') : '';
  const check = confirmPair({ meta, text: text ? gramSet(text) : null }, { ...held, meta: heldMeta || {}, text: heldText ? gramSet(heldText) : null }, gate);
  if (!check.same) return { action: 'new', best: null, group: null, reason: `not the same talk as ${held.slug || `#${held.id}`}: ${check.by}${check.dates_agree ? '' : ', dates disagree'}`, check };
  const group = Number(held.dup_group ?? held.id);
  const pick = pickBest([{ ...held, meta: heldMeta || held.meta || null }, { id: item.id, slug: meta?.slug || null, meta, state: 'queued', restored: 0 }]);
  const newWins = Number(pick.best.id) === Number(item.id);
  return { action: newWins ? 'best' : 'duplicate', best: newWins ? (meta?.slug || null) : held.slug, group, reason: pick.reason, ambiguous: pick.ambiguous, held, check };
}

const defaultReadMeta = async (dir) => JSON.parse(await (await import('fs/promises')).readFile(join(dir, 'meta.json'), 'utf8'));
async function defaultWriteMeta(dir, m) {
  const { writeFile, rename } = await import('fs/promises');
  const p = join(dir, 'meta.json'), t = `${p}.${process.pid}.dedupe.tmp`;
  await writeFile(t, JSON.stringify(m, null, 1)); await rename(t, p);
}
const defaultSidecar = async (path) => {
  if (!path) return null;
  try { return JSON.parse(await (await import('fs/promises')).readFile(`${path}.source.json`, 'utf8')); } catch { return null; }
};
const name = (c) => c.slug || `#${c.id}`;

// transcript text for the gate: the raw ASR (both copies were transcribed the same way), else the worked paragraphs
async function defaultTextStamp(dir) {
  const { stat } = await import('fs/promises');
  for (const f of ['transcript.raw.json', 'transcript.work.json']) { const s = await stat(join(dir, f)).catch(() => null); if (s) return `${f}@${s.mtimeMs}`; }
  return null;
}
async function defaultReadText(dir) {
  const { readFile } = await import('fs/promises');
  const raw = JSON.parse(await readFile(join(dir, 'transcript.raw.json'), 'utf8').catch(() => 'null'));
  if (raw?.segments?.length) return raw.segments.map((s) => s.text || (s.words || []).map((w) => w.w || '').join(' ')).join(' ');
  const w = JSON.parse(await readFile(join(dir, 'transcript.work.json'), 'utf8').catch(() => 'null'));
  return (w?.paragraphs || []).map((p) => p.text || (p.words || []).map((x) => x.w || '').join(' ')).join(' ');
}
const PAIR_CACHE = new Map();   // "id@stamp|id@stamp|gate" → pair result (the reports service is long-lived; transcripts rarely change)
const defaultPrior = async () => JSON.parse(await (await import('fs/promises')).readFile(new URL('../../../data/media-dedupe-prior-20261031.json', import.meta.url), 'utf8').catch(() => '{}'));
const HIST = (v) => Math.min(19, Math.floor(v * 20));
const histOut = (h) => Object.fromEntries(h.map((n, i) => [`${(i / 20).toFixed(2)}-${((i + 1) / 20).toFixed(2)}`, n]));

/** What media-dedupe did to this copy that a dissolved group must undo → the patch, or null when untouched. */
export function undoPlan(c, { others = [], prior = {}, merged = [], revive = false } = {}) {
  const n = name(c), m = c.meta || {}, before = prior.prior?.[n];
  const loser = c.state === 'duplicate' && /^duplicate of /.test(c.why || '');
  const best = !!m.dedup_best || m.dedup?.verdict === 'best';
  if (!loser && !best && c.dup_group == null) return null;
  const plan = { copy: n, id: Number(c.id), from: c.state, to: null, why: null, meta: null, doc: loser && c.doc_id ? Number(c.doc_id) : null, republish: false };
  if (loser) {
    // back to what it was before the run; a talk Dewey had already held as a duplicate stays held unless `revive` (content unconfirmed = not a duplicate)
    const dewey = m.dedup?.of ? `Dewey duplicate of ${m.dedup.of} (${m.dedup.by || '?'}, score ${m.dedup.score ?? '?'})` : 'Dewey duplicate (label only)';
    if (before && before !== 'duplicate') { plan.to = before; plan.why = `media-dedupe reversed: content not confirmed the same talk (was ${before})`; plan.republish = before === 'done'; }
    else if (revive) { plan.to = 'queued'; plan.why = `media-dedupe reversed: ${dewey} not confirmed by content; processed as its own talk`; }
    else { plan.to = 'duplicate'; plan.why = `${dewey}; media-dedupe gate: content not confirmed`; }
  }
  // the metadata: strip what the other copies of the dissolved group contributed; drop the dedupe marks
  const gone = new Set(others.map(name)), goneIds = new Set(others.map((o) => Number(o.id))), gonePaths = new Set(others.map((o) => o.meta?.source?.path || o.source_ref).filter(Boolean));
  const next = { ...m };
  for (const f of merged.filter((x) => x.best === n && gone.has(x.from))) if (norm(next[f.field] ?? '') === norm(f.value)) { delete next[f.field]; plan.republish ||= c.state === 'done'; }
  const titles = new Set(others.map((o) => norm(o.meta?.title || '')).filter(Boolean));
  if (Array.isArray(next.alt_titles)) { next.alt_titles = next.alt_titles.filter((t) => !titles.has(norm(t))); if (!next.alt_titles.length) delete next.alt_titles; }
  const goneLabels = new Set(others.flatMap((o) => (o.sidecar ? [provKey(typeof o.sidecar === 'string' ? { label: o.sidecar } : o.sidecar)] : [])));
  if (Array.isArray(next.provenance)) {
    next.provenance = next.provenance.filter((p) => !(p && typeof p === 'object' && ((p.slug && gone.has(p.slug)) || (p.id != null && goneIds.has(Number(p.id))) || (p.path && gonePaths.has(p.path)) || goneLabels.has(provKey(p)))));
    if (!next.provenance.length) delete next.provenance;
  }
  if (next.dedup_best) {
    const left = (next.dedup_best.duplicates || []).filter((x) => !gone.has(x));
    if (left.length) next.dedup_best = { ...next.dedup_best, duplicates: left }; else delete next.dedup_best;
  }
  if (next.dedup && (next.dedup.verdict === 'best' || next.dedup.best)) {
    const { best: _b, group: _g, over: _o, reason: _r, ...keep } = next.dedup;
    next.dedup = { ...keep, verdict: loser && plan.to === 'duplicate' ? 'duplicate' : 'dissolved', dissolved_at: null };
  }
  plan.meta = next;
  return plan;
}

/** media-dedupe ops job. Candidate groups (Dewey's labels) → the content gate → confirmed groups: best chosen, metadata merged,
 *  the rest eliminated; copies the gate dissolves: what media-dedupe did is reversed. Dry run unless { write: true }. */
export async function mediaDedupeJob({ write = false, sample = 25, pairs: listPairs = false, gate: gateOver = null, revive = false } = {}, deps = {}) {
  if (write && !deps.allowWrite) return { write: false, paused: 'gate thresholds not yet set from the measured distribution; eliminations paused' };
  const gate = { ...GATE, ...(gateOver || {}) };
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const readMeta = deps.readMeta || defaultReadMeta, writeMeta = deps.writeMeta || defaultWriteMeta, readSidecar = deps.readSidecar || defaultSidecar;
  const textStamp = deps.textStamp || defaultTextStamp, readText = deps.readText || defaultReadText;
  const prior = deps.prior || await defaultPrior();
  const cache = deps.pairCache || PAIR_CACHE;
  const now = deps.now || (() => new Date().toISOString());
  const rows = await repo.dedupeRows();
  const groups = groupsFromRows(rows);
  const runs = new Map();   // item id → [run id]
  for (const n of RUN_NAMES) {
    for (const r of await ops.pendingRuns(n)) for (const id of [r.params?.id, ...[].concat(r.params?.ids || [])].map(Number).filter(Boolean)) runs.set(id, [...(runs.get(id) || []), r.id]);
  }
  const out = { write, gate, candidate_groups: groups.length, groups: 0, eliminated: 0, pending: 0, busy: 0, skipped: 0, already: 0, merged_fields: 0, runs_cancelled: 0, docs_removed: 0,
    measure: { pairs: 0, compared: 0, containment: Array(20).fill(0), coverage: Array(20).fill(0), by: {}, dates_disagree_same_content: 0 },
    dissolved_groups: 0, split_groups: 0, dissolved_copies: 0, restored: { to: {}, docs: 0, republished: 0, meta: 0 }, ambiguous: [], sample: [], dissolved_sample: [], pair_list: listPairs ? [] : undefined, errors: [] };
  for (const members of groups) {
    try {
      const copies = [];
      for (const r of members) {
        const meta = r.dir ? await readMeta(r.dir).catch(() => null) : null;
        copies.push({ ...r, meta, sidecar: await readSidecar(meta?.source?.path || r.source_ref), stamp: r.dir ? await textStamp(r.dir) : null });
      }
      if (copies.some((c) => c.state === 'excluded')) { out.skipped++; continue; }   // an excluded talk stays excluded, every copy
      // 1. the content gate (cached per pair of transcript versions)
      const gkey = JSON.stringify(gate), pairs = [];
      const key = (a, b) => `${a.id}@${a.stamp}|${b.id}@${b.stamp}|${gkey}`;
      let loaded = false;
      for (let i = 0; i < copies.length; i++) for (let j = i + 1; j < copies.length; j++) {
        const a = copies[i], b = copies[j], k = key(a, b);
        if (!cache.has(k)) {
          if (!loaded) { for (const c of copies) { const t = c.dir && c.stamp ? await readText(c.dir).catch(() => '') : ''; c.text = t ? gramSet(t) : null; } loaded = true; }
          cache.set(k, confirmPair(a, b, gate));
        }
        pairs.push({ a: name(a), b: name(b), ...cache.get(k) });
      }
      for (const c of copies) delete c.text;
      for (const p of pairs) {
        out.measure.pairs++; out.measure.by[p.by] = (out.measure.by[p.by] || 0) + 1;
        if (p.containment != null) { out.measure.compared++; out.measure.containment[HIST(p.containment)]++; out.measure.coverage[HIST(p.coverage)]++; }
        if (!p.dates_agree && (p.by === 'transcript overlap' || p.by.startsWith('same'))) out.measure.dates_disagree_same_content++;
        if (listPairs) out.pair_list.push({ ...p, states: [copies.find((c) => name(c) === p.a)?.state, copies.find((c) => name(c) === p.b)?.state] });
      }
      const { components, dissolved } = componentsOf(copies, pairs);
      if (!components.length) out.dissolved_groups++; else if (dissolved.length) out.split_groups++;
      // 2. dissolved copies: reverse what media-dedupe did (state, search document, metadata, group link)
      for (const c of dissolved) {
        const plan = undoPlan(c, { others: copies.filter((o) => o !== c), prior, merged: prior.merged || [], revive });
        if (!plan) continue;
        out.dissolved_copies++;
        if (plan.to) out.restored.to[`${plan.from}→${plan.to}`] = (out.restored.to[`${plan.from}→${plan.to}`] || 0) + 1;
        if (out.dissolved_sample.length < sample) out.dissolved_sample.push({ copy: plan.copy, from: plan.from, to: plan.to, why: plan.why, doc: plan.doc, republish: plan.republish,
          pairs: pairs.filter((p) => p.a === plan.copy || p.b === plan.copy).map(({ a, b, by, containment, coverage, dates_agree }) => ({ with: a === plan.copy ? b : a, by, containment, coverage, dates_agree })) });
        if (!write) continue;
        const at = now();
        if (plan.to) await repo.undoDuplicate(plan.id, plan.to, plan.why.slice(0, 500));
        else await repo.clearDupGroup([plan.id]);
        if (plan.doc && plan.to !== 'duplicate') {
          const { content } = deps.content ? { content: deps.content } : await import('../content.js');
          out.restored.docs += (await content.restoreRetiredDocs([plan.doc], { since: prior.since || at, reason: `media-dedupe reversed: ${plan.copy}` })).restored || 0;
        }
        if (c.dir && c.meta && JSON.stringify(plan.meta) !== JSON.stringify(c.meta)) { await writeMeta(c.dir, { ...plan.meta, ...(plan.meta.dedup ? { dedup: { ...plan.meta.dedup, dissolved_at: at } } : {}) }); out.restored.meta++; }
        if (plan.republish) { const queue = deps.queue || (await import('../repos/ops-report-repo.js')).enqueue; await queue('media-item', { id: plan.id, redo: ['update'] }, 'media-dedupe-reversed'); out.restored.republished++; }
        const purge = deps.purge || (await import('./edge-purge.js')).purgeTalk;
        if (c.slug) await purge(c.slug).catch(() => false);
      }
      // 3. each confirmed group: the best, the merge, the eliminations
      for (const comp of components) { out.groups++; await settleGroup(comp, { pairs, runs, out, write, sample, repo, ops, writeMeta, now, deps }); }
    } catch (err) {
      out.errors.push({ group: members.map(name), error: String(err.message).slice(0, 300) });
    }
  }
  out.measure.containment = histOut(out.measure.containment); out.measure.coverage = histOut(out.measure.coverage);
  return out;
}

async function settleGroup(copies, { pairs, runs, out, write, sample, repo, ops, writeMeta, now, deps }) {
  const g = Math.min(...copies.map((r) => Number(r.dup_group ?? r.id)), ...copies.map((r) => Number(r.id)));
  const pick = pickBest(copies);
  if (pick.unmeasured && !live(pick.best)) { out.unmeasured = (out.unmeasured || 0) + 1; return; }   // decided once the copies are graded
  const best = pick.best, others = copies.filter((c) => c !== best);
  const bestLive = live(best);
  // the on-air stand-in stays on air until the better copy is complete; everything else goes
  const losers = others.filter((c) => bestLive || !live(c));
  if ([best, ...copies.filter(live)].some((c) => runs.has(Number(c.id)))) { out.busy++; return; }
  const m = mergeMeta(best, others);
  const todo = losers.filter((c) => !(c.state === 'duplicate' && Number(c.dup_group) === g && (!c.meta || (c.meta.dedup?.verdict === 'duplicate' && c.meta.dedup.best === best.slug))));
  const evidence = pairs.filter((p) => copies.some((c) => name(c) === p.a) && copies.some((c) => name(c) === p.b) && p.same).map(({ a, b, by, containment, coverage }) => ({ a, b, by, containment, coverage }));
  const entry = { group: g, best: name(best), basis: pick.basis, reason: pick.reason, ambiguous: pick.ambiguous, evidence, eliminate: todo.map(name),
    keep_on_air: bestLive ? [] : others.filter(live).map(name), merged: m.merged, conflicts: m.conflicts, status: bestLive ? 'eliminate' : 'pending',
    copies: copies.map((c) => ({ copy: name(c), state: c.state, live: live(c), nisqa: copyQuality(c.meta).original, out: copyQuality(c.meta).remaster })) };
  if (pick.ambiguous) out.ambiguous.push({ group: g, best: entry.best, reason: pick.reason, copies: copies.map(name) });
  // nothing new: never rewrite the meta.json of a talk the pipeline may be working on
  const marked = Number(best.meta?.dedup_best?.group) === g && (bestLive || best.meta?.dedup?.verdict === 'best');
  if (!todo.length && !m.changed && (marked || !best.meta) && best.state !== 'duplicate' && Number(best.dup_group) === g) { out.already++; return; }
  if (out.sample.length < sample) out.sample.push(entry);
  out.merged_fields += m.merged.length;
  if (!bestLive) out.pending++;
  if (!write) { out.eliminated += todo.length; return; }
  const at = now();
  // 1. the best: merged metadata (+ why it won, + the content evidence); a copy not yet on air goes back through the pipeline
  if (best.dir && best.meta) {
    const dedupBest = { basis: pick.basis, reason: pick.reason, ambiguous: pick.ambiguous, group: g, evidence, duplicates: [...new Set([...(best.meta.dedup_best?.duplicates || []), ...losers.map(name)])], conflicts: m.conflicts, at };
    const next = { ...best.meta, ...m.patch, dedup_best: dedupBest };
    if (!bestLive) next.dedup = { ...(best.meta.dedup || {}), verdict: 'best', group: g, over: others.map(name), reason: pick.reason, at };
    await writeMeta(best.dir, next);
  }
  if (!bestLive && best.state === 'duplicate') await repo.reviveItem(best.id, `best copy of duplicate group ${g}: ${pick.reason}`.slice(0, 500), g);
  // 2. the rest: terminal 'duplicate' — out of every queue, runs cancelled, search documents removed, edge purged; files kept
  if (todo.length) {
    const ids = todo.map((c) => Number(c.id));
    await repo.markDuplicateItems(ids, `duplicate of ${best.slug || `#${best.id}`}: ${pick.reason}`.slice(0, 500), g);
    for (const id of ids) for (const rid of runs.get(id) || []) { await ops.cancel(rid); out.runs_cancelled++; }
    const docIds = [...new Set(todo.map((c) => Number(c.doc_id || c.meta?.doc_id)).filter(Boolean))];
    const docs = docIds.length ? (deps.docs || await import('../docs-repo.js')) : null;
    for (let i = 0; i < docIds.length; i += 20) {
      const r = await docs.softDeleteDocs(docIds.slice(i, i + 20), { reason: `media-dedupe: duplicate of ${best.slug}`, allowLastCopy: true });
      out.docs_removed += r?.deleted || 0;
      if (r?.refused?.length) out.errors.push({ group: g, refused: r.refused });
    }
    const purge = deps.purge || (await import('./edge-purge.js')).purgeTalk;
    for (const c of todo) if (c.slug) await purge(c.slug).catch(() => false);
    for (const c of todo) {
      if (!c.dir || !c.meta) continue;
      const ev = evidence.filter((p) => p.a === name(c) || p.b === name(c));
      await writeMeta(c.dir, { ...c.meta, dedup: { ...(c.meta.dedup || {}), verdict: 'duplicate', best: best.slug, group: g, reason: pick.reason, evidence: ev, at } });
    }
    out.eliminated += todo.length;
  }
  await repo.setDupGroup(copies.map((c) => Number(c.id)), g);
  // 3. the merged fields reach the published page (provenance-only changes need no re-render)
  if (bestLive && m.merged.length) {
    const queue = deps.queue || (await import('../repos/ops-report-repo.js')).enqueue;
    await queue('media-item', { id: Number(best.id), redo: ['update'] }, 'media-dedupe');
  }
}
