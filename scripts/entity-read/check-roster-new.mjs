// Diagnostic: show the governing place/section context for two roster entries (scan back for the
// last prose line that names a place or a "natives of / residents of / believers of" marker). Read-only.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const list = await queryAll("SELECT paragraph_index pi, text FROM content WHERE doc_id=21308 AND heading='List of the martyrs' AND deleted_at IS NULL ORDER BY paragraph_index");
const t = new Map(list.map(r => [r.pi, r.text.replace(/\s+/g, ' ')]));
for (const para of [811, 906]) {
  const idx = list.findIndex(r => r.pi === para);
  console.log(`\n===== context before p${para} (looking for the place marker) =====`);
  for (const r of list.slice(Math.max(0, idx - 14), idx + 2)) {
    const long = t.get(r.pi).length > 60;          // prose lines (place markers) vs bare "Name,"
    console.log(`  [${r.pi}]${r.pi === para ? ' <<<' : long ? ' *' : '  '} ${t.get(r.pi).slice(0, 170)}`);
  }
}
process.exit(0);
