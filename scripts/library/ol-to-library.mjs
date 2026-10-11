#!/usr/bin/env node
// Move OceanLibrary-export books that are NOT in the Ocean catalogue (ILM leftovers — Chad 10-10: "we definitely want the
// documents but cannot link to them in oceanlibrary.com so they will have to go in the supplemental collection") out of
// -sites/oceanlibrary.com into the main library: the FILE moves to <religion>/<collection>/, its frontmatter loses the
// oceanlibrary.com source_url (provenance noted instead), and the doc row is relocated in place (same id, paragraphs,
// cover; source_site/source_url cleared; paragraphs re-synced). Runs ON tower (SIFTER_WRITER_URL). Dry run by default.
// Every move is logged to /tank/sifter/library-moves.jsonl so it can be reversed.
//   node scripts/library/ol-to-library.mjs --map '{"20905":"Compilations", …}' [--apply]
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { config } from '../../api/lib/config.js';
import { listDocs, relocateDoc } from '../../api/lib/docs-repo.js';

const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const APPLY = process.argv.includes('--apply');
const MAP = JSON.parse(opt('--map', '{}'));   // doc id → collection folder (under the doc's religion folder)
if (APPLY && !process.env.SIFTER_WRITER_URL) throw new Error('SIFTER_WRITER_URL is required to write');
const base = config.library.basePath;
const { docs } = await listDocs({ ids: Object.keys(MAP).map(Number), fields: ['id', 'title', 'religion', 'collection', 'file_path', 'source_site', 'source_url'], limit: 100 });
const plan = docs.map((d) => ({ id: d.id, title: d.title, from: d.file_path, to: join(d.religion, MAP[d.id], basename(d.file_path)), collection: MAP[d.id], source_url: d.source_url, source_site: d.source_site }));
for (const p of plan) console.log(JSON.stringify(p));
const problems = plan.filter((p) => p.source_site !== 'oceanlibrary.com' || !existsSync(join(base, p.from)) || existsSync(join(base, p.to)) || !existsSync(join(base, dirname(p.to))));
if (problems.length) { console.log(JSON.stringify({ refused: problems.map((p) => ({ id: p.id, why: p.source_site !== 'oceanlibrary.com' ? 'not an OceanLibrary doc' : !existsSync(join(base, p.from)) ? 'source file missing' : existsSync(join(base, p.to)) ? 'target exists' : 'target collection folder missing' })) })); process.exit(1); }
if (!APPLY) { console.log(JSON.stringify({ dryRun: true, moves: plan.length })); process.exit(0); }
for (const p of plan) {
  const src = join(base, p.from), dst = join(base, p.to);
  const text = readFileSync(src, 'utf8').replace(/^---\n([\s\S]*?)\n---/, (m, fm) => `---\n${fm.split('\n').filter((l) => !/^source_url:/.test(l)).join('\n')}\n`
    + `provenance: 'OceanLibrary export (ILM) — not in the current Ocean catalogue; moved to the library 2026-10-10'\n---`);
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(src, text);           // edit in place first, then move (one rename = one Dropbox change)
  renameSync(src, dst);
  await relocateDoc(p.id, { filePath: p.to, collection: p.collection, sourceSite: null, sourceUrl: null });
  appendFileSync('/tank/sifter/library-moves.jsonl', JSON.stringify({ at: new Date().toISOString(), ...p }) + '\n');
  console.log(JSON.stringify({ moved: p.id, to: p.to }));
}
process.exit(0);
