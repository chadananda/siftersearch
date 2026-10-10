// Known-answer battery for the entity graph — the end-to-end accuracy check no stage ever had. Every case is a fact
// the sources state (with where), run against PRODUCTION raw search (/v1/search, analyze:false) and the dossier API.
// A stage that silently breaks a roster, a scene or a denial fails here instead of polluting data for months.
// known_gap: true = a documented miss (reported, does not fail the run) until the layer that answers it lands.
// Usage: node tests/quality/entity-battery.mjs [--json]    (needs PUBLIC_SIFTER_API_KEY in .env-public)
import dotenv from 'dotenv'; dotenv.config({ path: '.env-public' }); dotenv.config({ path: '.env-secrets' });

const API = process.env.PUBLIC_API_URL || 'https://api.siftersearch.com';
const KEY = process.env.PUBLIC_SIFTER_API_KEY;
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ʼʻ‘’'`´]/g, '').toLowerCase();
const has = (list, name) => list.some((n) => fold(n).includes(fold(name)));

const LETTERS_WHO_MET = ['Mullá Ḥusayn', 'Quddús', 'Siyyid Ḥusayn-i-Yazdí', 'Mírzá Muḥammad-‘Alíy-i-Qazvíní', 'Mírzá Hádí',
  'Mullá ‘Alíy-i-Basṭámí', 'Mullá Jalíl-i-Urúmí', 'Mullá Báqir-i-Tabrízí', 'Mullá Aḥmad-i-Ibdál', 'Rawḍih-Khán-i-Yazdí',
  'Muḥammad-Ḥasan-i-Bushrú', 'Mullá Yúsuf-i-Ardibílí', 'Muḥammad-Báqir-i-Bushrú', 'Khudá-Bakhsh', 'Shaykh Sa‘íd-i-Hindí',
  'Mullá Maḥmúd-i-Khu', 'Mullá Ḥasan-i-Bajistání'];

const CASES = [
  { id: 'lotl-roster', source: 'Dawn-Breakers ch. III; roster of eighteen', kind: 'dossier', entity: 1247655,
    check: (d) => (d.participants || []).length === 18 || `roster has ${(d.participants || []).length}, expected 18` },
  { id: 'lotl-met-bab', source: 'DB para_263 + GPB para_31', q: 'Which Letters of the Living met the Báb?',
    check: (pa) => {
      const missing = LETTERS_WHO_MET.filter((n) => !has(pa.met, n));
      if (missing.length) return `met is missing: ${missing.join(', ')}`;
      if (has(pa.met, 'Ṭáhirih')) return 'Ṭáhirih listed as met';
      return has(pa.notMet.map((p) => p.name), 'Ṭáhirih') || 'Ṭáhirih not in notMet';
    } },
  { id: 'tahirih-bab', source: 'GPB para_31: "never attained the presence of the Báb"', q: 'Did Ṭáhirih ever meet the Báb?',
    check: (pa) => (!pa.met.length && has(pa.notMet.map((p) => p.name), 'Ṭáhirih')) || `met=${pa.met.join(', ')}` },
  { id: 'nabil-bab', source: 'Nabíl became a Bábí c.1847; no recorded meeting', q: 'did Nabíl meet the Báb?',
    check: (pa) => !pa.met.length || `met=${pa.met.join(', ')}` },
  { id: 'nabil-bahaullah', source: 'DB: "I was ushered into His presence"', q: 'did Nabíl meet Bahá’u’lláh?',
    check: (pa) => has(pa.met, 'Nabíl') || `met=${pa.met.join(', ')}` },
  { id: 'quddus-bahaullah', source: 'DB: "Quddús was admitted into the presence of Bahá’u’lláh"', q: 'did Quddús meet Bahá’u’lláh?',
    check: (pa) => has(pa.met, 'Quddús') || `met=${pa.met.join(', ')}` },
  { id: 'bab-husayn-karbila', source: 'Eminent Bahá’ís ¶54 (rawḍih-khání at Mullá Ṣádiq’s house); Bahá’í Sacred Writings',
    q: 'Had the Báb ever met Mullá Ḥusayn prior to Shíráz?', known_gap: true,
    check: (pa, res) => /karbil/i.test(JSON.stringify(res.entities || [])) || 'no Karbilá evidence returned (scene layer pending)' },
];

async function search(q) {
  const r = await fetch(`${API}/api/v1/search`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sifter-Test': '1', 'X-API-Key': KEY },
    body: JSON.stringify({ query: q, limit: 10, analyze: false }) });
  return r.json();
}

const results = [];
for (const c of CASES) {
  const t = Date.now();
  let verdict;
  try {
    if (c.kind === 'dossier') {
      const d = await (await fetch(`${API}/api/v1/entities/${c.entity}`, { headers: { 'X-API-Key': KEY, 'X-Sifter-Test': '1' } })).json();
      verdict = c.check(d.entity || d);
    } else {
      const res = await search(c.q);
      const pa = res.peopleAnswer || { met: [], notMet: [], contested: [], noEvidence: [] };
      verdict = c.check(pa, res);
    }
  } catch (err) { verdict = `error: ${err.message}`; }
  results.push({ id: c.id, ok: verdict === true, known_gap: !!c.known_gap, why: verdict === true ? null : verdict, source: c.source, ms: Date.now() - t });
}
const failed = results.filter((r) => !r.ok && !r.known_gap);
if (process.argv.includes('--json')) console.log(JSON.stringify({ results, failed: failed.length }, null, 1));
else for (const r of results) console.log(`${r.ok ? 'PASS' : r.known_gap ? 'GAP ' : 'FAIL'}  ${r.id.padEnd(20)} ${r.ms}ms  ${r.why || ''}`);
process.exit(failed.length ? 1 : 0);
