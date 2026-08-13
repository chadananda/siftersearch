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
// Match must be apostrophe/case-insensitive — the DB mixes ' ’ ` ʻ ʼ (e.g. ‘Abdu'l-Bahá) and a straight-
// apostrophe roster form would miss the real entity, producing a false MISSING (feedback_transliteration_vs_aliases).
const fold = (s) => s.toLowerCase().replace(/[‘’'`ʻʼ]/g, '');

// Load every person once WITH its evidence (side + summary) — identity is decided by CONTEXT, not the name.
// A candidate that merely shares a name but is an opponent, or carries a differing nisba, is a DIFFERENT person.
const ALL = await queryAll(
  `SELECT ge.id, ge.canonical_name n, er.side, er.summary,
          (SELECT COUNT(*) FROM entity_mentions_v2 m WHERE m.entity_id=ge.id) mentions
     FROM graph_entities ge
     LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name AND er.entity_type='person'
    WHERE ge.entity_type='person'`);
const FOLDED = ALL.map((r) => ({ ...r, f: fold(r.n) }));
const isOpponent = (side) => /opponent|enemy|other|covenant|breaker/i.test(side || '');

// RECALL, not decision. String matching's only job here is to cast a wide net over the forms a keystone
// is known by; whether two records are the SAME PERSON is a judgment on evidence, and no rule can make it.
// People carry many titles and epithets (the Báb: Primal Point, the Remembrance, Siyyid ‘Alí-Muḥammad),
// so a TIGHTER string rule loses real fragments without ever gaining the ones that matter. This was briefly
// narrowed to a boundary match on 2026-08-13 to kill one false positive (Badí‘ vs Mírzá Badí‘u’lláh) —
// wrong lever: that pair is a job for the adjudicator, which knows one is a Covenant-breaker son and the
// other a martyr. Recall stays broad; adjudicateFragments() decides. See feedback_no_literal_name_binding
// and feedback_evidence_consistency_over_heuristics.
function candidates(forms) {
  const keys = forms.map(fold);
  const seen = new Map();
  for (const r of FOLDED) if (keys.some((k) => r.f.includes(k)) && !seen.has(r.id)) seen.set(r.id, r);
  return [...seen.values()];
}

// The DECISION, delegated to the evidence adjudicator the merge stage already uses — same prompt, same
// IDENTITY_DOCTRINE, same over-merge guards for common given-names. Reused rather than reimplemented so the
// gate can never drift from the stage that acts on its findings. Candidates here are gathered ACROSS titles
// and epithets, which is exactly what entities/merge cannot do on its own: it groups by shared NAME, so a
// figure split between a name and a title is invisible to it. Recall from the roster + judgment from the
// model is the combination neither half achieves alone.
async function adjudicateFragments(who, core, cands) {
  if (!cands.length) return { real: cands, reason: 'no adjudicator (rule fallback)' };
  try {
    const [{ SYSTEM, buildUser, parseMerge }, { buildContext }, { sifterDeps }] = await Promise.all([
      import('../../api/lib/rag/entities/merge.js'),
      import('../../api/lib/rag/index.js'),
      import('../../api/lib/rag-adapter/index.js'),
    ]);
    const ctx = buildContext(sifterDeps());
    const group = {
      key: who,
      entities: [core, ...cands].map((e) => ({ id: e.id, canonical: e.n, mentions: e.mentions, summary: e.summary })),
    };
    const { parsed } = await ctx.model.runLadder({
      route: { model: ctx.config.models?.merge, fallback: ctx.config.models?.mergeFallback },
      system: SYSTEM, user: buildUser(group), parse: parseMerge, maxTokens: 500,
    });
    if (!parsed) throw new Error('unparseable verdict');
    const same = new Set(parsed.same || []);
    return { real: cands.filter((c) => same.has(c.id)), reason: parsed.reason || '' };
  } catch (err) {
    // Never fail the gate on an adjudication problem — fall back to reporting every candidate for review,
    // and SAY that the verdict is unjudged rather than presenting a rule's guess as the model's.
    return { real: cands, reason: `UNJUDGED (${err.message}) — rule-only candidates`, unjudged: true };
  }
}

export const __test = { fold, isName };

const ADJUDICATE = !process.argv.includes('--no-adjudicate');

export async function runGate() {
  const results = [];
  for (const k of ROSTER) {
    const all = candidates(k.forms).sort((a, b) => b.mentions - a.mentions);
    const identity = all.filter((e) => isName(e.n) && e.mentions > 0);
    const assoc = all.length - identity.length; // relational descriptors dropped as distinct associates
    const core = identity[0];
    // Classify each remaining candidate by EVIDENCE, not name overlap:
    //  - differing nisba  → namesake (feedback_nisba_disconflation: Yazdí≠Turshízí is near-decisive)
    //  - opponent vs the figure's Bábí/Bahá'í side → a different (hostile) person, never a fragment
    //  - otherwise → a genuine REVIEW candidate; its summary is shown so identity is judged on context
    // Rules still PRE-FILTER the obvious (a differing nisba is near-decisive; an opponent vs a Bábí is a
    // different person) — cheap, and it keeps the model's input small. What they no longer do is DECIDE:
    // everything that survives goes to the adjudicator, because "same person under another title" is not
    // a question a regex can answer.
    const frags = identity.slice(1).map((e) => {
      const nb = nisbaOf(e.n), cnb = core ? nisbaOf(core.n) : '';
      let cls = 'REVIEW';
      if (nb && cnb && nb !== cnb) cls = 'namesake(nisba)';
      else if (core && isOpponent(e.side) !== isOpponent(core.side)) cls = 'distinct(side)';
      return { ...e, cls };
    });
    const toJudge = frags.filter((f) => f.cls === 'REVIEW');
    const { real, reason, unjudged } = ADJUDICATE
      ? await adjudicateFragments(k.who, core, toJudge)
      : { real: toJudge, reason: 'rules only (--no-adjudicate)', unjudged: true };
    const verdict = identity.length === 0 ? 'MISSING' : real.length ? 'SPLIT' : 'ok';
    results.push({ who: k.who, verdict, core, frags, real, assoc, reason, unjudged });
    results.push({ who: k.who, verdict, core, frags, real, assoc });
  }
  return results;
}

import { fileURLToPath } from 'node:url';
const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (!isMain) { /* imported (e.g. by complete-book.mjs DoD) — expose runGate, don't run the CLI */ }
else {
const results = await runGate();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const bad = results.filter((r) => r.verdict !== 'ok');
  const ok = results.filter((r) => r.verdict === 'ok');
  console.log(`KEYSTONE GATE — ${bad.length} flagged / ${results.length} figures\n`);
  for (const r of bad) {
    const sep = r.frags.filter((f) => f.cls !== 'REVIEW');
    console.log(`${r.verdict.padEnd(8)}${r.who}   ${r.assoc ? `(${r.assoc} relational assoc. dropped)` : ''}`);
    if (r.core) console.log(`         core   #${r.core.id}  "${r.core.n}"  m=${r.core.mentions}`);
    for (const f of r.real) { // genuine same-person candidates — judge on the summary shown
      console.log(`         SPLIT? #${f.id}  "${f.n}"  m=${f.mentions}`);
      if (f.summary) console.log(`                └ ${String(f.summary).replace(/\s+/g, ' ').slice(0, 150)}`);
    }
    if (sep.length) console.log(`         auto-separated: ${sep.map((f) => `"${f.n}" [${f.cls}]`).join(', ')}`);
  }
  console.log('\nSINGLE (ok):');
  for (const r of ok) console.log(`  ${r.who}  → #${r.core.id} (m=${r.core.mentions})`);
  process.exitCode = bad.length ? 1 : 0;
}
process.exit(process.exitCode || 0);
}
