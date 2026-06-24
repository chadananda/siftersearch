// Verify the engine's merge proposals with deterministic signals before any apply:
//  - paragraph overlap (share a paragraph => likely ONE list entry split into 2 entities = SAFE dup;
//    bound to SEPARATE paragraphs in a roster => enumerated DISTINCT people)
//  - honorific-class match (Mullá vs Karbilá'í vs Siyyid vs Mírzá vs Shaykh vs Ḥájí) — mismatch = caution
//  - linking clause in the actual mention text ("surnamed", "better known as", "the same who", "known as")
//  - enumeration ordinal in a name ("second"/"third martyr of") => DISTINCT
// Classifies each proposed merge SAFE / REJECT / REVIEW. Read-only → merge-verified.json.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, writeFileSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const DOC = 21308;
const proposals = JSON.parse(readFileSync('tmp/entity-research/seqread/cluster-merge-proposals.json', 'utf8'));
const merges = proposals.flatMap(o => (o.merges || []).map(m => ({ core: o.core, keep: m.keep, absorb: m.absorb || [], evidence: m.evidence || '' })));
const allIds = [...new Set(merges.flatMap(m => [m.keep, ...m.absorb]))];
const ge = new Map((await queryAll(`SELECT id, canonical_name cn, description d FROM graph_entities WHERE id IN (${allIds.join(',')})`)).map(r => [r.id, r]));
// paragraphs + mention text per entity (within DB)
const cinfo = new Map((await queryAll(`SELECT id, paragraph_index pi, replace(text,char(10),' ') t FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => [String(r.id), r]));
const ment = await graphQueryAll(`SELECT entity_id, content_id FROM entity_mentions WHERE entity_id IN (${allIds.join(',')})`);
const paras = new Map(), texts = new Map();
for (const m of ment) { const c = cinfo.get(String(m.content_id)); if (!c) continue; if (!paras.has(m.entity_id)) { paras.set(m.entity_id, new Set()); texts.set(m.entity_id, []); } paras.get(m.entity_id).add(c.pi); texts.get(m.entity_id).push(c.t); }
const HONS = ['karbila', 'shaykh', 'siyyid', 'mirza', 'mulla', 'haji', 'mir', 'aqa', 'ustad', 'akhund'];
const hon = s => { const n = String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, '').toLowerCase(); return HONS.filter(h => n.includes(h)).sort().join('+'); };
const LINK = /surnamed|better known|the same who|also known|known as|whose real name|called|later named/i;
const ORD = /\b(second|third|fourth|the younger|the elder)\b/i;

const out = [];
for (const m of merges) {
  const kp = ge.get(m.keep);
  for (const aid of m.absorb) {
    const ap = ge.get(aid); if (!kp || !ap) continue;
    const kParas = paras.get(m.keep) || new Set(), aParas = paras.get(aid) || new Set();
    const shared = [...aParas].some(p => kParas.has(p));
    const sepRoster = !shared && [...aParas].length && [...kParas].length;          // both bound, no overlap
    const honMatch = hon(kp.cn) === hon(ap.cn);
    const linkClause = (texts.get(m.keep) || []).concat(texts.get(aid) || []).some(t => LINK.test(t)) || LINK.test(m.evidence);
    const ordinal = ORD.test(kp.cn + ' ' + ap.cn);
    let verdict;
    if (ordinal || (!honMatch && !linkClause)) verdict = 'REJECT';
    else if (linkClause || shared) verdict = 'SAFE';
    else if (sepRoster && /martyr of|of [A-Z]/.test(kp.cn) && /martyr of|of [A-Z]/.test(ap.cn)) verdict = 'REJECT'; // two separate roster entries
    else verdict = 'REVIEW';
    out.push({ core: m.core, keep: m.keep, keepName: kp.cn, absorb: aid, absorbName: ap.cn, verdict, signals: { shared, sepRoster, honMatch, linkClause, ordinal }, evidence: m.evidence.slice(0, 120) });
  }
}
writeFileSync('tmp/entity-research/seqread/merge-verified.json', JSON.stringify(out, null, 1));
const by = v => out.filter(o => o.verdict === v);
console.log(`merge pairs: ${out.length} | SAFE ${by('SAFE').length} | REVIEW ${by('REVIEW').length} | REJECT ${by('REJECT').length}\n`);
for (const v of ['SAFE', 'REVIEW', 'REJECT']) { console.log(`=== ${v} ===`); for (const o of by(v)) console.log(`  [${o.core}] ${o.keep} "${o.keepName}" <= ${o.absorb} "${o.absorbName}"  {shared:${o.signals.shared} sepRoster:${o.signals.sepRoster} hon:${o.signals.honMatch} link:${o.signals.linkClause} ord:${o.signals.ordinal}}`); }
process.exit(0);
