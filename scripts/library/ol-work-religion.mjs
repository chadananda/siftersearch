#!/usr/bin/env node
// Put rows of a multi-part OceanLibrary work into the work's own tradition (OL_WORK_RELIGION — KJV → Christian; Chad 10-10
// "maybe just one book?"). New ingests get it from the adapter; this fixes rows already held. Paragraphs re-sync (search
// payloads carry religion). Runs ON tower with SIFTER_WRITER_URL. Dry run by default.
//   node scripts/library/ol-work-religion.mjs [--apply]
import { listDocs, setDocReligion } from '../../api/lib/docs-repo.js';
import { OL_WORK_RELIGION } from '../../api/lib/library/ol-works.js';

const APPLY = process.argv.includes('--apply');
if (APPLY && !process.env.SIFTER_WRITER_URL) throw new Error('SIFTER_WRITER_URL is required to write');
for (const [work, religion] of Object.entries(OL_WORK_RELIGION)) {
  const { docs } = await listDocs({ collection: work, sourceSite: 'oceanlibrary.com', fields: ['id', 'title', 'religion'], limit: 1000 });
  const move = docs.filter((d) => d.religion !== religion);
  console.log(JSON.stringify({ work, religion, parts: docs.length, toMove: move.length, from: [...new Set(move.map((d) => d.religion))] }));
  if (APPLY) for (const d of move) await setDocReligion(d.id, religion);
}
process.exit(0);
