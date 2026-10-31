// Duplicate talks (Chad 10-31: "duplicate talks should merge metadata and eliminate all but the best"). A group = every copy of
// one talk. The best = MEASURED quality (remaster NISQA when every copy has one, else the original's) then completeness — never
// length or bitrate. Its metadata gains what the others knew (gaps filled, conflicts recorded, every provenance kept); the rest
// get terminal outcome 'duplicate' (off air, out of search, out of every queue, files kept, slug → 301 to the best).
// intakeDedupe = the preview stage's check for every new talk; mediaDedupeJob = the pass over every existing group. Deps: item.js.
import { join } from 'path';
import { isComplete, indexFields, COMPLETE_STAGES } from './item.js';

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
export async function intakeDedupe({ item, meta, verdict }, { repo, readMeta }) {
  if (meta?.dedup?.verdict === 'best') return { action: 'best', best: meta.slug || null, group: meta.dedup.group ?? null, reason: meta.dedup.reason || 'chosen best earlier' };
  const held = verdict?.of ? await repo.getMediaBySlug(verdict.of) : null;
  if (!held) return { action: 'duplicate', best: verdict?.of || null, group: null, reason: 'held copy not found' };
  const heldMeta = held.dir ? await readMeta(held.dir).catch(() => null) : null;
  const group = Number(held.dup_group ?? held.id);
  const pick = pickBest([{ ...held, meta: heldMeta || held.meta || null }, { id: item.id, slug: meta?.slug || null, meta, state: 'queued', restored: 0 }]);
  const newWins = Number(pick.best.id) === Number(item.id);
  return { action: newWins ? 'best' : 'duplicate', best: newWins ? (meta?.slug || null) : held.slug, group, reason: pick.reason, ambiguous: pick.ambiguous, held };
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

/** media-dedupe ops job: every duplicate group → best chosen, metadata merged, the rest eliminated. Dry run unless { write: true }. */
export async function mediaDedupeJob({ write = false, sample = 25 } = {}, deps = {}) {
  // PAUSED 10-31 (coordinator): Dewey's group labels pair different talks — no eliminations until the content gate is in
  if (write && !deps.allowWrite) return { write: false, paused: 'content gate not yet in; eliminations paused' };
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const readMeta = deps.readMeta || defaultReadMeta, writeMeta = deps.writeMeta || defaultWriteMeta, readSidecar = deps.readSidecar || defaultSidecar;
  const now = deps.now || (() => new Date().toISOString());
  const rows = await repo.dedupeRows();
  const groups = groupsFromRows(rows);
  const runs = new Map();   // item id → [run id]
  for (const n of RUN_NAMES) {
    for (const r of await ops.pendingRuns(n)) for (const id of [r.params?.id, ...[].concat(r.params?.ids || [])].map(Number).filter(Boolean)) runs.set(id, [...(runs.get(id) || []), r.id]);
  }
  const out = { write, groups: groups.length, eliminated: 0, pending: 0, busy: 0, skipped: 0, already: 0, merged_fields: 0, runs_cancelled: 0, docs_removed: 0, ambiguous: [], sample: [], errors: [] };
  for (const members of groups) {
    try {
      const g = Math.min(...members.map((r) => Number(r.dup_group ?? r.id)), ...members.map((r) => Number(r.id)));
      const copies = [];
      for (const r of members) {
        const meta = r.dir ? await readMeta(r.dir).catch(() => null) : null;
        copies.push({ ...r, meta, sidecar: await readSidecar(meta?.source?.path || r.source_ref) });
      }
      if (copies.some((c) => c.state === 'excluded')) { out.skipped++; continue; }   // an excluded talk stays excluded, every copy
      const pick = pickBest(copies);
      if (pick.unmeasured && !live(pick.best)) { out.unmeasured = (out.unmeasured || 0) + 1; continue; }   // decided once the copies are graded
      const best = pick.best, others = copies.filter((c) => c !== best);
      const bestLive = live(best);
      // the on-air stand-in stays on air until the better copy is complete; everything else goes
      const losers = others.filter((c) => bestLive || !live(c));
      if ([best, ...copies.filter(live)].some((c) => runs.has(Number(c.id)))) { out.busy++; continue; }
      const m = mergeMeta(best, others);
      const todo = losers.filter((c) => !(c.state === 'duplicate' && Number(c.dup_group) === g && (!c.meta || (c.meta.dedup?.verdict === 'duplicate' && c.meta.dedup.best === best.slug))));
      const entry = { group: g, best: name(best), basis: pick.basis, reason: pick.reason, ambiguous: pick.ambiguous, eliminate: todo.map(name),
        keep_on_air: bestLive ? [] : others.filter(live).map(name), merged: m.merged, conflicts: m.conflicts, status: bestLive ? 'eliminate' : 'pending',
        copies: copies.map((c) => ({ copy: name(c), state: c.state, live: live(c), nisqa: copyQuality(c.meta).original, out: copyQuality(c.meta).remaster })) };
      if (pick.ambiguous) out.ambiguous.push({ group: g, best: entry.best, reason: pick.reason, copies: copies.map(name) });
      // nothing new: never rewrite the meta.json of a talk the pipeline may be working on
      const marked = Number(best.meta?.dedup_best?.group) === g && (bestLive || best.meta?.dedup?.verdict === 'best');
      if (!todo.length && !m.changed && (marked || !best.meta) && best.state !== 'duplicate' && Number(best.dup_group) === g) { out.already++; continue; }
      if (out.sample.length < sample) out.sample.push(entry);
      out.merged_fields += m.merged.length;
      if (!bestLive) out.pending++;
      if (!write) { out.eliminated += todo.length; continue; }
      const at = now();
      // 1. the best: merged metadata (+ why it won); a copy not yet on air goes back through the pipeline
      if (best.dir && best.meta) {
        const dedupBest = { basis: pick.basis, reason: pick.reason, ambiguous: pick.ambiguous, group: g, duplicates: [...new Set([...(best.meta.dedup_best?.duplicates || []), ...losers.map(name)])], conflicts: m.conflicts, at };
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
        for (const c of todo) if (c.dir && c.meta) await writeMeta(c.dir, { ...c.meta, dedup: { ...(c.meta.dedup || {}), verdict: 'duplicate', best: best.slug, group: g, reason: pick.reason, at } });
        out.eliminated += todo.length;
      }
      await repo.setDupGroup(copies.map((c) => Number(c.id)), g);
      // 3. the merged fields reach the published page (provenance-only changes need no re-render)
      if (bestLive && m.merged.length) {
        const queue = deps.queue || (await import('../repos/ops-report-repo.js')).enqueue;
        await queue('media-item', { id: Number(best.id), redo: ['update'] }, 'media-dedupe');
      }
    } catch (err) {
      out.errors.push({ group: members.map(name), error: String(err.message).slice(0, 300) });
    }
  }
  return out;
}
