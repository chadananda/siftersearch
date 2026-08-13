// Detect + correct mislabeled document languages (books tagged `en`/NULL that are actually German,
// French, Italian, Spanish, Latin, or a non-Latin script). Wrong labels route non-English books to the
// English deepseek path, which produces garbage and burns tokens in a re-enqueue loop — so relabeling
// lets the language-capability gate (api/lib/pipeline/plan.js) PARK them instead of churning.
//
// Read-only on sifter.db for samples; writes docs.language ONLY via the single writer (/write :7849).
// Dry-run by default; pass --apply to write. Scope: enrichment candidates (docs that have grounding_queue
// rows) — the set the pipeline actually tries to process. --all widens to every en/NULL doc (slower).
//
//   node scripts/relabel-languages.mjs            # dry run over grounding candidates
//   node scripts/relabel-languages.mjs --apply    # write the corrections
//   node scripts/relabel-languages.mjs --all --apply
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');
const WRITER = process.env.SIFTER_WRITER_URL || 'http://127.0.0.1:7849';

const { queryAll } = await import('../api/lib/db.js');
const { detectLang } = await import('../api/lib/pipeline/profile.js');

// Same detector the pipeline uses (script-dominance for he/ar/fa, function words for Latin). metaLang=null
// so the decision rests entirely on the sampled text, never the (suspect) existing label.
const detect = (sample) => detectLang(sample, null);

async function writeBatch(statements) {
  const res = await fetch(`${WRITER}/write`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ statements, name: 'relabel-languages' }),
  });
  if (!res.ok) throw new Error(`writer ${res.status}: ${await res.text()}`);
  return res.json();
}

// Candidate docs: enrichment set (has grounding_queue rows) unless --all. Only en/NULL are suspect —
// a doc already tagged a non-English language is trusted (someone labeled it deliberately).
const candidates = ALL
  ? await queryAll(`SELECT id, title, language FROM docs
       WHERE deleted_at IS NULL AND duplicate_of IS NULL AND (language IS NULL OR language='en')
         AND coalesce(paragraph_count,0) >= 10`)
  : await queryAll(`SELECT d.id, d.title, d.language FROM docs d
       WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL AND (d.language IS NULL OR d.language='en')
         AND d.id IN (SELECT DISTINCT doc_id FROM grounding_queue)`);

// Run through the shared harness so a DRY run is not a throwaway console dump: its proposals land in
// ingest_stage/pipeline_run and are reviewable at /api/admin/ingest/status. Mislabelled languages cost real
// money the moment grounding starts (an English-labelled French book goes to a model that cannot read it),
// so the proposals need to be inspectable BEFORE anyone approves the write.
const { runStage } = await import('./lib/stage-runner.mjs');
const stageState = await import('../api/lib/pipeline/stage-state.js');

await runStage('relabel', { anyTime: process.argv.includes('--any-time') }, async (tally) => {
console.log(`Scanning ${candidates.length} candidate docs (${ALL ? 'ALL en/NULL' : 'grounding set'})…\n`);
tally.backlog = candidates.length;

const changes = [];
for (const d of candidates) {
  // Sample the first ~40 real paragraphs (enough for a confident function-word signal).
  const rows = await queryAll(
    `SELECT text FROM content WHERE doc_id=? AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL
       AND length(trim(text)) > 30 ORDER BY paragraph_index LIMIT 40`, [d.id]).catch(() => []);
  const sample = rows.map((r) => r.text).join(' ');
  if (sample.length < 400) continue;                       // too little text to judge
  const lang = detect(sample);
  if (lang !== 'en') changes.push({ id: d.id, title: d.title, from: d.language || 'NULL', to: lang });
}

changes.sort((a, b) => a.to.localeCompare(b.to) || a.id - b.id);
for (const c of changes) console.log(`  ${c.id}  ${c.from} → ${c.to}   ${(c.title || '').slice(0, 50)}`);
// Record every proposal, applied or not: `pending` means "detected, awaiting approval", `done` means written.
tally.in = candidates.length;
for (const c of changes) {
  tally.reason(`${c.from} → ${c.to}`);
  await stageState.markStage(c.id, 'relabel', {
    status: APPLY ? 'done' : 'pending',
    version: 'detectLang-v2',
    reason: `${c.from} → ${c.to}`,
    payload: { title: c.title, from: c.from, to: c.to },
  }).catch(() => {});
}
console.log(`\n${changes.length} docs detected as non-English.`);

const byLang = changes.reduce((m, c) => ((m[c.to] = (m[c.to] || 0) + 1), m), {});
console.log('By language:', JSON.stringify(byLang));

if (!APPLY) {
  console.log('\nDRY RUN — proposals recorded at /api/admin/ingest/status (stage=relabel). Pass --apply to write.');
  return;
}
if (!changes.length) { console.log('\nNothing to change.'); return; }

// Write in one batch through the single writer.
const statements = changes.map((c) => ({ sql: `UPDATE docs SET language=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, args: [c.to, c.id] }));
const out = await writeBatch(statements);
const applied = out.results?.reduce((n, r) => n + (r.changes || 0), 0) ?? 0;
tally.out = applied;
console.log(`\nApplied ${applied} language corrections via the single writer.`);
});
