// Ops job reingest-carry: re-ingest books whose rows drifted from their files AND carry the derived work on the replaced
// rows to the new rows holding the same words (carry-map.js). Before each book: a backup line on /tank (reversible).
// Paced like ingest-files. params: { ids: docIds[], backup? } — Chad 10-11.
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { config } from '../config.js';
import { listDocs } from '../docs-repo.js';
import { withAIContext } from '../ai-context.js';
import { mapRows, columnsToCarry, CARRY_COLUMNS } from './carry-map.js';
import { waitForQuietWriter } from './ctai-jobs.js';
import { snapshotRows, linksFor, mentionsV2For, graphMentionsFor, applyColumns, relink, moveMentionsV2, moveGraphMentions } from '../repos/carry-repo.js';

const hasWork = (r) => CARRY_COLUMNS.some((c) => r[c] != null && r[c] !== '');

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

        const r = await withAIContext({ caller: 'ops-reingest-carry' }, () => ingestDocument(readFileSync(abs, 'utf8'), {}, d.file_path));
        if (r.status === 'error') { tot.failed.push({ id: d.id, error: r.error }); continue; }

        const after = await snapshotRows(d.id);
        const kept = new Set(after.map((x) => x.id));
        const replaced = before.filter((x) => !kept.has(x.id));
        const fresh = after.filter((x) => !ids0.includes(x.id));
        const byId = new Map(after.map((x) => [x.id, x]));
        tot.docs++; tot.replaced_rows += replaced.length;
        if (!replaced.length) continue;
        const map = mapRows(replaced, fresh);
        // columns → the best new row
        const colChanges = [];
        for (const o of replaced.filter(hasWork)) {
          tot.enriched_replaced++;
          const best = map.get(o.id)?.[0];
          if (!best) { tot.unmapped_enriched++; continue; }
          const set = columnsToCarry(o, byId.get(best.id));
          if (Object.keys(set).length) { colChanges.push({ id: best.id, set }); Object.assign(byId.get(best.id), set); tot.carried_rows++; }
        }
        await applyColumns(colChanges);
        // alignment links → every new row holding the words (a split original stays linked through each piece)
        const lm = [];
        for (const l of links) {
          const side = replaced.some((o) => o.id === l.trans_id) ? 'trans' : replaced.some((o) => o.id === l.orig_id) ? 'orig' : null;
          if (!side) continue;
          const cands = map.get(side === 'trans' ? l.trans_id : l.orig_id) || [];
          if (!cands.length) { tot.unmapped_links++; continue; }
          for (const c of cands) lm.push({ link: l, transId: side === 'trans' ? c.id : l.trans_id, origId: side === 'orig' ? c.id : l.orig_id });
        }
        await relink(lm); tot.links_moved += lm.length;
        // mentions → the new row whose text holds the surface, else the best
        const mv = [];
        for (const m of m2) {
          const cands = map.get(Number(m.para_id)); if (!cands) continue;
          if (!cands.length) { tot.unmapped_mentions++; continue; }
          const hit = cands.find((c) => String(byId.get(c.id)?.text || '').includes(m.surface)) || cands[0];
          mv.push({ id: m.id, to: hit.id });
        }
        await moveMentionsV2(mv); tot.mentions_v2_moved += mv.length;
        const gv = [];
        for (const m of gm) { const cands = map.get(Number(m.content_id)); if (cands?.length) gv.push({ id: m.id, to: cands[0].id }); else if (cands) tot.unmapped_mentions++; }
        await moveGraphMentions(gv); tot.graph_moved += gv.length;
      } catch (err) { tot.failed.push({ id: d.id, error: String(err.message || err).slice(0, 200) }); }
      const rest = Math.max(1000, 2 * (Date.now() - t0)); tot.paced_ms += rest;
      await new Promise((r) => setTimeout(r, rest));
    }
  }
  tot.failed = tot.failed.slice(0, 200);
  return { backup, ...tot };
}
