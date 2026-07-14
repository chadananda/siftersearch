// Builds the central-cast GAZETTEER (identity anchor) from the entities we already have — a rebuildable
// projection the resolver consults FIRST so the figures that matter most bind deterministically and
// identically in every book. For each top person entity: canonical + ALL real name-forms seen in text (the
// mention surfaces, minus relational/descriptive stubs) + aliases + discriminative facts (nisba, side, death,
// kin, importance), plus a curated ≠namesake guard list (this session's confirmed distinct pairs). Writes
// data/siftersearch-gazetteer.json (re-run after entity changes). Read-only on the DB.
//
// Usage:  node scripts/entity-read/build-gazetteer.mjs [--top 200] [--out data/siftersearch-gazetteer.json]
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });
import fs from 'node:fs';
const { queryAll } = await import('../../api/lib/db.js');

const opt = Object.fromEntries(process.argv.slice(2).flatMap((a, i, A) =>
  a.startsWith('--') ? [[a.slice(2), A[i + 1] && !A[i + 1].startsWith('--') ? A[i + 1] : true]] : []));
const TOP = Number(opt.top) || 200;
const OUT = typeof opt.out === 'string' ? opt.out : 'data/siftersearch-gazetteer.json';

// Not-a-name surfaces (relational/descriptive) — excluded from a figure's identity forms.
const NOT_NAME = /\b(sons?|daughters?|father|mother|brothers?|sisters?|wife|husband|uncle|aunt|cousins?|widow|servants?|attendants?|companions?|followers?|envoys?|messengers?|amanuensis|scribe|niece|nephews?|maid|consort|who|whom|which|unnamed|renamed|of\b)/i;
const nisbaOf = (n) => [...n.matchAll(/-i-([A-Za-zÀ-ÿ‘’'`]+)/g)].map((m) => m[1]).join(',') || null;
const fold = (s) => s.toLowerCase().replace(/[‘’'`ʻʼ]/g, '').trim();

// Curated ≠namesake guards — confirmed-distinct pairs (this session's evidence + standing doctrine). Prevents
// the resolver from ever re-merging them. Extend as new namesake confusions are adjudicated.
const GUARDS = [
  { a: 'Áqáy-i-Kalím', b: 'Ḥájí Mírzá Músáy-i-Qumí', why: 'different -Qumí nisba; Qum-born martyr, not Bahá’u’lláh’s brother' },
  { a: 'Mírzá Muḥammad-‘Alí', b: 'Wilhelm Herrigel', why: 'shared category (Covenant-breaker) is not identity; different people' },
  { a: 'Mullá Ḥusayn', b: 'Mullá Ḥusayn-i-Zanjání', why: 'Zanján chronicler who mailed a manuscript to Bahá’u’lláh ≠ Bábu’l-Báb (d. Ṭabarsí 1849)' },
  { a: 'Badí‘', b: 'Mírzá Badí‘u’lláh', why: 'Badí‘ the martyr (Pride of Martyrs) ≠ Badí‘u’lláh, a Covenant-breaker son of Bahá’u’lláh' },
  { a: 'Nabíl-i-A‘ẓam', b: 'Nabíl-i-Akbar', why: 'Zarandí the Dawn-Breakers author ≠ Nabíl-i-Akbar (Mullá Muḥammad-i-Qá’iní), an Apostle' },
  { a: 'Ásíyih Khánum', b: 'Navváb-i-Raḍaví', why: 'Bahá’u’lláh’s wife (the "saintly Navváb") ≠ a Yazd persecutor of Vaḥíd (side=opponent)' },
  { a: 'Mírzá Aḥmad-i-Qazvíní', b: 'Mírzá Aḥmad-i-Azghandí', why: 'different nisbas; the Báb’s amanuensis ≠ the traditions-collector' },
  { a: 'Siyyid Javád-i-Karbilá\'í', b: 'Ḥájí Siyyid Javád-i-Kirmání', why: 'the Shaykhí disciple (Siyyid-i-Núr, family friend, d. Kirmán 1882) ≠ the Imám-Jum\'ih of Kirmán (a cousin of the Báb, secret believer, protector of Quddús)' },
  { a: 'Mullá Yúsuf-i-Ardibílí', b: 'Mullá Yúsuf-i-Khú\'í', why: 'different nisbas (Ardabíl vs Khuy) — distinct fort companions (Ẓuhúru’l-Ḥaqq d15257)' },
  { a: 'Shaykh Sa\'íd-i-Hindí', b: 'Mullá Sa\'íd-i-Bárfurúshí', why: 'Hindí (of India) ≠ Bárfurúshí (of Bárfurúsh); named as distinct fort companions' },
  { a: 'Mírzá Hádíy-i-Qazvíní', b: 'Áqá Mírzá Hádí Nahrí-i-Iṣfahání', why: 'Qazvín ≠ the Nahrí family of Iṣfahán; two distinct men + Hádí’s own brother Mírzá Muḥammad-‘Alí' },
  { a: 'Muḥammad-Ḥasan-i-Bushrú\'í', b: 'Muḥammad-Ḥasan-i-Qazvíní', why: 'brother of Mullá Ḥusayn (Bushrúyih) ≠ a youth (fatá) of Qazvín' },
  { a: 'Mullá Ṣádiq-i-Muqaddas', b: 'Ibn-i-Aṣdaq', why: 'Muqaddas (Ismu’lláhu’l-Aṣdaq) is the FATHER; Ibn-i-Aṣdaq (Mírzá ‘Alí-Muḥammad) is his SON, a Hand of the Cause' },
  { a: '‘Abbás-Qulí Khán-i-Láríjání', b: 'Mihdí-Qulí Mírzá', why: 'the commander ≠ the royal prince he served under at Ṭabarsí' },
];

const rows = await queryAll(
  `SELECT ge.id, ge.canonical_name canonical, er.aliases, er.side, er.dates, er.kinship,
          er.importance, substr(er.summary,1,200) summary,
          (SELECT COUNT(*) FROM entity_mentions_v2 m WHERE m.entity_id=ge.id) mentions
     FROM graph_entities ge
     LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name AND er.entity_type='person'
    WHERE ge.entity_type='person' AND ge.canonical_name NOT LIKE '%⟨merged%'
    ORDER BY COALESCE(er.importance,0) DESC, mentions DESC
    LIMIT ${TOP}`);

const entries = [];
for (const r of rows) {
  const surf = await queryAll(
    `SELECT surface FROM entity_mentions_v2 WHERE entity_id=? GROUP BY surface ORDER BY COUNT(*) DESC LIMIT 30`, [r.id]);
  const aliases = (() => { try { return JSON.parse(r.aliases || '[]'); } catch { return []; } });
  const rawForms = [r.canonical, ...aliases(), ...surf.map((s) => s.surface)].filter(Boolean);
  const forms = [...new Map(rawForms.filter((f) => !NOT_NAME.test(f)).map((f) => [fold(f), f])).values()];
  entries.push({
    id: r.id, canonical: r.canonical, forms,
    nisba: nisbaOf(r.canonical), side: r.side || null,
    dates: r.dates || null, kin: r.kinship || null,
    importance: r.importance ?? null, mentions: r.mentions,
  });
}

const gaz = { built: 'REGEN', count: entries.length, guards: GUARDS, entries };
fs.writeFileSync(OUT, JSON.stringify(gaz, null, 2));
console.log(`GAZETTEER → ${OUT}  (${entries.length} anchors, ${GUARDS.length} ≠guards)`);
// spot-check: the figures that were split this session should now carry ALL their forms in one anchor
for (const name of ['Áqáy-i-Kalím', 'Mírzá Yaḥyá', 'Ḥujjat', 'Shaykh Aḥmad']) {
  const e = entries.find((x) => x.canonical.includes(name) || x.forms.some((f) => f.includes(name)));
  if (e) console.log(`  ${e.canonical}  forms=[${e.forms.slice(0, 6).join(' · ')}${e.forms.length > 6 ? ' …' : ''}]`);
}
process.exit(0);
