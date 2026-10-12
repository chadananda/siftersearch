// Ops job reingest-carry: re-ingest books whose rows drifted from their files AND carry the derived work on the replaced
// rows to the new rows holding the same words (carry-map.js). Before each book: a backup line on /tank (reversible).
// Paced like ingest-files. params: { ids: docIds[], backup? } — Chad 10-11.
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { config } from '../config.js';
import { listDocs } from '../docs-repo.js';
import { withAIContext } from '../ai-context.js';
import { mapRows, planColumns, linkTargets, countQuestions, CARRY_COLUMNS } from './carry-map.js';
import { waitForQuietWriter } from './ctai-jobs.js';
import { snapshotRows, linksFor, mentionsV2For, graphMentionsFor, applyColumns, relink, moveMentionsV2, moveGraphMentions, carryLinksFor, retireLinks } from '../repos/carry-repo.js';

const hasWork = (r) => CARRY_COLUMNS.some((c) => r[c] != null && r[c] !== '');

/** Carry columns, links and mentions from REPLACED old rows onto FRESH new rows. Shared by reingest-carry and carry-repair. */
export async function carryOnto({ replaced, fresh, after, links, m2, gm }) {
  const st = { enriched_replaced: 0, carried_rows: 0, links_moved: 0, mentions_v2_moved: 0, graph_moved: 0, unmapped_enriched: 0, unmapped_links: 0, unmapped_mentions: 0 };
  if (!replaced.length) return st;
  const map = mapRows(replaced, fresh);
  const newById = new Map(after.map((x) => [x.id, x]));
  const enriched = replaced.filter(hasWork);
  st.enriched_replaced = enriched.length;
  st.unmapped_enriched = enriched.filter((o) => !map.get(o.id)?.length).length;
  const cols = planColumns(enriched, map, newById);
  await applyColumns(cols); st.carried_rows = cols.length;
  const repl = new Set(replaced.map((o) => o.id));
  const lm = [];
  for (const l of links) {
    const side = repl.has(l.trans_id) ? 'trans' : repl.has(l.orig_id) ? 'orig' : null;
    if (!side) continue;
    const targets = linkTargets(map.get(side === 'trans' ? l.trans_id : l.orig_id));
    if (!targets.length) { st.unmapped_links++; continue; }
    for (const t of targets) lm.push({ link: l, transId: side === 'trans' ? t.id : l.trans_id, origId: side === 'orig' ? t.id : l.orig_id });
  }
  await relink(lm); st.links_moved = lm.length;
  const mv = [];
  for (const m of m2) {
    const cands = map.get(Number(m.para_id)); if (!cands) continue;
    if (!cands.length) { st.unmapped_mentions++; continue; }
    mv.push({ id: m.id, to: (cands.find((c) => String(newById.get(c.id)?.text || '').includes(m.surface)) || cands[0]).id });
  }
  await moveMentionsV2(mv); st.mentions_v2_moved = mv.length;
  const gv = [];
  for (const m of gm) { const cands = map.get(Number(m.content_id)); if (cands?.length) gv.push({ id: m.id, to: cands[0].id }); else if (cands) st.unmapped_mentions++; }
  await moveGraphMentions(gv); st.graph_moved = gv.length;
  return st;
}

export async function reingestCarryJob({ ids = [], backup = `/tank/sifter/carry-backups/carry-${new Date().toISOString().slice(0, 10)}.jsonl` } = {}) {
  const { ingestDocument } = await import('../../services/ingester.js');
  mkdirSync(dirname(backup), { recursive: true });
  const tot = { docs: 0, failed: [], replaced_rows: 0, enriched_replaced: 0, carried_rows: 0, links_moved: 0, mentions_v2_moved: 0, graph_moved: 0,
    unmapped_enriched: 0, unmapped_links: 0, unmapped_mentions: 0, paced_ms: 0 };
  for (let i = 0; i < ids.length; i += 200) {
    const { docs } = await listDocs({ ids: ids.slice(i, i + 200), fields: ['id', 'file_path'], limit: 200 });
    for (const d of docs) {
      await waitForQuietWriter();
      const t0 = Date.now();
      try {
        const abs = d.file_path && join(config.library.basePath, d.file_path);
        if (!abs || !existsSync(abs)) { tot.failed.push({ id: d.id, error: 'no file' }); continue; }
        const before = await snapshotRows(d.id);
        const ids0 = before.map((r) => r.id);
        const [links, m2, gm] = [await linksFor(ids0), await mentionsV2For(ids0), await graphMentionsFor(ids0)];
        appendFileSync(backup, JSON.stringify({ doc: d.id, at: new Date().toISOString(), rows: before.filter(hasWork), links, mentions_v2: m2, graph_mentions: gm }) + '\n');

        const r = await withAIContext({ caller: 'ops-reingest-carry', localOnly: true }, () => ingestDocument(readFileSync(abs, 'utf8'), {}, d.file_path));
        if (r.status === 'error') { tot.failed.push({ id: d.id, error: r.error }); continue; }

        const after = await snapshotRows(d.id);
        const kept = new Set(after.map((x) => x.id));
        const replaced = before.filter((x) => !kept.has(x.id));
        const fresh = after.filter((x) => !ids0.includes(x.id));
        tot.docs++; tot.replaced_rows += replaced.length;
        if (!replaced.length) continue;
        const c = await carryOnto({ replaced, fresh, after, links, m2, gm });
        for (const k of Object.keys(c)) tot[k] = (tot[k] || 0) + c[k];
      } catch (err) { tot.failed.push({ id: d.id, error: String(err.message || err).slice(0, 200) }); }
      const rest = Math.max(1000, 2 * (Date.now() - t0)); tot.paced_ms += rest;
      await new Promise((r) => setTimeout(r, rest));
    }
  }
  tot.failed = tot.failed.slice(0, 200);
  return { backup, ...tot };
}

