#!/usr/bin/env node
// Run file-level Arabic/Persian sentence segmentation (api/lib/segment/file-segment.js) over library files. Runs ON tower.
// Dry run by default (prints status + $ estimate per file). Spend is capped per file AND per run.
//   node scripts/segment/segment-files.mjs --ids 66590,66591 [--apply] [--max-usd 3] [--max-total-usd 20]
//   node scripts/segment/segment-files.mjs --ids 66596 --pilot 30 --out /tank/sifter/seg-pilot.md   # sample only, source untouched
import dotenv from 'dotenv';
import { join } from 'path';
import { config } from '../../api/lib/config.js';
import { listDocs } from '../../api/lib/docs-repo.js';
import { segmentFile } from '../../api/lib/segment/file-segment.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const APPLY = process.argv.includes('--apply');
const ids = String(opt('--ids', '')).split(',').map(Number).filter(Boolean);
const maxUsd = Number(opt('--max-usd', 3)), maxTotal = Number(opt('--max-total-usd', 20));
const pilot = Number(opt('--pilot', 0)), pilotOut = opt('--out', '/tank/sifter/seg-pilot.md');
const { docs } = await listDocs({ ids, fields: ['id', 'title', 'language', 'file_path'], limit: ids.length || 1 });
let spentEstimate = 0;
for (const d of docs) {
  const lang = String(d.language || 'ar').toLowerCase().startsWith('fa') ? 'fa' : 'ar';
  if (spentEstimate >= maxTotal) { console.log(JSON.stringify({ id: d.id, status: 'run-cap-reached', maxTotal })); continue; }
  const r = await segmentFile(join(config.library.basePath, d.file_path), { apply: APPLY, maxUsd, lang, pilot, pilotOut, relPath: d.file_path });
  if (r.status === 'segmented' || r.status === 'pilot') spentEstimate += r.estimateUsd || 0;
  console.log(JSON.stringify({ id: d.id, title: d.title?.slice(0, 40), ...r }));
}
process.exit(0);
