#!/usr/bin/env node
// Names Ocean of Lights tablets by their published source. Collection = the volume ("Makátíb-i-‘Abdu’l-Bahá, vol. 3");
// title keeps the descriptive English and gains the reference "(Makátíb 3:218)". Scraped copies titled by file name get
// the reference as their title. Dry run by default; --write needs SIFTER_WRITER_URL (one writer) and saves old values first.
// :edge: only sources whose names are confirmed on oceanoflights.org are mapped — add others to SOURCES, never guess.
//   node scripts/library/name-ool-sources.mjs [--write] [--backup /tank/sifter/backups/ool-names.json]
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync } from 'fs';

const { query, queryAll } = await import('../../api/lib/db.js');
const has = (f) => process.argv.includes(f);
const val = (f, d) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : d; };
const WRITE = has('--write');
const BACKUP = val('--backup', `/tank/sifter/backups/ool-names-${new Date().toISOString().slice(0, 10)}.json`);

// id pattern → [collection label, short reference]. Every name below was read off its oceanoflights.org table page
// (2026-10-01/02: /chapter/abdul-baha-fa, /table/bahaullah-published-NN-fa, -prayers-and-meditations-NN-fa,
// /table/the-bab-published-NN-fa) and the first row link checked against our bookid. Unconfirmed codes stay unmapped:
// Bahá'u'lláh PUB21 and PM09 (no page), the Báb's PUB04 (its table lists pub02 ids), and OOL's own groupings
// (ST "special titles", KW/BKW "known works") which are not publications.
const BH_PUB = {
  '01': ['Majmú‘iy-i-Alváḥ-i-Mubárakih (Cairo)', 'Alváḥ-i-Mubárakih'],
  '02': ['Muntakhabátí az Áthár-i-Ḥaḍrat-i-Bahá’u’lláh', 'Muntakhabát-i-Áthár'],
  '03': ['Majmú‘ih’í az Alváḥ-i-Jamál-i-Aqdas-i-Abhá (after the Kitáb-i-Aqdas)', 'Alváḥ ba‘d az Aqdas'],
  '05': ['Áthár-i-Qalam-i-A‘lá, vol. 1', 'Áthár-i-Qalam-i-A‘lá 1'],
  '06': ['Áthár-i-Qalam-i-A‘lá, vol. 2', 'Áthár-i-Qalam-i-A‘lá 2'],
  '09': ['Alváḥ-i-Ḥaḍrat-i-Bahá’u’lláh ilá al-Mulúk wa’r-Ru’asá’', 'Alváḥ ilá al-Mulúk'],
  '10': ['Iqtidárát va Chand Lawḥ-i-Dígar', 'Iqtidárát'],
  '11': ['Ishráqát va Chand Lawḥ-i-Dígar', 'Ishráqát va Chand Lawḥ'],
  '13': ['La’álí’u’l-Ḥikmah, vol. 1', 'La’álí’u’l-Ḥikmah 1'],
  '14': ['La’álí’u’l-Ḥikmah, vol. 2', 'La’álí’u’l-Ḥikmah 2'],
  '15': ['La’álí’u’l-Ḥikmah, vol. 3', 'La’álí’u’l-Ḥikmah 3'],
  '17': ['Daryáy-i-Dánish', 'Daryáy-i-Dánish'],
  '19': ['Má’idiy-i-Ásmání, vol. 1', 'Má’idih 1'],
  '20': ['Má’idiy-i-Ásmání, vol. 4', 'Má’idih 4'],
  '22': ['Má’idiy-i-Ásmání, vol. 8', 'Má’idih 8'],
  '23': ['Amr va Khalq, vol. 1', 'Amr va Khalq 1'],
  '24': ['Amr va Khalq, vol. 2', 'Amr va Khalq 2'],
  '25': ['Amr va Khalq, vol. 3', 'Amr va Khalq 3'],
  '26': ['Amr va Khalq, vol. 4', 'Amr va Khalq 4'],
};
const BH_PM = {
  '01': ['al-Munáját (prayers of Bahá’u’lláh)', 'al-Munáját'],
  '02': ['Ad‘iyiy-i-Ḥaḍrat-i-Maḥbúb', 'Ad‘iyiy-i-Maḥbúb'],
  '03': ['Tasbíḥ va Tahlíl', 'Tasbíḥ va Tahlíl'],
  '04': ['Bishárat an-Núr', 'Bishárat an-Núr'],
  '05': ['Bishárat ar-Rúḥ', 'Bishárat ar-Rúḥ'],
  '08': ['Nafaḥát ar-Raḥmán', 'Nafaḥát ar-Raḥmán'],
  '10': ['Ad‘iyiy-i-Mubárakih, vol. 1', 'Ad‘iyih 1'],
  '11': ['Ad‘iyiy-i-Mubárakih, vol. 2', 'Ad‘iyih 2'],
  '12': ['Ad‘iyiy-i-Mubárakih, vol. 3', 'Ad‘iyih 3'],
  '13': ['Prayers of Bahá’u’lláh for children', 'Children’s prayers'],
};
const BAB_PUB = {
  '01': ['Ẓuhúru’l-Ḥaqq, vol. 3 (writings of the Báb)', 'Ẓuhúr 3'],
  '02': ['Muntakhabát-i-Áyát az Áthár-i-Ḥaḍrat-i-Nuqṭiy-i-Úlá', 'Muntakhabát-i-Áyát'],
  '03': ['‘Ahd-i-A‘lá', '‘Ahd-i-A‘lá'],
};
const item = (n) => n.split(/[-_]/).map((x) => +x).join('.');    // "001" → "1", "12-2" → "12.2"
const vol = (table) => (v, n) => table[v] && [table[v][0], `${table[v][1]}:${item(n)}`];
const SOURCES = [
  [/^abdul-baha-makatib(\d)_(\d+)$/i, (v, n) => [`Makátíb-i-‘Abdu’l-Bahá, vol. ${+v}`, `Makátíb ${+v}:${+n}`]],
  [/^abdul-baha-makatib(\d)-(\d+)$/i, (v, n) => [`Makátíb-i-‘Abdu’l-Bahá, vol. ${+v}`, `Makátíb ${+v}:${+n}`]],
  [/^abdul-baha-makateeb-(\d+)-(\d+)(?:_[a-z]{2})?$/i, (v, n) => [`Makátíb-i-‘Abdu’l-Bahá, vol. ${+v}`, `Makátíb ${+v}:${+n}`]],
  // AB 'MK' (collection MK, container Abdul-Baha-MK0N) = Makátíb vol N, same tablet numbers as makateeb-0N (verified by
  // text 10-02: 138/139 of vol 1, MK03-001 = makateeb-03-001 — scripts/library/ool-missing-dryrun.mjs)
  [/^abdul-baha-mk(\d{2})-(\d+)(?:_[a-z]{2})?$/i, (v, n) => [`Makátíb-i-‘Abdu’l-Bahá, vol. ${+v}`, `Makátíb ${+v}:${+n}`]],
  [/^abdul-baha-muntakhabati(\d)_(\d+)$/i, (v, n) => [`Muntakhabátí az Makátíb-i-‘Abdu’l-Bahá, vol. ${+v}`, `Muntakhabát ${+v}:${+n}`]],
  [/^abdul-baha-selections-writings(\d+)-(\d+)(?:_[a-z]{2})?$/i, (v, n) => [`Muntakhabátí az Makátíb-i-‘Abdu’l-Bahá, vol. ${+v}`, `Muntakhabát ${+v}:${+n}`]],
  [/^bahaullah-pub(\d{2})[-_](\d+(?:[-_]\d+)?)(?:[-_](?:ar|fa))?$/i, vol(BH_PUB)],
  [/^bahaullah-pm(\d{2})-(\d+)(?:[-_](?:ar|fa))?$/i, vol(BH_PM)],
  [/^bab-pub(\d{2})-(\d+(?:-\d+)?)(?:_(?:ar|fa))?$/i, vol(BAB_PUB)],
];
// MK docs whose text does NOT match the same-numbered OOL Makátíb tablet (5-word containment 0.00–0.52, 10-02) — Arabic
// copies whose numbering is not yet understood; leave their names alone until it is.
const MK_UNVERIFIED = new Set(['Abdul-Baha-MK02-040_ar', 'Abdul-Baha-MK02-078_ar', 'Abdul-Baha-MK02-100_ar', 'Abdul-Baha-MK03-056_ar', 'Abdul-Baha-MK04-95_ar']);
const REFS = ['Makátíb', 'Muntakhabát', ...[BH_PUB, BH_PM, BAB_PUB].flatMap((t) => Object.values(t).map(([, r]) => r))];
const REF_SUFFIX = new RegExp(`\\s*\\((?:${REFS.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}) ?[\\d.]*:[\\d.]+\\)\\s*$`);

