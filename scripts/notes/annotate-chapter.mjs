#!/usr/bin/env node
// Annotate ONE chapter with instructor notes. The unit Chad asked for: a chapter at a time, reviewed before
// the next is spent.
//
//   node scripts/notes/annotate-chapter.mjs --doc=21308 --list          # what chapters exist
//   node scripts/notes/annotate-chapter.mjs --doc=21308 --chapter=1     # DRY RUN: model + gates, no writes
//   node scripts/notes/annotate-chapter.mjs --doc=21308 --chapter=1 --apply
//
// DRY RUN BY DEFAULT. A prompt change is judged on rendered output before it touches the ledger, and a
// dry run is also the honest way to see the cost of a chapter before committing a book.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });

const arg = (k, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const DOC = Number(arg('doc', 21308));
const CHAPTER = arg('chapter');
const APPLY = process.argv.includes('--apply');

const { loadChapter, listChapters, makeModel } = await import('../../api/lib/notes/runtime.js');
const { annotateChapter } = await import('../../api/lib/notes/chapter.js');
const { renderChapter } = await import('../../api/lib/notes/render.js');
const ledger = await import('../../api/lib/notes/ledger.js');
const profileModule = await import('../../api/lib/notes/profiles/dawn-breakers.js');

if (process.argv.includes('--list')) {
  for (const c of await listChapters(DOC)) console.log(`  ${String(c.chapter).padEnd(6)} ${String(c.paragraphs).padStart(5)} ¶  ${c.title || ''}`);
  process.exit(0);
}
if (!CHAPTER) { console.error('usage: --doc=<id> --chapter=<n> [--apply] | --list'); process.exit(1); }

const profile = { ...profileModule.profile, version: ledger.NOTES_VERSION };
const model = await makeModel(profileModule);
console.error(`doc ${DOC} chapter ${CHAPTER} · model ${model.id} · ${APPLY ? 'APPLY' : 'DRY RUN'}`);

const r = await annotateChapter({
  docId: DOC, chapter: CHAPTER, profile, dryRun: !APPLY,
  deps: { loadChapter, model, ledger, log: { info: (o, m) => console.error(m, JSON.stringify(o)) } },
});

console.error(`\n${r.title}: ${r.stats.paragraphs} ¶ · processed ${r.stats.processed} · skipped ${r.stats.skipped}`
  + ` · kept ${r.stats.kept} · held ${r.stats.held} · dropped ${r.stats.dropped} · no-note ${r.stats.empty}`);

// What the gates removed, and why — a review must see this, not just the survivors.
for (const p of r.results) {
  for (const n of [...p.held, ...p.dropped]) console.error(`  ¶${p.index} [${n._judge.verdict}] ${n.category}: ${n._judge.reason}`);
}

// The notes themselves, in Chad's format.
const kept = r.results.flatMap((p) => p.kept.map((n) => ({ ...n, paragraph_index: p.index, claim_kind: n.claimKind })));
console.log('\n' + renderChapter(kept, { categories: profileModule.CATEGORIES, chapterTitle: r.title }));
if (!APPLY) console.error('\nDRY RUN — nothing written. Re-run with --apply once the notes read well.');
process.exit(0);
