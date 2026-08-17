#!/usr/bin/env node
/**
 * Score the ANSWER-PATH DECISION LAYER against fixtures.
 *
 * Phase 1 (offline half) of planning/search-quality-plan.md. Every quality number we had came from
 * /api/v1/search — retrieval — and the justice investigation showed all four defects were downstream of it,
 * in the decisions between "we found it" and "we said it". This scores those decisions.
 *
 * WHAT IT DOES NOT MEASURE, stated plainly: it does not call the model, does not judge answer prose, and does
 * not test retrieval. It asserts that given a realistic retrieval result, the pipeline decides correctly
 * whether the library answered. That is the layer that broke; end-to-end scoring is the other half of Phase 1
 * and needs live /chat/stream calls.
 *
 *   node tests/quality/score-answer-decisions.mjs
 *   node tests/quality/score-answer-decisions.mjs --json
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { isQuoteMiss, buildWebQuestion } from '../../api/lib/jafar-pipeline.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(readFileSync(join(HERE, 'answer-decisions.json'), 'utf8'));
const JSON_ONLY = process.argv.includes('--json');

const results = CASES.map((c) => {
  const candidates = (c.candidates || []).map((text) => ({ text }));
  const lookup = { span: c.span, confidence: c.confidence };
  const got = isQuoteMiss(lookup, candidates);
  const pass = got === c.expect.quote_miss;
  // The web question is only meaningful when we actually consult the web.
  const webQ = got ? buildWebQuestion(c.question, lookup) : null;
  const webQOk = !webQ || (webQ.startsWith(c.question) && !/authoritative compilation|earlier book it cites/i.test(webQ));
  return { id: c.id, pass: pass && webQOk, quote_miss: { expected: c.expect.quote_miss, got }, webQOk, why: c.why };
});

const passed = results.filter((r) => r.pass).length;
const score = Math.round((passed / results.length) * 1000) / 10;

if (JSON_ONLY) {
  console.log(JSON.stringify({ score, passed, total: results.length, results }, null, 2));
} else {
  console.log(`\nANSWER-PATH DECISIONS — ${passed}/${results.length} (${score}%)\n`);
  for (const r of results) {
    const mark = r.pass ? '✓' : '✗';
    console.log(`  ${mark} ${r.id.padEnd(26)} quote_miss expected=${String(r.quote_miss.expected).padEnd(5)} got=${String(r.quote_miss.got).padEnd(5)}${r.webQOk ? '' : '  [web question regressed]'}`);
    if (!r.pass) console.log(`      ${r.why}`);
  }
  console.log(`\n  Scope: decision layer only — no model call, no prose judgement, no retrieval test.`);
  console.log(`  End-to-end scoring over /chat/stream is the other half of Phase 1.\n`);
}
process.exit(passed === results.length ? 0 : 1);
