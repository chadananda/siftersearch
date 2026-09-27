// Export every candidate identity merge WITH its textual evidence, for Chad to decide (2026-09-27: "I can decide,
// but you will have to provide all the textual evidence"). Nothing is merged here.
// Candidates: (a) title_of verdicts resolved STRICTLY by name to a live figure; (b) duplicate records of prominent
// people found by name — one name extends the other ("Mullá Ḥusayn" / "Mullá Ḥusayn-i-Bushrú'í") or the same words
// reordered ("Siyyid Káẓim-i-Rashtí" / "Rashtí, Siyyid Káẓim"); (c) merge-stage groups held back on 2026-09-26.
// Evidence per side: names, aliases, summary, importance, claims (statement + verbatim proof + source + paragraph),
// paragraphs where the name occurs (text around it), scenes. Output: logs/merge-review-<ts>.json.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'fs';
const { queryAll } = await import('../api/lib/db.js');
const { LIVE_SQL } = await import('../api/lib/entity-live.js');
const { makeStore } = await import('../api/lib/rag-adapter/store.js');
const { getEncounterIndex, fold } = await import('../api/lib/encounters.js');

const store = makeStore();
const idx = await getEncounterIndex();
const key = (s) => fold(String(s || '').replace(/\([^)]*\)/g, ' ')).trim().replace(/^(the|a) /, '');
const parse = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const pairs = new Map();   // "a|b" → candidate
const add = (a, b, kind, why) => {
  if (!a || !b || a === b) return;
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  const c = pairs.get(k) || { a, b, kinds: [], why: [] };
  if (!c.kinds.includes(kind)) c.kinds.push(kind);
  c.why.push(why);
  pairs.set(k, c);
};

// (a) titles, strict resolution; the model's second-check verdict (if a dry report exists) is shown, not trusted.
const second = new Map();
try {
  const f = readdirSync('logs').filter((x) => x.startsWith('entity-title-merge-dry-')).sort().at(-1);
  const rep = JSON.parse(readFileSync(`logs/${f}`, 'utf8'));
  for (const line of rep.plan || []) second.set(line.split(' → ')[0], `second check: yes — ${line.split(' — ').slice(1).join(' — ')}`);
  for (const line of rep.rejectedSample || []) second.set(line.split(' ✗ ')[0], `second check: no — ${line.split(' — ').slice(1).join(' — ')}`);
} catch { /* no report */ }
const titles = await queryAll(`SELECT r.entity_id id, r.same_as, r.confidence conf, r.reason, ge.canonical_name name
  FROM entity_catalog_review r JOIN graph_entities ge ON ge.id = r.entity_id
  WHERE r.kind = 'title_of' AND r.same_as IS NOT NULL AND ge.entity_type = 'person' AND ${LIVE_SQL('ge.')}`);
for (const t of titles) {
  const want = key(t.same_as);
  const hit = (await store.findCandidateEntities(t.same_as, { type: 'person', limit: 8 }))
    .find((c) => c.id !== t.id && (idx.people.get(c.id)?.forms || []).some((f) => f.phrase === want || f.bare === want));
  if (hit) add(t.id, hit.id, 'title', `catalog review: "${t.name}" is a title of ${t.same_as} (${t.conf}) — ${t.reason}${second.get(t.name) ? `; ${second.get(t.name)}` : ''}`);
}

// (b) name-based duplicates of prominent people
const sortedWords = (ph) => ph.split(' ').filter((w) => !['i', 'the', 'of'].includes(w)).sort().join(' ');
const prominent = [...idx.people.values()].filter((p) => p.imp >= 40);
const byWordsKey = new Map();
for (const p of idx.people.values()) for (const f of p.forms) {
  const k = sortedWords(f.phrase); if (!k.includes(' ')) continue;
  (byWordsKey.get(k) || byWordsKey.set(k, new Set()).get(k)).add(p.id);
}
// Tight rules (the loose first version proposed 1,355 pairs, mostly any two "Mírzá Muḥammad"s):
//   reordered — the two CANONICAL names hold the same words ("Siyyid Káẓim-i-Rashtí" / "Rashtí, Siyyid Káẓim");
//   extended  — one CANONICAL name extends the other's, and any nisba it adds is one the shorter record already
//               carries among its names ("Mullá Ḥusayn" + alias "…-i-Bushrú'í" / "Mullá Ḥusayn-i-Bushrú'í"), never a
//               different one ("Mullá Ḥusayn-i-Yazdí" names another man).
const nisbasOf = (ph) => { const w = ph.split(' '); const out = []; for (let i = 0; i < w.length - 1; i++) if (w[i] === 'i' && w[i + 1].length > 3) out.push(w[i + 1]); return out; };
const canonical = (p) => p.forms.find((x) => x.canonical)?.phrase || '';
const byCanonWords = new Map();
for (const p of idx.people.values()) { const k = sortedWords(canonical(p)); if (k.includes(' ')) (byCanonWords.get(k) || byCanonWords.set(k, []).get(k)).push(p.id); }
for (const p of prominent) {
  const c = canonical(p); if (!c) continue;
  for (const id of byCanonWords.get(sortedWords(c)) || []) if (id !== p.id) add(p.id, id, 'duplicate', `same name, words reordered: "${idx.people.get(id).name}" / "${p.name}"`);
  const known = new Set(p.forms.flatMap((f) => nisbasOf(f.phrase)));
  for (const id of idx.byWord.get(c.split(' ').at(-1)) || []) {
    if (id === p.id) continue;
    const oc = canonical(idx.people.get(id));
    if (!oc.startsWith(`${c} `)) continue;
    const added = nisbasOf(oc).filter((n) => !nisbasOf(c).includes(n));
    if (added.length && !added.every((n) => known.has(n))) continue;   // a different nisba = a different man
    add(p.id, id, 'duplicate', `"${idx.people.get(id).name}" extends "${p.name}"${added.length ? ` with a nisba ${p.name} already carries` : ''}`);
  }
}

