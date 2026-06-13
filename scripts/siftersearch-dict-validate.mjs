// DRY-RUN entity-resolution harness — writes NOTHING to the DB.
// Builds a cumulative "who's who" dictionary from a proofread book (default GPB)
// in memory, so we can manually review resolution quality before productionizing.
//
// Per paragraph, in document order (grounded context accumulates):
//   1. retrieve CANDIDATES from the growing dictionary (name-token overlap +
//      always the seed core + top-significance), so namesakes are surfaced.
//   2. ONE DeepSeek call: extract typed entities + resolve each to a candidate
//      (#) or "new", + a terse grounded restatement + hypothetical questions.
//   3. apply to the in-memory dictionary: matched -> bump significance + add the
//      surface as an alias; new -> create canonical entity (+ descriptor).
//
// Persian/Iranian naming model is baked into the prompt: NO family names;
// identity = honorific(s) + given name + nisba (place, "-i-<Place>") [+ laqab/
// title]. The nisba is the primary disambiguator; same given name + different
// nisba = different people; a conferred title links to the given-name+nisba form.
//
//   node scripts/siftersearch-dict-validate.mjs [--doc 21310] [--limit 120]
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });
const { queryAll } = await import('../api/lib/db.js');
const { chatCompletion } = await import('../api/lib/ai.js');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DOC = parseInt(arg('doc', '21310'), 10);   // OceanLibrary "God Passes By" canonical
const LIMIT = parseInt(arg('limit', '120'), 10);
const MODEL = arg('model', 'deepseek-v4-flash');
// Everything Shoghi Effendi names in GPB is, by definition, core — he names
// only what matters to the century's narrative. Entities established while
// processing a canon doc are flagged core (never deprioritized when messier,
// more detailed books like Mázandarání's Táríkh-i-Ẓuhúru'l-Ḥaqq arrive later).
const CANON_DOCS = new Set([21310]);   // 21310 = God Passes By
const CORE = CANON_DOCS.has(DOC);

