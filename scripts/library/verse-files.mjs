#!/usr/bin/env node
// Write verse pn into scripture SOURCE files (api/lib/library/verse-files.js), then reingest them. Runs ON tower.
// Dry run unless --apply; backups under /tank/sifter/verse-file-backups.
//   node scripts/library/verse-files.mjs --headed 21380,21381 --leading 17290 [--apply]
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { config } from '../../api/lib/config.js';
import { listDocs } from '../../api/lib/docs-repo.js';
import { headedToPn, leadingToPn, declareParagraphs } from '../../api/lib/library/verse-files.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const opt = (k) => (process.argv.includes(k) ? String(process.argv[process.argv.indexOf(k) + 1]).split(',').map(Number).filter(Boolean) : []);
const APPLY = process.argv.includes('--apply');
const jobs = [...opt('--headed').map((id) => [id, headedToPn]), ...opt('--leading').map((id) => [id, leadingToPn])];
const { docs } = await listDocs({ ids: jobs.map(([id]) => id), fields: ['id', 'title', 'file_path'], limit: jobs.length });
const byId = new Map(docs.map((d) => [d.id, d]));
for (const [id, fn] of jobs) {
  const d = byId.get(id);
  if (!d) { console.log(JSON.stringify({ id, error: 'no such doc' })); continue; }
  const path = join(config.library.basePath, d.file_path);
  const src = readFileSync(path, 'utf8');
  const { text, ...stats } = fn(src);
  const out = declareParagraphs(text);
  const changed = out !== src;
  if (APPLY && changed) {
    const bk = join('/tank/sifter/verse-file-backups', `${d.file_path}.${Date.now()}`);
    mkdirSync(dirname(bk), { recursive: true }); copyFileSync(path, bk);
    writeFileSync(path, out);
  }
  console.log(JSON.stringify({ id, title: d.title, apply: APPLY, changed, ...stats }));
}
process.exit(0);
