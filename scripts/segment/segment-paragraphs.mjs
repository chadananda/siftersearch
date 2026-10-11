#!/usr/bin/env node
// Paragraph segmentation of oversized Arabic/Persian paragraphs so the texts ingest as proper units (Chad 10-11). Haiku 5.5
// (thinking) via Anthropic Message Batches (half price) returns, per oversized paragraph, the phrase indices that begin
// sentences and paragraphs (lib/segment/phrase-segment.js). The SOURCE FILE is rewritten (backup on /tank, flagged
// needs_segmentation: false) and the document re-ingested out of process. Skips CTAI-aligned originals (paragraphed from
// the English) and scraped sites. Every phase is resumable from files in --dir; runs ON tower.
//   plan    --dir D [--min-words 400] [--ids 1,2]   pick oversized paragraphs → requests.jsonl (+ $ estimate)
//   submit  --dir D [--max-usd 30]                  create the batch(es) → batches.json
//   status  --dir D
//   collect --dir D                                 results → results.jsonl / failed.jsonl; spend → ai_usage (batch rate)
//   apply   --dir D [--apply]                       rewrite source files (dry by default) → changed-docs.json
//   ingest  --dir D                                 re-ingest changed docs out of process (library-fixes reingest)
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const { config } = await import('../../api/lib/config.js');
const { queryAll } = await import('../../api/lib/db.js');
const { cleanText } = await import('../../api/lib/phrases.js');
const seg = await import('../../api/lib/segment/phrase-segment.js');
const { assertAnthropicAllowed } = await import('../../api/lib/anthropic-policy.js');

const [cmd] = process.argv.slice(2);
const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const DIR = opt('--dir'); if (!DIR) throw new Error('--dir required');
mkdirSync(DIR, { recursive: true });
const F = (n) => join(DIR, n);
const readJsonl = (n) => (existsSync(F(n)) ? readFileSync(F(n), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const MODEL = seg.MODEL, MAX_REQ_CHARS = 60000, BATCH_SIZE = 5000;
const wordsOf = (t) => cleanText(t).split(/\s+/).filter(Boolean).length;
const langOf = (l) => (String(l || '').toLowerCase().startsWith('fa') ? 'fa' : 'ar');
const usdOf = (chars) => (chars * 0.78 * 0.1 + chars * 0.47 * 0.5) / 1e6 * 0.5;   // measured 10-11; batch = ½

if (cmd === 'plan') {
  const min = Number(opt('--min-words', 400));
  const ids = opt('--ids') ? String(opt('--ids')).split(',').map(Number) : null;
  const rows = await queryAll(`SELECT c.id pid, c.doc_id doc, c.paragraph_index pi, c.text, d.language lang, d.file_path fp
    FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE c.deleted_at IS NULL AND d.deleted_at IS NULL AND d.duplicate_of IS NULL AND lower(substr(d.language,1,2)) IN ('fa','ar')
      AND d.file_path NOT LIKE '..%' AND d.file_path NOT LIKE '-sites/%'
      AND d.id NOT IN (SELECT DISTINCT orig_doc FROM content_alignment WHERE orig_doc IS NOT NULL)
      ${ids ? `AND d.id IN (${ids.map(() => '?').join(',')})` : ''}`, ids || []);
  let n = 0, chars = 0, tooBig = 0;
  writeFileSync(F('requests.jsonl'), '');
  for (const r of rows) {
    if (wordsOf(r.text) <= min) continue;
    const clean = cleanText(r.text);
    if (clean.length > MAX_REQ_CHARS) { tooBig++; appendFileSync(F('too-big.jsonl'), JSON.stringify({ pid: r.pid, doc: r.doc, chars: clean.length }) + '\n'); continue; }
    const spans = seg.phraseSpans(r.text, langOf(r.lang));
    if (spans.length < 3) continue;
    const user = seg.requestText([{ key: `P${r.pid}`, phrases: spans.map((s) => clean.slice(s.start, s.end)) }]).replace(/^P\d+:\n/, '');
    appendFileSync(F('requests.jsonl'), JSON.stringify({ custom_id: `p${r.pid}`, pid: r.pid, doc: r.doc, lang: langOf(r.lang), chars: clean.length, user }) + '\n');
    n++; chars += clean.length;
  }
  const docs = new Set(readJsonl('requests.jsonl').map((r) => r.doc)).size;
  console.log(JSON.stringify({ requests: n, docs, chars, too_big: tooBig, estimate_usd: +usdOf(chars).toFixed(2) }));
}

if (cmd === 'submit') {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const reqs = readJsonl('requests.jsonl');
  const est = usdOf(reqs.reduce((a, r) => a + r.chars, 0));
  if (est > Number(opt('--max-usd', 30))) { console.log(JSON.stringify({ refused: 'over --max-usd', estimate_usd: est })); process.exit(1); }
  for (const lang of new Set(reqs.map((r) => r.lang))) assertAnthropicAllowed({ provider: 'anthropic', model: MODEL, stage: 'file-segment', sourceLang: lang });
  const batches = existsSync(F('batches.json')) ? JSON.parse(readFileSync(F('batches.json'), 'utf8')) : [];
  const done = new Set(batches.flatMap((b) => b.ids));
  const todo = reqs.filter((r) => !done.has(r.custom_id));
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const part = todo.slice(i, i + BATCH_SIZE);
    const b = await client.messages.batches.create({ requests: part.map((r) => ({ custom_id: r.custom_id, params: {
      model: MODEL, max_tokens: 16000, thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: seg.SYSTEM_PARAGRAPHS, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: r.user }] } })) });
    batches.push({ id: b.id, ids: part.map((r) => r.custom_id), created: new Date().toISOString() });
    writeFileSync(F('batches.json'), JSON.stringify(batches, null, 1));
    console.log(JSON.stringify({ batch: b.id, requests: part.length }));
  }
}

