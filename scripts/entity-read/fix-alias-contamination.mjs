// Reversibly remove a CONFIRMED contaminated alias — a DIFFERENT person's name wrongly absorbed as an alias — and
// quarantine the roster fact that rode in on it. Each removal is adjudicated by EVIDENCE (does the fact contradict
// the person's established profile?), never by a token heuristic: the scan's other flags were verified legitimate
// (title-aliases like Navváb/Mu‘tamid, or transliteration variants) and are deliberately left untouched.
// Reversible: prior aliases + research_notes are written to a rollback file BEFORE any write, and the removed facts
// are stashed in research_notes._quarantine (not deleted). Dry by default. Run ON tower-nas; WRITE=1 to apply.
//   SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 node scripts/entity-read/fix-alias-contamination.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, query } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';

// EVIDENCE-ADJUDICATED confirmed contamination (subjectRe matches the mis-filed roster fact's opening).
const CONFIRMED = [
  {
    id: 1247617, alias: 'Muṣṭafá', paraId: 'para_369', subjectRe: /^\s*Mu[ṣs]{1,2}[ṭt]afá\s*[—–\-]/,
    reason: 'para_369 is Bahá’u’lláh’s roadside-dervish account (a dishevelled youth by a brook, converted by Bahá’u’lláh). Mírzá Qurbán-‘Alí was an eminent Ni‘matu’lláhí leader, a Bábí martyred in 1850 (before Bahá’u’lláh’s declaration), converted by Mullá Ḥusayn — a categorically different person. "Muṣṭafá" was wrongly absorbed as his alias.',
  },
];

const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const changes = [];
for (const c of CONFIRMED) {
  const r = (await queryAll('SELECT ge.canonical_name cn, er.aliases al, er.research_notes rn FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.id=?', [c.id]))[0];
  if (!r) { console.log('NOT FOUND', c.id); continue; }
  let aliases, notes; try { aliases = JSON.parse(r.al || '[]'); notes = JSON.parse(r.rn || '{}'); } catch { console.log('parse fail', c.id); continue; }
  const keptAliases = aliases.filter((a) => nrm(a) !== nrm(c.alias));
  const isBad = (f) => f && f.paraId === c.paraId && c.subjectRe.test(f.statement || '');
  const removed = [];
  const nextNotes = { ...notes };
  for (const key of ['facts2', 'episodes', 'characterizations']) {
    if (!Array.isArray(notes[key])) continue;
    nextNotes[key] = notes[key].filter((f) => { if (isBad(f)) { removed.push({ ...f, _from: key }); return false; } return true; });
  }
  const stamp = new Date().toISOString();
  nextNotes._quarantine = [...(Array.isArray(notes._quarantine) ? notes._quarantine : []), ...removed.map((f) => ({ ...f, quarantined_reason: c.reason, quarantined_alias: c.alias, quarantined_at: stamp }))];
  console.log(`\n[${c.id}] ${r.cn}`);
  console.log(`  alias "${c.alias}" removed : ${aliases.length} → ${keptAliases.length}  (${aliases.length !== keptAliases.length ? 'dropped' : 'NOT FOUND'})`);
  console.log(`  facts quarantined        : ${removed.length}`);
  for (const f of removed) console.log(`     (${f._from}) "${String(f.statement).slice(0, 84)}"  ${f.paraId || ''}`);
  if (aliases.length === keptAliases.length && !removed.length) { console.log('  nothing to change (already clean)'); continue; }
  changes.push({ cn: r.cn, priorAl: r.al, priorRn: r.rn, nextAl: JSON.stringify(keptAliases), nextRn: JSON.stringify(nextNotes) });
}

if (!WRITE) { console.log(`\nDRY — ${changes.length} record(s) staged. Set WRITE=1 (with SIFTER_WRITER_URL) to apply.`); process.exit(0); }
if (changes.length) {
  const { writeFileSync } = await import('node:fs');
  const f = `/home/chad/sifter/siftersearch/siftersearch-alias-contamination-rollback.json`;
  writeFileSync(f, JSON.stringify(changes.map((c) => ({ cn: c.cn, aliases: c.priorAl, research_notes: c.priorRn })), null, 0));
  console.log(`\nrollback (prior aliases + research_notes) → ${f}`);
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const writeRetry = async (sql, p) => { for (let i = 0; i < 4; i++) { try { return await query(sql, p); } catch (e) { if (i === 3) throw e; await sleep(500 * (i + 1)); } } };
  for (const c of changes) { await writeRetry('UPDATE entity_research SET aliases=?, research_notes=?, updated_at=CURRENT_TIMESTAMP WHERE canonical_name=?', [c.nextAl, c.nextRn, c.cn]); console.log(`  wrote ${c.cn}`); await sleep(40); }
  console.log('DONE');
}
process.exit(0);
