#!/usr/bin/env node
// Build life timelines for biography pages (runs ON tower). Per person: dossier facts → api/lib/bio-timeline.js → one
// DeepSeek call → BIO_ROOT/timelines/<id>.json (served by getBioPerson). Every cited fact gets the best public link
// (lib/source-links linkFor: OceanLibrary range link with the proof highlighted, else our reader). Skips people whose
// file is current (same TIMELINE_VERSION) unless --force. Read-only DB; writes only files.
//   node scripts/bio/build-timelines.mjs (--ids 1247554,… | --top 500) [--concurrency 8] [--force] [--dry]
import dotenv from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
const { BIO_ROOT, listBioPersons, getBioPerson } = await import('../../api/lib/bio.js');
const { selectFacts, timelinePrompt, reviewPrompt, parseTimeline, citedSources, TIMELINE_VERSION } = await import('../../api/lib/bio-timeline.js');
const { linkFor } = await import('../../api/lib/source-links.js');
const { queryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');

const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const FORCE = process.argv.includes('--force'), DRY = process.argv.includes('--dry'), CONC = Number(opt('--concurrency', 8));
const OUT = join(BIO_ROOT, 'timelines');
mkdirSync(OUT, { recursive: true });

let ids = (opt('--ids', '') || '').split(',').filter(Boolean).map(Number);
if (opt('--top')) ids = (await listBioPersons()).persons.slice().sort((a, b) => b.importance - a.importance).slice(0, Number(opt('--top'))).map((p) => p.id);

/** paraId "p<content.id>" → best public link for that paragraph, narrowed to the proof span when it can be. */
async function attachLinks(facts) {
  const cids = [...new Set(facts.map((f) => /^p(\d+)$/.exec(f.paraId || '')?.[1]).filter(Boolean).map(Number))];
  const rows = new Map();
  for (let i = 0; i < cids.length; i += 400) {
    const chunk = cids.slice(i, i + 400);
    for (const r of await queryAll(`SELECT c.id cid, c.paragraph_index, c.external_para_id, c.block_attrs, c.text,
        d.id, d.source_url, d.metadata, d.religion, d.collection, d.slug, d.external_id, d.title
        FROM content c JOIN docs d ON d.id = c.doc_id WHERE c.id IN (${chunk.map(() => '?').join(',')})`, chunk, 'bio-timeline:links')) rows.set(r.cid, r);
  }
  for (const f of facts) {
    const r = rows.get(Number(/^p(\d+)$/.exec(f.paraId || '')?.[1]));
    if (r) f.url = linkFor(r, r.paragraph_index, { quote: f.proof || null }).url;
  }
}

const cost = { people: 0, tokens: 0, skipped: 0, failed: 0 };
async function build(id) {
  const file = join(OUT, `${id}.json`);
  if (!FORCE && existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).version === TIMELINE_VERSION) { cost.skipped++; return; }
  const p = await getBioPerson(id);
  if (!p) return;
  const facts = selectFacts(p.characterizations);
  if (facts.length < 3) { console.log(JSON.stringify({ id, name: p.name, skip: 'too few facts', facts: facts.length })); return; }
  await attachLinks(facts);
  const t0 = Date.now();
  let timeline = null, usage = 0;
  const call = async (messages) => {
    const r = await chatCompletion(messages, { provider: 'deepseek', model: 'deepseek-v4-flash', temperature: 0.2, maxTokens: 6000, thinking: false, responseFormat: { type: 'json_object' }, caller: 'bio-timeline' });
    usage += r?.usage?.totalTokens || 0;
    return parseTimeline(r?.content ?? r, facts);
  };
  for (let attempt = 1; attempt <= 2 && !timeline?.events?.length; attempt++) timeline = await call(timelinePrompt(p, facts));
  // review pass: duplicates, order, empty events, missing authoritative happenings; keep the draft if the review fails
  if (timeline?.events?.length && !process.argv.includes('--no-review')) {
    const reviewed = await call(reviewPrompt(p, facts, timeline)).catch(() => null);
    if (reviewed?.events?.length >= 3) timeline = reviewed;
  }
  if (!timeline?.events?.length) { cost.failed++; console.log(JSON.stringify({ id, name: p.name, error: 'no valid timeline' })); return; }
  cost.people++; cost.tokens += usage;
  const out = { id, name: p.name, version: TIMELINE_VERSION, model: 'deepseek-v4-flash', built_at: new Date().toISOString(),
    facts_available: p.characterizations.length, facts_used: facts.length, ...timeline, sources: citedSources(timeline, facts) };
  if (!DRY) writeFileSync(file, JSON.stringify(out));
  console.log(JSON.stringify({ id, name: p.name, events: timeline.events.length, rel: timeline.relationships.length, journeys: timeline.journeys.length,
    conflicts: timeline.events.filter((e) => e.conflict).length, tokens: usage, secs: Math.round((Date.now() - t0) / 1000) }));
}

const queue = [...ids];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (queue.length) {
    const id = queue.shift();
    try { await build(id); } catch (e) { cost.failed++; console.log(JSON.stringify({ id, error: String(e.message || e).slice(0, 200) })); }
  }
}));
console.log(JSON.stringify({ done: true, total: ids.length, ...cost }));
process.exit(0);