if (cmd === 'status' || cmd === 'collect') {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const batches = JSON.parse(readFileSync(F('batches.json'), 'utf8'));
  const have = new Set([...readJsonl('results.jsonl'), ...readJsonl('failed.jsonl')].map((r) => r.custom_id));
  const { logAIUsage } = await import('../../api/lib/ai-services.js');
  for (const b of batches) {
    const s = await client.messages.batches.retrieve(b.id);
    console.log(JSON.stringify({ batch: b.id, status: s.processing_status, counts: s.request_counts }));
    if (cmd !== 'collect' || s.processing_status !== 'ended') continue;
    for await (const r of await client.messages.batches.results(b.id)) {
      if (have.has(r.custom_id)) continue;
      if (r.result.type !== 'succeeded') { appendFileSync(F('failed.jsonl'), JSON.stringify({ custom_id: r.custom_id, type: r.result.type, error: r.result.error?.error?.message || null }) + '\n'); continue; }
      const m = r.result.message; const u = m.usage || {};
      logAIUsage({ provider: 'anthropic', model: MODEL, serviceType: 'segmentation', caller: 'segment-paragraphs', batch: true,
        promptTokens: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
        completionTokens: u.output_tokens || 0, cachedTokens: u.cache_read_input_tokens || 0, cacheWriteTokens: u.cache_creation_input_tokens || 0 });
      const text = m.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
      const parsed = seg.parseParagraphReply(text);
      if (!parsed) { appendFileSync(F('failed.jsonl'), JSON.stringify({ custom_id: r.custom_id, type: 'unparsable', head: text.slice(0, 200) }) + '\n'); continue; }
      appendFileSync(F('results.jsonl'), JSON.stringify({ custom_id: r.custom_id, sentences: [...parsed.sentences], paragraphs: [...parsed.paragraphs] }) + '\n');
    }
  }
  if (cmd === 'collect') await new Promise((res) => setTimeout(res, 1500));     // logAIUsage writes on setImmediate
}

