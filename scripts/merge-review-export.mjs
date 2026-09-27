// Export every candidate identity merge WITH its textual evidence, for Chad to decide (2026-09-27: "I can decide,
// but you will have to provide all the textual evidence"). Nothing is merged here.
// Candidates: (a) title_of verdicts resolved STRICTLY by name to a live figure; (b) duplicate records of prominent
// people found by name — one name extends the other ("Mullá Ḥusayn" / "Mullá Ḥusayn-i-Bushrú'í") or the same words
// reordered ("Siyyid Káẓim-i-Rashtí" / "Rashtí, Siyyid Káẓim"); (c) merge-stage groups held back on 2026-09-26;
// (d) held identity pairs the pair judge could not settle (its two judges disagreed) — both verdicts shown.
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
  // PASSAGES — the full paragraphs where this record appears, from its mentions AND its claims (many records exist only
  // through claims; the first export drew on mentions alone, so 418 of 440 title candidates showed nothing — Chad,
  // 2026-09-27: "I cannot make merge decisions without context"). Spread across books; each with its book, a link, and
  // the words to highlight (the surface for a mention, the verbatim proof for a claim).
  const ments = await queryAll(`SELECT m.surface, m.doc_id, m.para_id, d.title FROM entity_mentions_v2 m LEFT JOIN docs d ON d.id = m.doc_id
    WHERE m.entity_id = ? ORDER BY m.doc_id, m.id LIMIT 80`, [id]);
  const claimRefs = await queryAll(`SELECT ec.doc_id, ec.para_id, d.title, substr(ec.proof_verbatim, 1, 200) proof FROM entity_claims ec
    LEFT JOIN docs d ON d.id = ec.doc_id WHERE ec.entity_id = ? AND ec.para_id IS NOT NULL ORDER BY ec.doc_id, ec.id LIMIT 80`, [id]);
  const refs = [...ments.map((m) => ({ doc: m.doc_id, pid: m.para_id, title: m.title, mark: m.surface, via: 'mention' })),
    ...claimRefs.map((c) => ({ doc: c.doc_id, pid: c.para_id, title: c.title, mark: c.proof, via: 'claim' }))];
  const byDoc = new Map();
  for (const r of refs) { const k = `${r.doc}|${r.pid}`; if (!byDoc.has(r.doc)) byDoc.set(r.doc, new Map()); if (!byDoc.get(r.doc).has(k)) byDoc.get(r.doc).set(k, r); }
  const picked = [];
  for (let round = 0; picked.length < 5 && round < 5; round++) for (const m of byDoc.values()) { const r = [...m.values()][round]; if (r && picked.length < 5) picked.push(r); }
  const contexts = [];
  for (const r of picked) {
    const pid = String(r.pid || '');
    const para = (/^p\d+$/.test(pid) ? await queryAll(`SELECT text, paragraph_index FROM content WHERE id = ?`, [Number(pid.slice(1))])
      : await queryAll(`SELECT text, paragraph_index FROM content WHERE doc_id = ? AND external_para_id = ? LIMIT 1`, [r.doc, pid]))[0];
    if (!para?.text) continue;
    let t = para.text.replace(/\s+/g, ' ').trim();
    if (t.length > 1800) { const at = Math.max(0, t.indexOf(String(r.mark || '').slice(0, 40))); t = `${at > 700 ? '…' : ''}${t.slice(Math.max(0, at - 700), at + 1100)}…`; }
    // The TARGET TERM is what gets bolded: a mention's surface; for a claim, the record's name when the paragraph has it.
    const core = String(ge.name || '').replace(/\([^)]*\)/g, ' ').split(/[,;—]/)[0].trim();
    const mark = r.via === 'claim' && core && t.includes(core) ? core : r.mark;
    contexts.push({ source: r.title, doc_id: r.doc, pid, surface: mark, via: r.via, text: t, record: ge.name,
      url: `https://siftersearch.com/document/${r.doc}${para.paragraph_index != null ? `#p${para.paragraph_index}` : ''}` });
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
// (d) pair-judge 'review' results from the latest WRITE report (else dry): the two judges disagreed, so a human decides.
try {
  const files = readdirSync('logs').filter((x) => x.startsWith('identity-pair-judge-')).sort((a, b) => a.split('-').slice(-6).join('').localeCompare(b.split('-').slice(-6).join('')));
  const rep = JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8'));
  for (const r of rep.results || []) if (r.result === 'review')
    add(r.pair[0], r.pair[1], 'held-pair', `pair judge: rule ${r.rule}; model ${r.model?.verdict ?? 'none'} — ${r.model?.tie ?? ''}${r.signals?.veto ? `; veto: ${r.signals.veto.reason}` : ''}`);
} catch { /* no pair-judge report */ }

// ORIGIN — the passage that raised a held pair: the book where the two records were confused (its own decision named
// one record while the stored binding pointed to the other). From the latest identity-materialize dry report.
const heldPairs = new Map();
try {
  const f = readdirSync('logs').filter((x) => x.startsWith('identity-materialize-dry-')).sort().at(-1);
  for (const p of JSON.parse(readFileSync(`logs/${f}`, 'utf8')).pairs || []) heldPairs.set([p.db, p.replay].sort((x, y) => x - y).join('|'), p);
} catch { /* none */ }
async function origin(a, b) {
  const p = heldPairs.get([a, b].sort((x, y) => x - y).join('|'));
  if (!p?.docs?.length || !p?.names?.length) return [];
  const rows = await queryAll(`SELECT m.doc_id, m.para_id, m.surface, d.title FROM entity_mentions_v2 m LEFT JOIN docs d ON d.id = m.doc_id
    WHERE m.doc_id IN (${p.docs.map(() => '?').join(',')}) AND m.resolved_as IN (${p.names.map(() => '?').join(',')}) LIMIT 30`, [...p.docs, ...p.names]);
  const seen = new Set(), out = [];
  for (const r of rows) {
    if (out.length >= 3 || seen.has(r.doc_id)) continue; seen.add(r.doc_id);
    const pid = String(r.para_id || '');
    const para = (/^p\d+$/.test(pid) ? await queryAll(`SELECT text, paragraph_index FROM content WHERE id = ?`, [Number(pid.slice(1))])
      : await queryAll(`SELECT text, paragraph_index FROM content WHERE doc_id = ? AND external_para_id = ? LIMIT 1`, [r.doc_id, pid]))[0];
    if (!para?.text) continue;
    out.push({ source: r.title, surface: r.surface, text: para.text.replace(/\s+/g, ' ').trim().slice(0, 1800),
      url: `https://siftersearch.com/document/${r.doc_id}${para.paragraph_index != null ? `#p${para.paragraph_index}` : ''}`,
      note: `In this book the name “${r.surface}” was decided as #${p.replay}, but the stored link pointed to #${p.db} (${p.mentions} mentions across ${p.docs.length} books).` });
  }
  return out;
}

const out = [];
for (const c of pairs.values()) {
  if (!liveIds.has(c.a) || !liveIds.has(c.b)) continue;
  const A = await side(c.a), B = await side(c.b);
  // Survivor if merged: the curated record — higher importance, then more mentions.
  const into = (A.importance ?? -1) !== (B.importance ?? -1) ? ((A.importance ?? -1) > (B.importance ?? -1) ? A.id : B.id) : (A.counts.mentions >= B.counts.mentions ? A.id : B.id);
  out.push({ id: `${c.a}-${c.b}`, kinds: c.kinds, why: [...new Set(c.why)].slice(0, 4), into, a: A, b: B,
    origin: c.kinds.includes('held-pair') ? await origin(c.a, c.b) : [] });
}
// TRANSLATIONS (Chad, 2026-09-27: "give me a translation of the sentence at least, with the target term bolded"). Every
// passage in Arabic script gets the sentence around the target term translated into English, the term in **bold**.
// DeepSeek (allowed for every language); cached by sentence+term so a passage shared by candidates is translated once.
const { chatCompletion } = await import('../api/lib/ai.js');
const ARABIC = /[\u0600-\u06FF]/;
const sentenceAround = (text, term) => {
  const parts = String(text).split(/(?<=[.!?؟۔])\s+/);
  const i = parts.findIndex((p) => term && p.includes(String(term).slice(0, 30)));
  return (i >= 0 ? parts.slice(Math.max(0, i - 0), i + 1).join(' ') : parts[0] || String(text)).slice(0, 900);
};
const trCache = new Map();
async function translate(x) {
  const sentence = sentenceAround(x.text, x.surface);
  const key = `${sentence}\u0001${x.surface}`;
  if (!trCache.has(key)) trCache.set(key, (async () => {
    try {
      const r = await chatCompletion([
        { role: 'system', content: 'Translate the sentence into clear English. Put the English words that render the TARGET in **bold** (exactly one bold span). Keep names in their usual English transliteration. Return only the translation.' },
        { role: 'user', content: `TARGET: ${x.surface}${x.record ? ` (the record being reviewed: ${x.record})` : ''}\nSENTENCE: ${sentence}` },
      ], { provider: 'deepseek', model: 'deepseek-v4-flash', temperature: 0, maxTokens: 400, caller: 'merge-review-translate' });
      return { original: sentence, english: String(r.content || '').trim() };
    } catch { return null; }
  })());
  x.translation = await trCache.get(key);
}
const needing = out.flatMap((c) => [...(c.a.contexts || []), ...(c.b.contexts || []), ...(c.origin || [])]).filter((x) => ARABIC.test(x.text));
for (let i = 0; i < needing.length; i += 8) await Promise.all(needing.slice(i, i + 8).map(translate));
console.log(`translated ${trCache.size} sentences for ${needing.length} passages`);

out.sort((x, y) => (Math.max(y.a.importance || 0, y.b.importance || 0)) - (Math.max(x.a.importance || 0, x.b.importance || 0)));
mkdirSync('logs', { recursive: true });
const file = `logs/merge-review-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify({ generated: new Date().toISOString(), candidates: out }));
console.log(`REPORT ${file}`);
console.log(JSON.stringify({ candidates: out.length, byKind: out.reduce((m, c) => { for (const k of c.kinds) m[k] = (m[k] || 0) + 1; return m; }, {}) }));
process.exit(0);
