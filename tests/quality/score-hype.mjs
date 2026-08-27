#!/usr/bin/env node
/**
 * SCORE HyPE QUESTION QUALITY with a second model.
 *
 * Chad, 2026-08-26: "you cannot test this mechanically. Maybe we use another model to validate?"
 *
 * He is right. dedupeByAnswer catches questions that cite the SAME span, and nothing else: two questions can
 * be redundant in different words, and "would a real person ever type this" is not mechanically decidable at
 * all. Reading three paragraphs myself is not measurement either — it is an anecdote, and I have twice
 * reported one as a result tonight.
 *
 * So: a model that did not write the questions grades them against the paragraph, four ways —
 *   searchable   would a real reader type this? (a comprehension check like "what does this passage ask
 *                the reader to ponder" fails here, and that phrasing was 100% of v3's worst output)
 *   answered     does THIS paragraph actually answer it, or was it invented from context?
 *   distinct     or is it another question in the same set, reworded?
 *   missed       set-level: what does the paragraph clearly answer that nothing asks about?
 *
 * The last one matters most and is the one no mechanical check can approach: over-tightening the prompt
 * shows up as questions going MISSING, which looks like an improvement in every other number.
 *
 *   node tests/quality/score-hype.mjs --doc=20911 --sample=12
 *   node tests/quality/score-hype.mjs --doc=20911 --sample=12 --json
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `=${d}`).split('=')[1];
const secret = (name) => {
  const line = readFileSync(join(ROOT, '.env-secrets'), 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, '') : '';
};

const API = arg('api', 'https://api.siftersearch.com');
const DOC = Number(arg('doc', 20911));
const SAMPLE = Number(arg('sample', 12));
const KEY = secret('DEPLOY_SECRET');

const RUBRIC = `You are grading SEARCH QUESTIONS written for one passage. They exist so a reader's own wording retrieves this passage.

For EACH question return:
  "searchable": true only if a real reader might type it into a search box. FALSE for anything referring to the text itself ("what does this passage say/ask", "according to the following"), and FALSE for a topic with a question mark that would match anything ("what did the author say about nature?").
  "answered": true only if THIS passage answers it — either text. A question about an original-language term is ANSWERED when that term appears in the original passage shown, even though the English does not contain it: that is what the two texts are for. False only if it genuinely needs knowledge from outside both.
  "distinct": false if another question in the set asks the same thing in different words — name it in "same_as".
Then for the SET:
  "missed": short list of things this passage clearly answers that NO question covers. Be strict; this is the most useful field.
Return ONLY JSON:
{"questions":[{"i":0,"searchable":true,"answered":true,"distinct":true,"same_as":null,"why":"…"}],"missed":["…"]}`;

async function judge(paragraph, original, questions, model) {
  const body = {
    provider: 'anthropic', model, temperature: 0, maxTokens: 4000,
    system: RUBRIC,
    // THE ORIGINAL GOES TOO. Without it the judge sees only the English and marks every question about an
    // original-language term "requires outside knowledge" — which would have had me tear out the terms that
    // are the entire reason for the bilingual layer. Judging bilingual questions against monolingual
    // evidence measures the wrong population; that error has cost this project a night before.
    user: `PASSAGE (English):\n${paragraph}${original ? `\n\nPASSAGE (original language — a question about a term FOUND HERE is answerable):\n${original}` : ''}\n\nQUESTIONS:\n${questions.map((q, i) => `${i}. ${q}`).join('\n')}`,
  };
  const r = await fetch(`${API}/api/admin/concepts/judge-hype`, {
    method: 'POST', headers: { 'X-Internal-Key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId: DOC, ...body }), signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new Error(`judge ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const qsOf = (row) => {
  let q = row.hyp_questions;
  try { q = typeof q === 'string' ? JSON.parse(q) : q; } catch { /* raw */ }
  return (Array.isArray(q) ? q : q?.questions) || [];
};

const res = await fetch(`${API}/api/admin/docs/${DOC}/paragraphs?limit=1000`, { headers: { 'X-Internal-Key': KEY } });
const rows = (await res.json()).paragraphs.filter((r) => qsOf(r).length);
if (!rows.length) { console.error(`doc ${DOC} has no HyPE questions`); process.exit(1); }

// EVENLY SPACED, not the first N: a book's opening paragraphs are unrepresentative, and sampling a prefix
// is the mistake this project has made twice tonight.
const step = Math.max(1, Math.floor(rows.length / SAMPLE));
const picked = rows.filter((_, i) => i % step === 0).slice(0, SAMPLE);

const tally = { questions: 0, searchable: 0, answered: 0, distinct: 0, missed: 0, paragraphs: picked.length };
const worst = [];
for (const row of picked) {
  const questions = qsOf(row);
  let v;
  try { v = await judge(row.text, row.original_text, questions, arg('model', 'claude-sonnet-4-6')); }
  catch (e) { console.error(`  ¶${row.paragraph_index}: ${e.message}`); continue; }
  tally.questions += questions.length;
  for (const q of v.questions || []) {
    if (q.searchable) tally.searchable++;
    if (q.answered) tally.answered++;
    if (q.distinct) tally.distinct++;
    if (!q.searchable || !q.answered || !q.distinct) {
      worst.push({ para: row.paragraph_index, q: questions[q.i], why: q.why, same_as: q.same_as ?? null });
    }
  }
  tally.missed += (v.missed || []).length;
  if ((v.missed || []).length) worst.push({ para: row.paragraph_index, missed: v.missed });
}

const pct = (n) => (tally.questions ? Math.round((100 * n) / tally.questions) : 0);
const report = { doc: DOC, model: arg('model', 'claude-sonnet-4-6'), ...tally,
  searchablePct: pct(tally.searchable), answeredPct: pct(tally.answered), distinctPct: pct(tally.distinct),
  missedPerParagraph: tally.paragraphs ? Number((tally.missed / tally.paragraphs).toFixed(2)) : 0 };

if (process.argv.includes('--json')) { console.log(JSON.stringify({ report, worst }, null, 2)); }
else {
  console.log(`\nHyPE quality — doc ${DOC}, ${tally.paragraphs} paragraphs, ${tally.questions} questions`);
  console.log(`  searchable   ${report.searchablePct}%   (a real reader would type it)`);
  console.log(`  answered     ${report.answeredPct}%   (this passage actually answers it)`);
  console.log(`  distinct     ${report.distinctPct}%   (not another question reworded)`);
  console.log(`  missed       ${report.missedPerParagraph} per paragraph   (answered here, asked by nothing)`);
  for (const w of worst.slice(0, 12)) {
    if (w.missed) console.log(`   ¶${w.para} MISSED: ${w.missed.join(' | ')}`);
    else console.log(`   ¶${w.para} ✗ ${w.q}\n        ${w.why}${w.same_as != null ? ` (same as #${w.same_as})` : ''}`);
  }
}
// History, so a prompt revision is compared rather than admired.
const hist = join(HERE, 'hype-history.json');
const all = existsSync(hist) ? JSON.parse(readFileSync(hist, 'utf8')) : [];
all.push({ at: new Date().toISOString(), ...report });
writeFileSync(hist, JSON.stringify(all, null, 2));
