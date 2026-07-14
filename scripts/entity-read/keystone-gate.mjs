// Keystone-roster acceptance gate. A curated list of major Heroic-Age figures that MUST each resolve to
// exactly ONE well-grounded entity — regardless of whether the text names them by name, title, or epithet.
// Catches the coreference failure the count-based verify and the same-name merge cannot: a person split
// across their name ("Mírzá Músá"), their title ("Áqáy-i-Kalím") and relational forms. Read-only.
//
// Signal vs noise: substring matching over-catches RELATIONAL descriptors ("father of the Báb", "servant
// of Vaḥíd") which are DIFFERENT people. The relational filter drops those; what remains are true identity
// fragments (name/title/nisba/spelling variants) for review. Differing nisbas are pre-flagged as likely
// namesakes (feedback_nisba_disconflation), not same-person.
//
// Usage:  node scripts/entity-read/keystone-gate.mjs            # human report, exits 1 if any SPLIT/MISSING
//         node scripts/entity-read/keystone-gate.mjs --json     # machine-readable (for the pipeline DoD)
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');

// Each keystone: distinctive self-referential handles only (name, title, epithet) — never relational forms.
export const ROSTER = [
  { who: 'The Báb', forms: ['the Báb', 'Siyyid ‘Alí-Muḥammad', 'Primal Point'] },
  { who: "Bahá'u'lláh", forms: ["Bahá'u'lláh", 'Mírzá Ḥusayn-‘Alí', 'Blessed Beauty', 'Ancient Beauty'] },
  { who: "‘Abdu'l-Bahá", forms: ["‘Abdu'l-Bahá", '‘Abbás Effendi', 'Most Great Branch', 'Ghusn-i-A‘ẓam'] },
  { who: 'Shoghi Effendi', forms: ['Shoghi Effendi'] },
  { who: 'Quddús', forms: ['Quddús', 'Muḥammad-‘Alíy-i-Bárfurúshí'] },
  { who: 'Mullá Ḥusayn', forms: ['Mullá Ḥusayn', 'Bábu’l-Báb'] },
  { who: 'Ṭáhirih', forms: ['Ṭáhirih', 'Qurratu’l-‘Ayn', 'Zarrín-Táj'] },
  { who: 'Vaḥíd', forms: ['Vaḥíd', 'Siyyid Yaḥyáy-i-Dárábí'] },
  { who: 'Ḥujjat', forms: ['Ḥujjat', 'Muḥammad-‘Alíy-i-Zanjání'] },
  { who: 'Mírzá Músá (Áqáy-i-Kalím)', forms: ['Mírzá Músá', 'Áqáy-i-Kalím'] },
  { who: 'Mírzá Yaḥyá (Ṣubḥ-i-Azal)', forms: ['Mírzá Yaḥyá', 'Ṣubḥ-i-Azal'] },
  { who: 'Bahíyyih Khánum', forms: ['Bahíyyih', 'Greatest Holy Leaf'] },
  { who: 'Navváb (Ásíyih Khánum)', forms: ['Ásíyih Khánum', 'Navváb'] },
  { who: 'Ḥájí Mírzá Áqásí', forms: ['Áqásí'] },
  { who: 'Amír-Niẓám', forms: ['Amír-Niẓám', 'Amír Kabír', 'Mírzá Taqí Khán'] },
  { who: "Náṣiri'd-Dín Sháh", forms: ['Náṣiri’d-Dín'] },
  { who: 'Muḥammad Sháh', forms: ['Muḥammad Sháh'] },
  { who: 'Nabíl-i-A‘ẓam (Zarandí)', forms: ['Nabíl-i-A‘ẓam', "Nabíl-i-A'ẓam", 'Muḥammad-i-Zarandí'] },
  { who: 'Badí‘', forms: ['Badí‘'] },
  { who: 'Siyyid Káẓim-i-Rashtí', forms: ['Siyyid Káẓim-i-Rashtí'] },
  { who: "Shaykh Aḥmad-i-Aḥsá'í", forms: ["Shaykh Aḥmad-i-Aḥsá'í", 'Shaykh Aḥmad ibn Zaynu'] },
];

// Relational descriptor → a DIFFERENT person defined by their relation to the figure. Drop from identity set.
const RELATIONAL = /\b(sons?|daughters?|father|mother|brothers?|sisters?|wife|wives|husband|uncle|aunt|cousins?|widow|widower|servants?|attendants?|companions?|followers?|envoys?|messengers?|amanuensis|scribe|nephews?|niece|maid|parents?|consort|betrothed|in-law|Biglarbagi)\b/i;
const REL_OF = /\bof\b/i; // "X of Y" — English connective never appears inside a transliterated personal name.
// Descriptive-placeholder stub (a clause, not a name): "the ... who had grown friendly to X", "renamed ... by X".
const DESCRIPTIVE = /\b(who|whom|which|renamed|unnamed|friendly|previously|transcribed|dictation|grown)\b/i;
const isName = (n) => !(RELATIONAL.test(n) || REL_OF.test(n) || DESCRIPTIVE.test(n));

const nisbaOf = (name) => (name.match(/-i-([A-Za-zÀ-ÿ‘’'`]+)/g) || []).join(',');

async function candidates(forms) {
  const seen = new Map();
  for (const f of forms) {
    const rows = await queryAll(
      `SELECT ge.id, ge.canonical_name n,
              (SELECT COUNT(*) FROM entity_mentions_v2 m WHERE m.entity_id=ge.id) mentions
         FROM graph_entities ge
        WHERE ge.entity_type='person' AND ge.canonical_name LIKE ?`, [`%${f}%`]);
    for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r);
  }
  return [...seen.values()];
}

export async function runGate() {
  const results = [];
  for (const k of ROSTER) {
    const all = (await candidates(k.forms)).sort((a, b) => b.mentions - a.mentions);
    const identity = all.filter((e) => isName(e.n) && e.mentions > 0);
    const assoc = all.length - identity.length; // relational descriptors dropped as distinct associates
    // core = highest-mention identity entity; others sharing its nisba ≈ same-person, differing nisba = namesake
    const core = identity[0];
    const frags = identity.slice(1).map((e) => ({
      ...e,
      hint: !core ? '' : (nisbaOf(e.n) && nisbaOf(core.n) && nisbaOf(e.n) !== nisbaOf(core.n) ? 'namesake?' : '≈same?'),
    }));
    const verdict = identity.length === 0 ? 'MISSING' : identity.length > 1 ? 'SPLIT' : 'ok';
    results.push({ who: k.who, verdict, core, frags, assoc });
  }
  return results;
}

const results = await runGate();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const bad = results.filter((r) => r.verdict !== 'ok');
  const ok = results.filter((r) => r.verdict === 'ok');
  console.log(`KEYSTONE GATE — ${bad.length} flagged / ${results.length} figures\n`);
  for (const r of bad) {
    console.log(`${r.verdict.padEnd(8)}${r.who}   ${r.assoc ? `(${r.assoc} relational assoc. dropped)` : ''}`);
    if (r.core) console.log(`         core  #${r.core.id}  "${r.core.n}"  m=${r.core.mentions}`);
    for (const f of r.frags) console.log(`         frag  #${f.id}  "${f.n}"  m=${f.mentions}   ${f.hint}`);
  }
  console.log('\nSINGLE (ok):');
  for (const r of ok) console.log(`  ${r.who}  → #${r.core.id} (m=${r.core.mentions})`);
  process.exitCode = bad.some((r) => r.verdict === 'MISSING' || r.frags.some((f) => f.hint === '≈same?')) ? 1 : 0;
}
process.exit(process.exitCode || 0);