// (c) held merge-stage groups
try {
  const f = readdirSync('logs').filter((x) => x.startsWith('entity-merge-dry-')).sort();
  const HELD = new Set(['bahaullah', 'muhammad', 'bahiyyih khanum', 'varqa', 'mirza hadi']);
  for (const file of f) for (const plan of JSON.parse(readFileSync(`logs/${file}`, 'utf8')).plans || []) {
    if (HELD.has(plan.key)) for (const m of plan.merge) add(plan.canonical, m, 'held-merge', `merge stage (held 2026-09-26): ${plan.reason}`);
  }
} catch { /* none */ }

// Evidence
const liveIds = new Set((await queryAll(`SELECT id FROM graph_entities WHERE ${LIVE_SQL()}`)).map((r) => r.id));
const evidence = new Map();
async function side(id) {
  if (evidence.has(id)) return evidence.get(id);
  const ge = (await queryAll(`SELECT ge.id, ge.canonical_name name, ge.importance, er.aliases, er.summary FROM graph_entities ge
    LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name WHERE ge.id = ?`, [id]))[0] || { id };
  const claims = await queryAll(`SELECT ec.relation, ec.statement, substr(ec.proof_verbatim, 1, 240) proof, d.title source, ec.para_id pid
    FROM entity_claims ec LEFT JOIN docs d ON d.id = ec.doc_id WHERE ec.entity_id = ? AND (ec.status IS NULL OR ec.status = 'supported')
    ORDER BY (ec.relation = 'characterized-as') DESC, ec.id LIMIT 14`, [id]);
  const ments = await queryAll(`SELECT m.surface, m.doc_id, m.para_id, d.title FROM entity_mentions_v2 m LEFT JOIN docs d ON d.id = m.doc_id
    WHERE m.entity_id = ? LIMIT 4`, [id]);
  const contexts = [];
  for (const m of ments) {
    const pid = String(m.para_id || '');
    const para = (/^p\d+$/.test(pid) ? await queryAll(`SELECT text FROM content WHERE id = ?`, [Number(pid.slice(1))])
      : await queryAll(`SELECT text FROM content WHERE doc_id = ? AND external_para_id = ? LIMIT 1`, [m.doc_id, pid]))[0];
    if (!para?.text) continue;
    const t = para.text.replace(/\s+/g, ' '); const at = Math.max(0, t.indexOf(m.surface));
    contexts.push({ source: m.title, surface: m.surface, text: t.slice(Math.max(0, at - 200), at + 260) });
  }
  let scenes = [];
  try {
    scenes = await queryAll(`SELECT s.place, s.summary, s.proof, d.title source FROM scene_participants p JOIN entity_scenes s ON s.id = p.scene_id
      LEFT JOIN docs d ON d.id = s.doc_id WHERE p.entity_id = ? LIMIT 5`, [id]);
  } catch { /* none */ }
  const counts = (await queryAll(`SELECT (SELECT COUNT(*) FROM entity_claims WHERE entity_id = ?) claims, (SELECT COUNT(*) FROM entity_mentions_v2 WHERE entity_id = ?) mentions`, [id, id]))[0];
  const s = { id, name: ge.name, importance: ge.importance, aliases: parse(ge.aliases).slice(0, 12), summary: ge.summary || null, counts, claims, contexts, scenes };
  evidence.set(id, s); return s;
}
const out = [];
for (const c of pairs.values()) {
  if (!liveIds.has(c.a) || !liveIds.has(c.b)) continue;
  const A = await side(c.a), B = await side(c.b);
  // Survivor if merged: the curated record — higher importance, then more mentions.
  const into = (A.importance ?? -1) !== (B.importance ?? -1) ? ((A.importance ?? -1) > (B.importance ?? -1) ? A.id : B.id) : (A.counts.mentions >= B.counts.mentions ? A.id : B.id);
  out.push({ id: `${c.a}-${c.b}`, kinds: c.kinds, why: [...new Set(c.why)].slice(0, 4), into, a: A, b: B });
}
out.sort((x, y) => (Math.max(y.a.importance || 0, y.b.importance || 0)) - (Math.max(x.a.importance || 0, x.b.importance || 0)));
mkdirSync('logs', { recursive: true });
const file = `logs/merge-review-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify({ generated: new Date().toISOString(), candidates: out }));
console.log(`REPORT ${file}`);
console.log(JSON.stringify({ candidates: out.length, byKind: out.reduce((m, c) => { for (const k of c.kinds) m[k] = (m[k] || 0) + 1; return m; }, {}) }));
process.exit(0);