const idOf = (d) => {
  let fm = {};
  try { fm = JSON.parse(d.frontmatter || '{}'); } catch { /* scraped docs carry none */ }
  if (fm.bookid) return fm.bookid;
  const m = (d.file_path || '').match(/(abdul-baha-[a-z-]+?-?\d*[-_]\d+(?:-\d+)?(?:_[a-z]{2})?)\.md$/i);
  return m ? m[1].replace(/^file-autogenerated-/, '') : null;
};

// Library documents only: site-scraped copies (scope 'supplemental', site2rag paths) are disabled and slated to leave
// sifter.db — never rename them (Chad, 2026-10-02).
const rows = await queryAll(`SELECT id, title, collection, file_path, frontmatter FROM docs WHERE deleted_at IS NULL
  AND scope = 'primary' AND file_path NOT LIKE '%site2rag%'
  AND (json_extract(frontmatter,'$.collection') IN ('MAKATIB','MUNTAKHABATI','MK','PUB','PM','PUB01','PUB02','PUB03')
       OR file_path LIKE '%makateeb%' OR file_path LIKE '%selections-writings%')`);

const plan = [];
for (const d of rows) {
  const id = idOf(d);
  if (MK_UNVERIFIED.has(id)) { plan.push({ id: d.id, skip: `unverified numbering ${id}` }); continue; }
  const hit = id && SOURCES.map(([re, f]) => [id.match(re), f]).find(([m]) => m);
  const named = hit && hit[1](hit[0][1], hit[0][2]);
  if (!named) { plan.push({ id: d.id, skip: `unmapped ${id}` }); continue; }
  const m = hit[0];
  const [collection, ref] = named;
  const base = (d.title || '').replace(REF_SUFFIX, '');
  const fileNamed = !base || /^(abdul-baha|bahaullah|bab)-|^file-autogenerated|^(PUB|PM)\d+\s+[\d-]+$/i.test(base);   // file names / bare OOL codes
  const lang = { en: ' (English)', ar: ' (Arabic)', fa: '' }[(id.match(/_([a-z]{2})$/i) || [])[1]] ?? '';
  const generated = base.startsWith(`${collection}, no. `);             // a title this script made: idempotent re-runs
  const title = fileNamed || generated ? `${collection}, no. ${item(m[2])}${lang}` : `${base} (${ref})`;
  if (title === d.title && collection === d.collection) continue;
  plan.push({ id: d.id, from: { title: d.title, collection: d.collection }, to: { title, collection } });
}