// ── normalize for matching/dedup: NFD strip-diacritics + lowercase + drop
//    apostrophes/hamza/ayn + hyphens->space, AND fold the genitive linkers that
//    vary between Persian izáfat ("-i-") and Arabic construct/article ("-u'l-",
//    " al-") styles, so "Kitáb-i-Aqdas", "Kitábu'l-Aqdas" and "Kitáb al-Aqdas"
//    all key to "kitab aqdas". Folds transliteration spelling variants of the
//    SAME string (Ṭáhirih==Tahirih) WITHOUT collapsing namesakes — the content
//    tokens (incl. a person's nisba) survive, only the linker is removed. ──
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[-\s](iy?|yi|ul|u['’]?l|i['’]?l|al)[-\s]/g, ' ')   // genitive linker as its own token
  .replace(/u['’]l[-\s]/g, ' ').replace(/['’]l[-\s]/g, ' ')    // attached Arabic article: ...u'l-
  .replace(/[’'ʼʻ`´ʾʿ‘]/g, '').replace(/[-–—]/g, ' ')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Honorifics + connectors carry no disambiguating power on their own; exclude
// them from the name-token match so candidate retrieval keys on given name +
// nisba + title tokens (the parts that actually identify a person).
const STOP = new Set('mulla mirza siyyid sayyid haji hajji shaykh sheikh aqa agha ustad jinab hadrat mir the of i a an and son ibn bin abu abi umm jenab his holiness her'.split(' '));
const nameTokens = s => norm(s).split(' ').filter(t => t.length >= 3 && !STOP.has(t));

// ── seed core: the central figures + the principal heroes of the Báb's
//    Dispensation (they dominate GPB & Dawn-Breakers and have many namesakes).
//    Each carries its title-aliases AND birth-name+nisba aliases so both forms
//    resolve to one entity. Note the deliberate namesake test: Quddús and Hujjat
//    are BOTH "Muḥammad-'Alí", separable only by nisba (Bárfurúshí vs Zanjání). ──
const SEED = [
  { canonical: 'Bahá’u’lláh', type: 'person', descriptor: 'Founder of the Bahá’í Faith; born Mírzá Ḥusayn-‘Alí of Núr; titled the Blessed Beauty.',
    aliases: ['the Blessed Beauty', 'the Ancient Beauty', 'the Abhá Beauty', 'Mírzá Ḥusayn-‘Alí', 'Mírzá Ḥusayn-‘Alíy-i-Núrí', 'Jamál-i-Mubárak'] },
  { canonical: 'the Báb', type: 'person', descriptor: 'Herald/Forerunner of the Bahá’í Faith; born Siyyid ‘Alí-Muḥammad of Shíráz; titled the Primal Point.',
    aliases: ['Siyyid ‘Alí-Muḥammad', 'Siyyid ‘Alí-Muḥammad-i-Shírází', 'the Primal Point', 'the Point', 'the Forerunner', 'the Herald', 'Ḥaḍrat-i-A‘lá'] },
  { canonical: '‘Abdu’l-Bahá', type: 'person', descriptor: 'Eldest son of Bahá’u’lláh; appointed Centre of the Covenant; titled the Master.',
    aliases: ['the Master', '‘Abbás Effendi', 'the Most Great Branch', 'the Greatest Branch', 'Ghuṣn-i-A‘ẓam', 'the Centre of the Covenant', 'the Center of the Covenant', 'Sir ‘Abbás'] },
  { canonical: 'Shoghi Effendi', type: 'person', descriptor: 'Guardian of the Bahá’í Faith; great-grandson of Bahá’u’lláh; author of God Passes By.',
    aliases: ['the Guardian', 'Shoghi Rabbání', 'the Sign of God on Earth'] },
  { canonical: 'Mullá Ḥusayn-i-Bushrú’í', type: 'person', descriptor: 'First to believe in the Báb; first Letter of the Living; from Bushrúyih in Khurásán; titled Bábu’l-Báb.',
    aliases: ['Mullá Ḥusayn', 'Bábu’l-Báb', 'the Gate of the Gate', 'Jináb-i-Bábu’l-Báb'] },
  { canonical: 'Quddús', type: 'person', descriptor: 'Eighteenth and last Letter of the Living; born Muḥammad-‘Alíy-i-Bárfurúshí, from Bárfurúsh in Mázindarán; titled Quddús.',
    aliases: ['Muḥammad-‘Alíy-i-Bárfurúshí', 'Áqá Muḥammad-‘Alí', 'the Last Point'] },
  { canonical: 'Ṭáhirih', type: 'person', descriptor: 'Only female Letter of the Living; poet; from Qazvín; titled Ṭáhirih (the Pure One) / Qurratu’l-‘Ayn.',
    aliases: ['Qurratu’l-‘Ayn', 'Fáṭimih', 'Fáṭimih Baraghání', 'Umm-Salamih', 'the Pure One'] },
  { canonical: 'Vaḥíd', type: 'person', descriptor: 'Learned disciple sent to investigate the Báb; led the Nayríz upheaval; born Siyyid Yaḥyáy-i-Dárábí; titled Vaḥíd.',
    aliases: ['Siyyid Yaḥyáy-i-Dárábí', 'Siyyid Yaḥyá', 'Siyyid Yaḥyáy-i-Núrí'] },
  { canonical: 'Hujjat', type: 'person', descriptor: 'Disciple of the Báb; led the Zanján upheaval; born Mullá Muḥammad-‘Alíy-i-Zanjání; titled Hujjat.',
    aliases: ['Mullá Muḥammad-‘Alíy-i-Zanjání', 'Mullá Muḥammad-‘Alí', 'Hujjat-i-Zanjání'] },
];

const SYSTEM = `You analyze ONE paragraph of carefully-transliterated Bahá'í/Persian religious-historical text for a digital library, doing TWO jobs at once:
(A) EXTRACT the named entities actually present in the CURRENT PARAGRAPH;
(B) RESOLVE each person/place/work/event to a known CANDIDATE entity when it is the SAME one, otherwise mark it "new".

You are given PRIOR CONTEXT (resolved summaries of preceding paragraphs, for reference resolution only), CANDIDATES (known entities that may be referred to here), and the CURRENT PARAGRAPH. Extract ONLY from the CURRENT PARAGRAPH; use PRIOR CONTEXT and general historical knowledge only to decide who/what each reference is.

PERSIAN/IRANIAN NAMING — read carefully, it governs resolution:
- There are NO family names / surnames in this era. A person is a COMPOSITE: honorific(s) + given name + nisba (place of origin, written "-i-<Place>") and/or a conferred title (laqab).
- Honorifics carry meaning: Mullá (cleric), Mírzá (educated; a PRINCE only when it FOLLOWS the name), Siyyid (descendant of the Prophet), Ḥájí/Karbilá'í/Mashhadí (pilgrim to Mecca/Karbilá/Mashhad), Shaykh, Áqá.
- The GIVEN NAME alone barely identifies anyone — Muḥammad, Ḥasan, Ḥusayn, ‘Alí, Mírzá are shared by dozens. The NISBA (village/region) is the primary disambiguator and is usually given when a person is first introduced: "Mullá Ḥusayn-i-Bushrú'í" = Mullá Ḥusayn FROM Bushrúyih.
- A conferred TITLE often becomes the primary identity and is unique: the Báb, Bahá'u'lláh, Quddús, Ṭáhirih, Vaḥíd, Hujjat, the Master, the Guardian. A title and the birth-name+nisba form are the SAME person (e.g. "Vaḥíd" = "Siyyid Yaḥyáy-i-Dárábí").

RESOLUTION RULES (critical):
- A title, epithet, partial name, or variant/alternate spelling of a CANDIDATE is the SAME entity -> return that candidate's number. ("the Master" = ‘Abdu'l-Bahá; "the Blessed Beauty" = Bahá'u'lláh; "Husayn" without diacritics = "Ḥusayn".)
- SAME given name does NOT mean same person. If the nisba/title/context shows a DIFFERENT individual from a same-named candidate, mark "new" — never merge namesakes. (Quddús = Muḥammad-‘Alíy-i-Bárfurúshí and Hujjat = Mullá Muḥammad-‘Alíy-i-Zanjání are DIFFERENT men though both are "Muḥammad-‘Alí".)
- A bare, unqualified given name with no distinguishing detail defaults to the MOST SIGNIFICANT active person of that name (highest significance / established in PRIOR CONTEXT); assign a lesser namesake only when the context names a distinguishing nisba/title/role.
- Never merge two people merely for sharing a name — there are no surnames. When genuinely unsure, prefer "new" with the fullest canonical name you can infer.

EXTRACTION RULES:
- Types: person | place | work (books/tablets/letters) | event | concept (significant doctrinal/technical terms only — Covenant, Manifestation, Dispensation, Letters of the Living; NOT generic phrases like "the Cause", "the friends", "the East"). An abstraction (a Revelation, Cause, Dispensation, Faith, Order) is ALWAYS a concept/event, NEVER a person — even when "His"/"its" points to a person.
- "canonical" = the fullest standard identifying form: honorific + given name + nisba, OR the title the person is known by. Resolve epithets/pronouns to the named person; NEVER output a bare pronoun.
- CANONICAL NAMES MUST BE CLEAN — name/title only, NO parenthetical glosses (canonical "Qayyúmu'l-Asmá'", NOT "Qayyúmu'l-Asmá' (Commentary on the Súrih of Joseph)"). Any clarifying gloss goes in "descriptor" only; a parenthetical inside the canonical fragments the entity into duplicates.
- WORK/TABLET TITLES appear in BOTH Persian izáfat ("Kitáb-i-Aqdas", "Lawḥ-i-...") and Arabic construct/article ("Kitábu'l-Aqdas", "Kitáb al-Aqdas", "Súratu'l-...") styles — these are the SAME work; resolve to ONE entity and never create a second for the other style.
- REPEATING NAMES ARE EXPECTED AND MEANINGFUL — do NOT avoid or drop a shared given name (Fáṭimih, Muḥammad, Ḥasan, Ḥusayn, ‘Alí). Many distinct important people share one; resolve by CONTEXT to the correct individual and keep the name as THAT person's alias. Ṭáhirih's given name is Fáṭimih (Fáṭimih Baraghání) and is theologically significant; Fáṭimih the daughter of the Prophet is a DIFFERENT person — context decides which, and BOTH retain the name "Fáṭimih". A prophet/Imám named only by a bare given name takes a clear full canonical ("the Prophet Muḥammad"), but the bare name remains an alias resolved by context — never collapse all "Muḥammad"s into one entity, and never discard the name.
- MULTILINGUAL: a name may appear in Latin transliteration ("Mullá Ḥusayn-i-Bushrú'í") OR in Arabic/Persian script ("ملا حسين البشروئي" / "ملا حسین بشروئی"). All denote the SAME entity. Resolve a script mention to the existing transliterated entity, keep the standard transliteration as the canonical, and record the Arabic/Persian-script form as an alias. Arabic and Persian renderings of one name are the same entity.
- For a NEW entity, also give a terse one-line "descriptor" that distinguishes this person from same-named others: honorific/title + nisba (village/region) + role + era. Required when match="new"; else null.
- Preserve exact diacritics (á í ú ḥ ṭ ṣ ‘ ’ …); never ASCII apostrophes.

ALSO produce:
- "grounded": a terse RESTATEMENT of the paragraph's core point with every vague reference replaced by its named referent, e.g. "The party arrived at the West wall by morning." -> "Mullá Ḥusayn-i-Bushrú'í and his companions reached the West gate of Shíráz on the morning of 23 May 1844." One sentence, two at most — the resolved sentence itself, NOT a glossary.
- "questions": every distinct hypothetical question THIS paragraph directly answers, each natural and standalone (include the subject).

Output ONLY this JSON:
{"entities":[{"surface":"<as written in paragraph>","type":"person|place|work|event|concept","canonical":"<fullest name>","match":<candidate number, or "new">,"descriptor":"<one line if new, else null>"}],"grounded":"","questions":[]}`;

// ── in-memory dictionary ─────────────────────────────────────────────────────
let nextId = 1;
const ents = new Map();              // id -> {id,type,canonical,descriptor,significance,aliasNorms:Set,surfaces:Set,seed}
const byKey = new Map();             // `${type}|${matchKey}` -> id   (dedupe new vs existing)
const matchKey = (canonical, type) => `${type}|${norm(canonical)}`;

function addEntity({ canonical, type, descriptor, aliases = [], seed = false, core = false }) {
  const k = matchKey(canonical, type);
  if (byKey.has(k)) return ents.get(byKey.get(k));
  const e = { id: nextId++, type, canonical, descriptor: descriptor || null, significance: 0, aliasNorms: new Set(), surfaces: new Set(), seed, core: seed || core };
  for (const a of [canonical, ...aliases]) { e.aliasNorms.add(norm(a)); e.surfaces.add(a); }
  ents.set(e.id, e); byKey.set(k, e.id);
  return e;
}
for (const s of SEED) addEntity({ ...s, seed: true });

function candidatesFor(text) {
  const toks = new Set(nameTokens(text));
  const scored = [];
  for (const e of ents.values()) {
    let overlap = 0;
    for (const a of e.aliasNorms) for (const t of a.split(' ')) if (t.length >= 3 && !STOP.has(t) && toks.has(t)) overlap++;
    if (overlap > 0 || e.seed) scored.push({ e, overlap: overlap + (e.seed ? 0.1 : 0) });
  }
  // overlap first, then significance; always keep seed core + top significance.
  scored.sort((a, b) => b.overlap - a.overlap || b.e.significance - a.e.significance);
  const top = [...ents.values()].sort((a, b) => b.significance - a.significance).slice(0, 12);
  const picked = new Map();
  for (const { e } of scored) picked.set(e.id, e);
  for (const e of top) picked.set(e.id, e);
  return [...picked.values()].slice(0, 40);
}

const fmtCand = c => `[${c.n}] (${c.e.type}) ${c.e.canonical}${c.e.descriptor ? ` — ${c.e.descriptor}` : ''}${c.e.aliasNorms.size > 1 ? ` [aka: ${[...c.e.surfaces].filter(s => norm(s) !== norm(c.e.canonical)).slice(0, 6).join(', ')}]` : ''} (sig ${c.e.significance})`;

let hit = 0, miss = 0, out = 0, truncated = 0, calls = 0, created = 0, matched = 0;
const grounded = [];

const rows = await queryAll(
  `SELECT c.id, c.text FROM content c WHERE c.doc_id = ? AND c.deleted_at IS NULL AND length(c.text) > 50 ORDER BY c.paragraph_index LIMIT ?`,
  [DOC, LIMIT]);
console.log(`dict dry-run: doc ${DOC}, ${rows.length} paragraphs in order, model ${MODEL}, seed ${ents.size} entities\n`);

for (const r of rows) {
  const cands = candidatesFor(r.text).map((e, i) => ({ n: i + 1, e }));
  const candById = new Map(cands.map(c => [c.n, c.e]));
  const ctx = grounded.length ? grounded.slice(-20).map((g, i) => `${i + 1}. ${g}`).join('\n') : '(start — no prior context)';
  const candBlock = cands.length ? cands.map(fmtCand).join('\n') : '(none yet)';
  const user = `PRIOR CONTEXT:\n${ctx}\n\nCANDIDATES (match by NUMBER if the SAME entity; else "new"):\n${candBlock}\n\n=== CURRENT PARAGRAPH (extract from THIS only) ===\n${r.text}`;
  let resp;
  try {
    resp = await chatCompletion([{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      { model: MODEL, provider: 'deepseek', temperature: 0, maxTokens: 16384, responseFormat: { type: 'json_object' } });
  } catch (e) { console.log(`\n[${r.id}] API ERROR: ${e.message}`); continue; }
  calls++;
  const u = resp.usage || {}; hit += u.cachedTokens || 0; miss += (u.promptTokens || 0) - (u.cachedTokens || 0); out += u.completionTokens || 0;
  if (resp.finishReason === 'length') { truncated++; console.log(`\n[${r.id}] TRUNCATED — skipped`); continue; }
  let j; try { j = JSON.parse(resp.content); } catch { console.log(`\n[${r.id}] UNPARSEABLE`); continue; }
  if (j.grounded) grounded.push(j.grounded);

  console.log(`\n──[${r.id}] ${r.text.slice(0, 78).replace(/\s+/g, ' ')}…`);
  console.log(`  GROUNDED: ${j.grounded || '(none)'}`);
  for (const ent of (j.entities || [])) {
    if (!ent || !ent.canonical) continue;
    const type = ent.type || 'person';
    let e, tag;
    const cand = (typeof ent.match === 'number') ? candById.get(ent.match) : null;
    if (cand && cand.type === type) { e = cand; tag = `MATCH #${ent.match} → ${e.canonical}`; matched++; }
    else {
      const k = matchKey(ent.canonical, type);
      if (byKey.has(k)) { e = ents.get(byKey.get(k)); tag = `match(key) → ${e.canonical}`; matched++; }
      else { e = addEntity({ canonical: ent.canonical, type, descriptor: ent.descriptor, core: CORE }); tag = `NEW → ${e.canonical}`; created++; }
    }
    e.significance++; e.aliasNorms.add(norm(ent.surface)); e.surfaces.add(ent.surface);
    if (!e.descriptor && ent.descriptor) e.descriptor = ent.descriptor;
    console.log(`    ${ent.type.padEnd(7)} "${ent.surface}" → ${tag}`);
  }
  if (j.questions?.length) console.log(`  Q: ${j.questions.map(q => '\n     - ' + q).join('')}`);
}

// ── dictionary dump for manual review ────────────────────────────────────────
const people = [...ents.values()].filter(e => e.type === 'person').sort((a, b) => b.significance - a.significance);
const others = [...ents.values()].filter(e => e.type !== 'person').sort((a, b) => b.significance - a.significance);
console.log(`\n\n════════════ DICTIONARY (${ents.size} entities: ${people.length} people, ${others.length} other) ════════════`);
console.log(`\n── PEOPLE (significance desc) ──`);
for (const e of people) {
  const aka = [...e.surfaces].filter(s => norm(s) !== norm(e.canonical));
  console.log(`  [${e.significance}] ${e.canonical}${e.seed ? ' *seed' : ''}\n        ${e.descriptor || '(no descriptor)'}${aka.length ? `\n        aka: ${aka.join(' · ')}` : ''}`);
}
console.log(`\n── PLACES / WORKS / EVENTS / CONCEPTS (significance desc) ──`);
for (const e of others) console.log(`  [${e.significance}] (${e.type}) ${e.canonical}`);

// ── potential namesake collisions to eyeball: same non-stop given-name token ──
const byGiven = new Map();
for (const e of people) for (const t of nameTokens(e.canonical)) (byGiven.get(t) || byGiven.set(t, []).get(t)).push(e);
const clusters = [...byGiven.entries()].filter(([, es]) => new Set(es.map(e => e.id)).size > 1);
if (clusters.length) {
  console.log(`\n── SHARED NAME-TOKENS (verify these are correctly split, not over-split) ──`);
  for (const [t, es] of clusters.sort((a, b) => b[1].length - a[1].length)) {
    const uniq = [...new Map(es.map(e => [e.id, e])).values()];
    if (uniq.length > 1) console.log(`  "${t}": ${uniq.map(e => `${e.canonical} (sig ${e.significance})`).join('  |  ')}`);
  }
}

const cost = hit * 0.0028e-6 + miss * 0.14e-6 + out * 0.28e-6;
console.log(`\n════ calls ${calls} | matched ${matched} new ${created} | cache hit ${hit} miss ${miss} (${(100*hit/Math.max(hit+miss,1)).toFixed(0)}%) | truncated ${truncated} | est $${cost.toFixed(4)} (~$${(cost/Math.max(calls,1)).toFixed(5)}/para)`);
process.exit(0);