if (cmd === 'apply') {
  const APPLY = process.argv.includes('--apply');
  const { hashContentWords } = await import('../../api/services/ingester.js');
  const reqs = new Map(readJsonl('requests.jsonl').map((r) => [r.custom_id, r]));
  const byDoc = new Map();
  for (const res of readJsonl('results.jsonl')) { const q = reqs.get(res.custom_id); if (q) (byDoc.get(q.doc) || byDoc.set(q.doc, []).get(q.doc)).push({ ...q, ...res }); }
  const changed = []; const stats = { docs: 0, paragraphs_split: 0, new_paragraphs: 0, kept_whole: 0, not_found_in_file: 0, verify_failed: 0 };
  for (const [doc, list] of byDoc) {
    const [d] = await queryAll('SELECT file_path, language FROM docs WHERE id = ?', [doc]);
    const path = join(config.library.basePath, d.file_path);
    if (!existsSync(path)) { stats.not_found_in_file += list.length; continue; }
    let text = readFileSync(path, 'utf8'); let touched = false;
    // hash every block ONCE per file (re-splitting + re-hashing the whole file per result was quadratic: 40+ min)
    const parts = text.split(/(\n[ \t]*\n)/);
    const blockAt = new Map();
    parts.forEach((b, i) => { if (i % 2 === 0 && b.trim()) { const k = hashContentWords(b); if (!blockAt.has(k)) blockAt.set(k, i); } });
    for (const r of list) {
      const [row] = await queryAll('SELECT text FROM content WHERE id = ? AND deleted_at IS NULL', [r.pid]);
      if (!row) continue;
      const clean = cleanText(row.text); const spans = seg.phraseSpans(row.text, r.lang);
      const blocks = seg.buildParagraphs(clean, spans, { sentences: new Set(r.sentences), paragraphs: new Set(r.paragraphs) });
      if (!blocks) { stats.verify_failed++; continue; }
      if (blocks.length < 2) { stats.kept_whole++; continue; }
      const h = hashContentWords(row.text);
      const at = blockAt.get(h);
      if (at == null) { stats.not_found_in_file++; continue; }
      blockAt.delete(h); parts[at] = blocks.join('\n\n'); touched = true;
      stats.paragraphs_split++; stats.new_paragraphs += blocks.length;
    }
    if (!touched) continue;
    text = parts.join('');
    stats.docs++; changed.push(doc);
    if (APPLY) {
      const bk = join('/tank/sifter/segment-backups', `${d.file_path}.${Date.now()}`);
      mkdirSync(dirname(bk), { recursive: true }); copyFileSync(path, bk);
      const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
      if (fm && !/^needs_segmentation:\s*false/m.test(fm[1])) text = `---\nneeds_segmentation: false\n${text.slice(4)}`;
      writeFileSync(path, text);
    }
  }
  writeFileSync(F('changed-docs.json'), JSON.stringify(changed));
  console.log(JSON.stringify({ apply: APPLY, ...stats }));
}

if (cmd === 'ingest') {
  const changed = JSON.parse(readFileSync(F('changed-docs.json'), 'utf8'));
  writeFileSync(F('ingest-plan.json'), JSON.stringify({ reingest: changed }));
  const r = spawnSync('node', ['scripts/library/library-fixes.mjs', '--plan', F('ingest-plan.json'), '--apply'], { encoding: 'utf8', env: process.env, maxBuffer: 256 << 20 });
  writeFileSync(F('ingest.log'), r.stdout + r.stderr);
  const lines = r.stdout.split('\n').filter((l) => l.includes('"reingested"')).map((l) => JSON.parse(l));
  console.log(JSON.stringify({ docs: lines.length, ok: lines.filter((l) => l.ok).length, failed: lines.filter((l) => !l.ok).map((l) => l.id) }));
}
process.exit(0);