const todo = plan.filter((p) => p.to), skipped = plan.filter((p) => p.skip);
const byColl = {};
for (const p of todo) byColl[p.to.collection] = (byColl[p.to.collection] || 0) + 1;
console.log(`${WRITE ? 'WRITING' : 'DRY RUN'} — ${rows.length} docs matched, ${todo.length} to rename, ${skipped.length} unmapped`);
for (const [c, n] of Object.entries(byColl).sort()) console.log(`  ${String(n).padStart(4)}  ${c}`);
for (const p of has('--all') ? todo : todo.filter((_, i) => i % Math.ceil(todo.length / 12) === 0)) console.log(`  #${p.id}  ${p.from.title}\n        → ${p.to.title}  [${p.to.collection}]`);
for (const p of skipped.slice(0, 10)) console.log(`  skip #${p.id}: ${p.skip}`);

if (!WRITE) process.exit(0);
if (!process.env.SIFTER_WRITER_URL) { console.error('Refusing to write without SIFTER_WRITER_URL — sifter.db has ONE writer (:7849).'); process.exit(2); }
writeFileSync(BACKUP, JSON.stringify(todo, null, 1));
console.log(`backup of old values → ${BACKUP}`);
let n = 0;
for (const p of todo) {
  await query('UPDATE docs SET title = ?, collection = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [p.to.title, p.to.collection, p.id]);
  await query('UPDATE content SET synced = 0 WHERE doc_id = ? AND deleted_at IS NULL', [p.id]);   // search picks up the new title
  if (++n % 200 === 0) console.log(`  ${n}/${todo.length}`);
}
console.log(`done — ${n} renamed; their paragraphs re-sync to search through the worker`);
process.exit(0);