/** Before vs after, per doc: rows with HyPE / any carried column, alignment links, mentions (v2 + graph). Reads the
 *  backup the carry job wrote. params: { ids, backup } */
export async function carryVerifyReport({ ids = [], backup = `/tank/sifter/carry-backups/carry-${new Date().toISOString().slice(0, 10)}.jsonl` } = {}) {
  const want = new Set(ids.map(Number));
  const before = new Map();
  for (const line of readFileSync(backup, 'utf8').split('\n').filter(Boolean)) {
    const b = JSON.parse(line); if (!want.has(b.doc)) continue;
    before.set(b.doc, { hype: b.rows.filter((r) => r.hyp_questions).length, questions: countQuestions(b.rows), carried_rows: b.rows.length, links: b.links.length,
      mentions_v2: b.mentions_v2.length, graph: b.graph_mentions.length });
  }
  const out = [];
  for (const id of want) {
    const rows = await snapshotRows(id); const rid = rows.map((r) => r.id);
    const after = { hype: rows.filter((r) => r.hyp_questions).length, questions: countQuestions(rows), carried_rows: rows.filter(hasWork).length,
      links: (await linksFor(rid)).length, mentions_v2: (await mentionsV2For(rid)).length, graph: (await graphMentionsFor(rid)).length };
    out.push({ id, before: before.get(id) || null, after });
  }
  return { docs: out };
}

/** Re-apply the carry for books already re-ingested, from the backup snapshot (old rows + their ids): columns onto the
 *  current rows, and graph mentions still pointing at the old (now deleted) ids. params: { ids, backup? } */
export async function carryRepairJob({ ids = [], backup = `/tank/sifter/carry-backups/carry-${new Date().toISOString().slice(0, 10)}.jsonl` } = {}) {
  const want = new Set(ids.map(Number));
  const snaps = new Map();
  for (const line of readFileSync(backup, 'utf8').split('\n').filter(Boolean)) { const b = JSON.parse(line); if (want.has(b.doc)) snaps.set(b.doc, b); }
  const out = [];
  for (const [doc, b] of snaps) {
    const after = await snapshotRows(doc);
    const live = new Set(after.map((x) => x.id));
    const replaced = b.rows.filter((r) => !live.has(r.id));
    const gm = await graphMentionsFor(replaced.map((r) => r.id));   // still keyed to the old ids
    const st = await carryOnto({ replaced, fresh: after, after, links: [], m2: [], gm });
    // links the first (pre-fix) carry fanned out to every overlapping row: keep only the corrected targets
    const map = mapRows(replaced, after);
    const want = new Set();
    for (const l of b.links || []) {
      const repl = new Set(replaced.map((r) => r.id));
      const side = repl.has(l.trans_id) ? 'trans' : repl.has(l.orig_id) ? 'orig' : null; if (!side) continue;
      for (const t of linkTargets(map.get(side === 'trans' ? l.trans_id : l.orig_id))) want.add(`${side === 'trans' ? t.id : l.trans_id}:${side === 'orig' ? t.id : l.orig_id}`);
    }
    const extra = (await carryLinksFor(after.map((r) => r.id))).filter((l) => !want.has(`${l.trans_id}:${l.orig_id}`)).map((l) => l.id);
    await retireLinks(extra);
    out.push({ doc, replaced: replaced.length, ...st, extra_links_retired: extra.length });
  }
  return { docs: out };
}
