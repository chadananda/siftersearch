// Gather the tablet/work documents the corpus ALREADY holds (layer-1 spine for the tablet entity layer) + verify the
// ROB volumes. Read-only. A "tablet doc" = a curated OceanLibrary Core-Tablets / Tablet-Translations file (file_path),
// authored by one of the four (the Báb, Bahá'u'lláh, ‘Abdu'l-Bahá, Shoghi Effendi). Captures doc_id, author guess,
// archive code (from filename), incipit (first paragraph), title, source_url — the seed each ROB tablet reference will
// resolve against. Output: tmp/entity-research/tablet-inventory.json + a console summary. Run ON tower-nas.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync, existsSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');

// --- verify the ROB volumes ---
const rob = await queryAll(`SELECT id, title, source_url u, (SELECT COUNT(*) FROM content c WHERE c.doc_id=docs.id AND c.deleted_at IS NULL) paras FROM docs WHERE id IN (429,430,431,432) ORDER BY id`);
console.log('=== ROB volumes (429-432) ===');
for (const r of rob) console.log(`  ${r.id}  ${String(r.paras).padStart(5)} paras  ${(r.title || '').slice(0, 60)}  ${r.u || '(no url)'}`);

// --- gather tablet/work docs ---
const AUTHORS = [
  { key: 'the Báb', re: /\b(the báb|the bab|báb\b)/i, folder: /Core Tablets\/The[ -]?B[aá]b/i },
  { key: "Bahá'u'lláh", re: /bahá|baha'u|bahaullah/i, folder: /Core Tablets\/Bah/i },
  { key: "‘Abdu'l-Bahá", re: /abdu'?l-?bah|abdul-?baha/i, folder: /Core Tablets\/.?Abdu/i },
  { key: 'Shoghi Effendi', re: /shoghi/i, folder: /Core Tablets\/Shoghi/i },
];
const authorOf = (fp, title, author) => {
  for (const a of AUTHORS) if (a.folder.test(fp || '')) return a.key;
  for (const a of AUTHORS) if (a.re.test(author || '') || a.re.test(title || '')) return a.key;
  return null;
};
// curated tablet files live under Core Tablets / Tablet Translations; also catch docs explicitly authored by the four
const docs = await queryAll(`SELECT id, title, file_path fp, source_url u, COALESCE(author,'') author FROM docs
  WHERE (file_path LIKE '%Core Tablets%' OR file_path LIKE '%Tablet Translations%' OR file_path LIKE '%Tablets%')
    AND deleted_at IS NULL`);
const out = [];
for (const d of docs) {
  const author = authorOf(d.fp, d.title, d.author);
  const codeM = (d.fp || '').match(/([0-9]{1,4}-?(INBA|PUB|PRIN|MISC|JAPA|PRV)[-0-9A-Za-z]*)/i);
  const first = (await queryAll(`SELECT text FROM content WHERE doc_id=? AND deleted_at IS NULL AND length(trim(text))>0 ORDER BY paragraph_index LIMIT 1`, [d.id]))[0];
  out.push({
    docId: d.id, author, title: (d.title || '').slice(0, 120),
    file_path: d.fp, source_url: d.u,
    archive_code: codeM ? codeM[1] : null,
    incipit: first ? String(first.text).replace(/\s+/g, ' ').trim().slice(0, 120) : null,
  });
}
const byAuthor = {}; for (const t of out) byAuthor[t.author || 'unknown'] = (byAuthor[t.author || 'unknown'] || 0) + 1;
console.log(`\n=== tablet/work docs in corpus: ${out.length} ===`);
for (const [a, n] of Object.entries(byAuthor).sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(4)}  ${a}`);
const dir = 'tmp/entity-research'; if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/tablet-inventory.json`, JSON.stringify(out, null, 0));
console.log(`\nwrote ${dir}/tablet-inventory.json (${out.length} docs)`);
process.exit(0);
