// Book-level MAIN-CHARACTER cast seed for disambiguation (cross-chapter identity is a main-character problem).
// A curated who's-who of the book's principal recurring figures (importance-ranked) with aliases, a short
// identifying role, and explicit "≠ (not to be confused with)" disambiguators for similar-named figures — e.g. the
// two S̱hayḵh Abú-Turábs (Mullá Ḥusayn's brother-in-law vs the Imám-Jum‘ih of Shíráz), the several Mírzá Aḥmads.
// Seeded (cached) into every chapter's disambiguation prompt so a bare/variant name resolves BOOK-WIDE to the right
// person and namesakes are actively kept apart.  CLI: node scripts/entity-read/cast-seed.mjs 21308
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const BATCH = { 21308: 'db-v1', 21310: 'gpb-v1' };
const HON = new Set('mirza haji hajji mulla siyyid sayyid aqa aqay shaykh sheikh ustad karbilai mashhadi hajj jinab khan mir the of son daughter dervish native known as one his her'.split(' '));
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ".]/g, '').toLowerCase();
const toks = (s) => [...new Set(nrm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !HON.has(t)))];
const shortRole = (summary, desc, n = 90) => { const s = String(summary || desc || '').replace(/\s+/g, ' ').trim(); return (s.split(/(?<=[.;])\s/)[0] || '').slice(0, n); };

export async function buildCastSeed(doc, { main = 80 } = {}) {
  const batch = BATCH[doc];
  const scope = batch ? await queryAll(`SELECT DISTINCT entity_id id FROM entity_claims WHERE import_batch=?`, [batch]) : [];
  const ids = new Set(scope.map((r) => r.id));
  const persons = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.aliases, er.summary, er.description
    FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name AND er.entity_type='person'
    WHERE ge.entity_type='person' ORDER BY (ge.importance IS NULL), ge.importance DESC`);
  const parsed = persons.map((p) => { let al = []; try { al = JSON.parse(p.aliases || '[]'); } catch { /* */ } return { ...p, al: Array.isArray(al) ? al : [], tk: toks(`${p.cn} ${(Array.isArray(al) ? al : []).join(' ')}`) }; });
  const inBook = ids.size ? parsed.filter((p) => ids.has(p.id)) : parsed;
  const mains = inBook.slice(0, main);
  const mainIds = new Set(mains.map((m) => m.id));
  // namesake index across ALL persons (so we can point at confusables even if they're minor)
  const byTok = new Map();
  for (const p of parsed) for (const t of p.tk) { if (!byTok.has(t)) byTok.set(t, []); byTok.get(t).push(p); }
  const lines = [];
  for (const m of mains) {
    const alias = m.al.filter((a) => nrm(a) !== nrm(m.cn) && a.length > 1).slice(0, 3);
    // confusables: other persons sharing distinctive name tokens, ranked by (# shared tokens, importance)
    const shared = new Map();
    for (const t of m.tk) for (const o of (byTok.get(t) || [])) if (o.id !== m.id) shared.set(o.id, (shared.get(o.id) || 0) + 1);
    const conf = [...shared.entries()].map(([id, n]) => ({ p: parsed.find((x) => x.id === id), n }))
      .sort((a, b) => (b.n - a.n) || ((b.p.imp || 0) - (a.p.imp || 0))).slice(0, 3);
    let line = `• ${m.cn}`;
    if (alias.length) line += ` [aka ${alias.join('; ')}]`;
    const role = shortRole(m.summary, m.description); if (role) line += ` — ${role}`;
    if (conf.length) line += `  ≠ ${conf.map((c) => `${c.p.cn}${(() => { const r = shortRole(c.p.summary, c.p.description, 46); return r ? ` (${r})` : ''; })()}`).join('; ')}`;
    lines.push(line);
  }
  return { seed: lines.join('\n'), count: mains.length, scoped: ids.size > 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const doc = +process.argv[2] || 21308;
  const { seed, count, scoped } = await buildCastSeed(doc);
  console.log(`# MAIN CAST for doc ${doc} — ${count} figures (${scoped ? 'book-scoped' : 'global fallback'})\n`);
  console.log(seed);
  process.exit(0);
}
