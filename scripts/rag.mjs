#!/usr/bin/env node
// CorpusRAG CLI — the ONE invocation surface for the library. Parses `<stage> <docId> [--opt=val …]` and
// calls the interface. Loads env, then the app-wired `rag` instance. Examples:
//   node scripts/rag.mjs profile 21310
//   node scripts/rag.mjs reconcile 21310 --dryRun=true --filter=Aḥmad --limit=10
//   SIFTER_WRITER_URL=http://127.0.0.1:7849 node scripts/rag.mjs project --auto=true --kinds=link --hiConf=0.9
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { rag } = await import('../api/lib/rag-adapter/index.js');

const argv = process.argv.slice(2);
const stage = argv[0];
const coerce = (v) => (v === undefined ? true : v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v.includes(',') ? v.split(',') : v);
// Separate --flags from positionals wherever they appear (a flag-only stage like `project` has no docId).
const arg = argv.slice(1).find((a) => !a.startsWith('--'));
const opts = Object.fromEntries(argv.slice(1).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, coerce(v)]; }));
const doc = Number(arg);

const stages = {
  profile: () => rag.profile(doc),
  disambiguate: () => rag.disambiguate(doc, opts),
  hype: () => rag.retrieval.index(doc, opts),
  mentions: () => rag.entities.mentions(doc, opts),
  claims: () => rag.entities.claims(doc, opts),
  reconcile: () => rag.entities.reconcile(doc, opts),
  project: () => rag.entities.project(opts),
  merge: () => rag.entities.merge(opts),
  lookup: () => rag.entities.lookup(arg, opts),
};
if (!stages[stage]) { console.error(`stages: ${Object.keys(stages).join(', ')}`); process.exit(1); }

const result = await stages[stage]();
// Print compactly; a long decisions[] is summarised (use dryRun batches for review).
console.log(JSON.stringify(result, (k, v) => (k === 'decisions' && Array.isArray(v) && v.length > 40 ? `[${v.length} decisions]` : v), 2));
process.exit(0);
