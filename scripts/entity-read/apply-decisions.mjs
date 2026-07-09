// Apply reconcile DECISIONS to the projection (Pass 4 apply). Materialize link/create: create a new graph_entities
// row for 'create', then set entity_mentions_v2.entity_id for the whole resolved_as cluster; mark the decision
// applied (records applied_entity_id → reversible). GATED: DRY by default = a REVIEW SUMMARY of proposals. WRITE
// applies status='approved' decisions; AUTO=1 also applies high-confidence proposed link/create (conf≥HICONF);
// 'uncertain' is NEVER applied. New bare entities are invisible to the live bio browser until enriched (it joins
// entity_research), so creating them is additive/safe. Claims inherit entity_id via a follow-up mention join.
//   REVIEW: node scripts/entity-read/apply-decisions.mjs
//   APPLY (approved): SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 node scripts/entity-read/apply-decisions.mjs
//   APPLY (high-conf): SIFTER_WRITER_URL=… WRITE=1 AUTO=1 HICONF=0.85 node scripts/entity-read/apply-decisions.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, query } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const AUTO = process.env.AUTO === '1';
const HICONF = +(process.env.HICONF || 0.85);
const KINDS = (process.env.KINDS || 'link,create').split(',');   // apply only these decision kinds (e.g. KINDS=link)
const FORCE = process.env.FORCE === '1';                         // re-apply already-applied decisions (idempotent overwrite)
const NULLFIRST = process.env.NULLFIRST === '1';                 // clear all mention bindings first (undo stale literal binds)

const all = await queryAll(`SELECT id, kind, payload, evidence, confidence, status, rationale FROM entity_decisions WHERE target_kind='mention-cluster'`);
const parsed = all.map((d) => { let p = {}; try { p = JSON.parse(d.payload || '{}'); } catch { /* */ } return { ...d, p }; });

const byKind = {}; for (const d of parsed) { const k = `${d.kind}/${d.status}`; byKind[k] = (byKind[k] || 0) + 1; }
console.log(`\n=== reconcile proposals (${parsed.length}) ===`);
Object.entries(byKind).sort().forEach(([k, n]) => console.log(`  ${k}: ${n}`));

const creates = parsed.filter((d) => d.kind === 'create').sort((a, b) => (b.p.freq || 0) - (a.p.freq || 0));
const links = parsed.filter((d) => d.kind === 'link').sort((a, b) => (b.p.freq || 0) - (a.p.freq || 0));
const uncertain = parsed.filter((d) => d.kind === 'uncertain');
console.log(`\n--- top CREATE proposals (missing entities) ---`);
creates.slice(0, 18).forEach((d) => console.log(`  ${d.p.freq}× [c=${d.confidence}] “${d.p.canonical}”  · ${d.rationale || ''}`));
console.log(`\n--- top LINK proposals ---`);
links.slice(0, 10).forEach((d) => console.log(`  ${d.p.freq}× [c=${d.confidence}] #${d.p.entity_id}  ← “${d.p.resolved_as?.slice(0, 45)}”`));
console.log(`\n--- uncertain (→ human): ${uncertain.length} ---`);
uncertain.slice(0, 6).forEach((d) => console.log(`  ${d.p.freq}× “${d.p.resolved_as?.slice(0, 55)}”`));

if (WRITE) {
  if (NULLFIRST) { await query(`UPDATE entity_mentions_v2 SET entity_id=NULL, resolution_basis=NULL, resolution_conf=NULL`); console.error('cleared all mention bindings (NULLFIRST)'); }
  const toApply = parsed.filter((d) => KINDS.includes(d.kind) && (FORCE || d.status !== 'applied')
    && (d.status === 'approved' || d.status === 'applied' || (AUTO && (d.confidence || 0) >= HICONF)));
  console.error(`\napplying ${toApply.length} decisions (${AUTO ? `AUTO conf≥${HICONF}` : 'approved only'})…`);
  let created = 0, linked = 0, mentions = 0;
  for (const d of toApply) {
    let eid = d.p.entity_id;
    if (d.kind === 'create') {
      if (!d.p.canonical) continue;
      await query(`INSERT INTO graph_entities (name, canonical_name, entity_type, last_assessed_version) VALUES (?,?,?,?)`, [d.p.canonical, d.p.canonical, 'person', 'reconcile-v1']);
      const r = await queryAll(`SELECT id FROM graph_entities WHERE canonical_name=? ORDER BY id DESC LIMIT 1`, [d.p.canonical]);
      eid = r[0]?.id; if (eid) created++;
    } else linked++;
    if (!eid || !d.p.resolved_as) continue;
    await query(`UPDATE entity_mentions_v2 SET entity_id=?, resolution_basis='reconcile', resolution_conf=? WHERE resolved_as=?`, [eid, d.confidence, d.p.resolved_as]);
    const cnt = await queryAll(`SELECT COUNT(*) n FROM entity_mentions_v2 WHERE resolved_as=? AND entity_id=?`, [d.p.resolved_as, eid]);
    mentions += (cnt[0]?.n || 0);
    await query(`UPDATE entity_decisions SET status='applied', payload=? WHERE id=?`, [JSON.stringify({ ...d.p, applied_entity_id: eid }), d.id]);
  }
  console.log(`\nAPPLIED — ${created} entities created, ${linked} linked, ${mentions} mentions bound`);
}
process.exit(0);
