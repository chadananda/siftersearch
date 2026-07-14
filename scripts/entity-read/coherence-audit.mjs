// Frequency review / CONFLATION auditor — the inverse of split-audit. Walks person entities MOST-frequent →
// least (cutting the single-mention long tail) and verifies every mention bound to an entity denotes the SAME
// person. Catches conflation (many people fused under one entity), e.g. a common-name entity absorbing a
// -Qazvíní AND a -Azghandí. Evidence-based: a routed model reads the DISTINCT surface-forms the mentions were
// bound to (differing nisba/role/era = conflation) and reports outlier surfaces. Read-only; proposes splits.
//
// Usage:  node scripts/entity-read/coherence-audit.mjs [--min 8] [--top 150] [--cc 5]
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const { sifterDeps } = await import('../../api/lib/rag-adapter/index.js');
const { makeModelEngine } = await import('../../api/lib/rag/kernel/model.js');
const { pool } = await import('../../api/lib/rag/kernel/run.js');

const opt = Object.fromEntries(process.argv.slice(2).flatMap((a, i, A) =>
  a.startsWith('--') ? [[a.slice(2), A[i + 1] && !A[i + 1].startsWith('--') ? A[i + 1] : true]] : []));
const CUT = Number(opt.min) || 8;          // ignore the long tail below this many mentions (walk top-down)
const TOP = opt.top ? Number(opt.top) : null;
const CC = Number(opt.cc) || 5;

const deps = sifterDeps();
const engine = makeModelEngine({ llm: deps.llm, catalog: deps.models });
const route = { model: deps.config.models.merge, fallback: deps.config.models.mergeFallback };

const SYSTEM = `You verify whether ALL mentions bound to ONE person-entity really refer to the SAME individual, or whether DIFFERENT people have been CONFLATED under it.
You are given the entity's canonical name and the DISTINCT surface-forms its mentions were bound to, with counts. Judge by EVIDENCE, not by count: a differing NISBA (-i-Qazvíní vs -i-Azghandí), an incompatible role/office/era/kin among the surfaces signals CONFLATION. Honorific/epithet/title/spelling variants of ONE person (e.g. "the Master"/"‘Abbás Effendi", "Mírzá Músá"/"Áqáy-i-Kalím") are the SAME person — not outliers. A pronoun or bare-role surface ("his brother", "the prince") is not itself an outlier. Prefer COHERENT unless a surface clearly denotes someone else.
Return ONLY JSON: {"coherent":true|false,"outliers":[<the surface strings that denote a DIFFERENT person>],"reason":"<=20 words"}.`;

export function parseCoh(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { const j = JSON.parse(m[0]); return { coherent: j.coherent !== false, outliers: Array.isArray(j.outliers) ? j.outliers : [], reason: j.reason || '' }; }
  catch { return null; }
}

const ents = await queryAll(
  `SELECT ge.id, ge.canonical_name n, COUNT(m.id) mm
     FROM graph_entities ge JOIN entity_mentions_v2 m ON m.entity_id=ge.id
    WHERE ge.entity_type='person' AND ge.canonical_name NOT LIKE '%⟨merged%'
    GROUP BY ge.id HAVING mm>=${CUT} ORDER BY mm DESC` + (TOP ? ` LIMIT ${TOP}` : ''));
console.log(`COHERENCE / CONFLATION AUDIT — ${ents.length} entities with ≥${CUT} mentions (top-down), cc=${CC}\n`);

const flagged = [];
let checked = 0;
await pool(CC, ents, async (e) => {
  checked++;
  const surf = await queryAll(
    `SELECT surface, COUNT(*) c FROM entity_mentions_v2 WHERE entity_id=? GROUP BY surface ORDER BY c DESC LIMIT 40`, [e.id]);
  if (surf.length < 2) return; // one surface → coherent by construction
  const user = `ENTITY #${e.id} "${e.n}" (${e.mm} mentions)\nDistinct surface-forms bound to it:\n` +
    surf.map((s) => `  "${s.surface}" ×${s.c}`).join('\n') +
    `\n\nAre these all the SAME person, or is more than one person conflated here?`;
  const { parsed } = await engine.runLadder({ route, system: SYSTEM, user, parse: parseCoh, maxTokens: 300 });
  if (parsed && !parsed.coherent && parsed.outliers.length) flagged.push({ ...e, ...parsed });
});

flagged.sort((a, b) => b.mm - a.mm);
console.log(`\nFLAGGED (likely conflation): ${flagged.length} / ${checked} checked\n`);
for (const f of flagged) {
  console.log(`CONFLATION? #${f.id} "${f.n}" (m=${f.mm})`);
  console.log(`   outliers: ${f.outliers.map((s) => `"${s}"`).join(', ')}`);
  console.log(`   ${f.reason}`);
}
console.log('\nReview each: the outlier surfaces likely belong to a DIFFERENT person and should be split off (evidence-cited).');
process.exit(0);
