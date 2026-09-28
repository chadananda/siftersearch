// Shadow linking (api/lib/identity-audit.js): Jev links every name occurrence in a book beside the pipeline's binding.
// READ-ONLY. --doc=N [--paras=K first K paragraphs]. Report: logs/identity-shadow-link-<doc>-<stamp>.json — agreement
// rate, and each CONFIDENT disagreement with its text, for a reader. Triggered by POST /api/admin/server/identity-shadow-link.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';

const args = process.argv.slice(2);
const val = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const docId = Number(val('doc')); const maxParas = Number(val('paras')) || Infinity;
const { queryAll, queryOne } = await import('../api/lib/db.js');
const { entityLookup } = await import('../api/lib/entity-api.js');
const { linkParagraph, windowAround, SURE } = await import('../api/lib/identity-audit.js');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('logs', { recursive: true });

const doc = await queryOne(`SELECT title FROM docs WHERE id = ?`, [docId]);
const ms = await queryAll(`SELECT anchor, para_id, surface, entity_id, resolved_as FROM entity_mentions_v2 WHERE doc_id = ? ORDER BY para_id, occurrence`, [docId]);
const byPara = new Map(); for (const m of ms) (byPara.get(m.para_id) || byPara.set(m.para_id, []).get(m.para_id)).push(m);
const paras = [...byPara.keys()].slice(0, maxParas);

const candCache = new Map(); const cardCache = new Map();
const candsFor = async (surface) => {
  if (!candCache.has(surface)) candCache.set(surface, (await entityLookup(surface, { limit: 5 }).catch(() => [])).map((c) => c.id));
  return candCache.get(surface);
};
const cards = async (ids) => {
  const need = ids.filter((i) => !cardCache.has(i));
  if (need.length) {
    const rows = await queryAll(`SELECT ge.id, COALESCE(ec.card, ge.canonical_name) card FROM graph_entities ge LEFT JOIN entity_cards ec ON ec.entity_id = ge.id WHERE ge.id IN (${need.map(() => '?').join(',')})`, need);
    for (const r of rows) cardCache.set(r.id, String(r.card).slice(0, 520));
  }
  return ids.filter((i) => cardCache.has(i)).map((id) => ({ id, card: cardCache.get(id) }));
};

const out = []; let calls = 0; const t0 = Date.now();
for (const pid of paras) {
  const c = await queryOne(`SELECT text FROM content WHERE doc_id = ? AND (external_para_id = ? OR ('p' || id) = ?) AND deleted_at IS NULL`, [docId, pid, pid]);
  if (!c?.text) continue;
  const occ = [];
  for (const m of byPara.get(pid)) {
    const ids = [...new Set([...(await candsFor(m.surface)), ...(m.entity_id ? [m.entity_id] : [])])];
    occ.push({ ...m, cands: await cards(ids) });
  }
  for (let i = 0; i < occ.length; i += 10) {
    calls++;
    const judged = await linkParagraph(String(c.text).slice(0, 3500), occ.slice(i, i + 10));
    for (const j of judged) {
      const bound = j.entity_id ?? null;
      const agree = j.pick === bound || (bound == null && (j.pick === 'new' || j.pick === 'none'));
      out.push({ anchor: j.anchor, para_id: pid, surface: j.surface, label: j.resolved_as, bound, pick: j.pick, confidence: j.confidence,
        outcome: j.pick === 'error' ? 'error' : agree ? 'agree' : j.confidence >= SURE ? 'disagree-confident' : 'disagree-weak',
        ...(agree ? {} : { window: windowAround(c.text, j.surface, 260), boundCard: bound ? cardCache.get(bound)?.slice(0, 160) : null,
          pickCard: typeof j.pick === 'number' ? cardCache.get(j.pick)?.slice(0, 160) : null }) });
    }
  }
}
const counts = out.reduce((o, r) => ((o[r.outcome] = (o[r.outcome] || 0) + 1), o), {});
const report = { docId, title: doc?.title, paragraphs: paras.length, occurrences: out.length, calls, ms: Date.now() - t0, counts,
  agreement: out.length ? Math.round(1000 * (counts.agree || 0) / out.length) / 10 : null,
  review: out.filter((r) => r.outcome === 'disagree-confident'), weak: out.filter((r) => r.outcome === 'disagree-weak').slice(0, 60) };
writeFileSync(`logs/identity-shadow-link-${docId}-${stamp}.json`, JSON.stringify(report, null, 1));
console.log(`REPORT logs/identity-shadow-link-${docId}-${stamp}.json`, JSON.stringify(counts));
process.exit(0);
