#!/usr/bin/env node
/**
 * Search quality diagnostic — tests a dozen cross-religion queries and
 * evaluates result quality: relevance, source diversity, link correctness.
 *
 * Usage:
 *   node scripts/wip/diagnose-search-quality.mjs
 *   node scripts/wip/diagnose-search-quality.mjs --url http://tower-nas:7839
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../');

let envSecrets = {};
try { envSecrets = Object.fromEntries(readFileSync(join(ROOT, '.env-secrets'), 'utf-8').split('\n').filter(l => l.includes('=')).map(l => l.split('='))); } catch {}
let envPublic = {};
try { envPublic = Object.fromEntries(readFileSync(join(ROOT, '.env-public'), 'utf-8').split('\n').filter(l => l.includes('=')).map(l => l.split('='))); } catch {}

const urlArg = process.argv.find(a => a.startsWith('--url='))?.split('=')[1]
  || process.argv.find((a, i) => process.argv[i-1] === '--url')
  || 'http://tower-nas:7839';

const API = urlArg;

// ── Test queries covering all major traditions ─────────────────────────────

const QUERIES = [
  // Bahá'í
  { id: 1, q: "the hidden words of Bahá'u'lláh", religion: "Baha'i", expected_author: "Bahá'u'lláh", expected_title_contains: "Hidden Words" },
  { id: 2, q: "unity of God oneness of humanity", religion: "Baha'i", expected_author: "Bahá'u'lláh" },
  // Islam
  { id: 3, q: "mercy compassion God Rahman Rahim", religion: "Islam", expected_title_contains: "Quran" },
  { id: 4, q: "prayer five times daily salah", religion: "Islam" },
  // Christianity
  { id: 5, q: "love your enemies forgive those who persecute you", religion: "Christian", expected_title_contains: "Bible" },
  { id: 6, q: "blessed are the peacemakers beatitudes sermon on the mount", religion: "Christian" },
  // Judaism
  { id: 7, q: "Shema Israel hear O Israel the Lord our God", religion: "Judaism", expected_title_contains: "Tanakh" },
  { id: 8, q: "justice righteousness tzedakah commandments", religion: "Judaism" },
  // Buddhism
  { id: 9, q: "suffering dukkha eightfold path liberation nirvana", religion: "Buddhist", expected_title_contains: "Pali" },
  { id: 10, q: "mindfulness present moment impermanence", religion: "Buddhist" },
  // Hinduism
  { id: 11, q: "dharma duty action karma yoga", religion: "Hindu", expected_title_contains: "Gita" },
  // Cross-tradition (no religion filter)
  { id: 12, q: "soul immortal spirit divine", expected_multiple_religions: true },
  { id: 13, q: "golden rule treat others as yourself", expected_multiple_religions: true },
  { id: 14, q: "prayer meditation communion with God", expected_multiple_religions: true },
];

// ── Search call ─────────────────────────────────────────────────────────────

async function search(query, opts = {}) {
  const body = {
    query,
    mode: 'passages',
    limit: 8,
    ...opts
  };
  const start = Date.now();
  const PUBLIC_KEY = (envSecrets.PUBLIC_API_KEYS || '').replace(/["']/g, '').trim().split(',')[0].trim();
  const res = await fetch(`${API}/api/v1/tools/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': PUBLIC_KEY
    },
    body: JSON.stringify(body)
  });
  const ms = Date.now() - start;
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    return { error: `HTTP ${res.status}: ${err.slice(0, 200)}`, ms };
  }
  const data = await res.json();
  return { passages: data.passages || [], ms };
}

// ── Analysis helpers ─────────────────────────────────────────────────────────

function analyzeResults(passages, opts = {}) {
  const issues = [];
  const notes = [];

  if (!passages || passages.length === 0) {
    return { score: 0, issues: ['NO RESULTS'], notes: [] };
  }

  // Check link quality
  let withLinks = 0, badLinks = 0;
  for (const p of passages) {
    if (p.source_url) {
      withLinks++;
      if (!p.source_url.startsWith('https://')) badLinks++;
    }
  }
  if (withLinks === 0) issues.push('NO LINKS: no source_url on any passage');
  else if (badLinks > 0) issues.push(`BAD LINKS: ${badLinks} non-https URLs`);

  // Check link format: should have #pN or ?paraId=
  let withAnchor = 0;
  for (const p of passages) {
    if (p.source_url && (p.source_url.includes('#p') || p.source_url.includes('?paraId='))) withAnchor++;
  }
  if (withLinks > 0 && withAnchor === 0) issues.push('NO ANCHORS: links lack #p{N} para anchors');
  else if (withLinks > 0 && withAnchor < withLinks / 2) notes.push(`FEW ANCHORS: only ${withAnchor}/${withLinks} links have paragraph anchors`);

  // Check expected author
  if (opts.expected_author) {
    const hasExpected = passages.some(p => (p.author || '').includes(opts.expected_author.split(' ')[0]));
    if (!hasExpected) issues.push(`MISSING AUTHOR: no results from "${opts.expected_author}"`);
  }

  // Check expected title contains
  if (opts.expected_title_contains) {
    const hasExpected = passages.some(p => (p.title || '').toLowerCase().includes(opts.expected_title_contains.toLowerCase()));
    if (!hasExpected) issues.push(`WRONG SOURCE: no result title contains "${opts.expected_title_contains}"`);
  }

  // Check religion diversity for cross-tradition queries
  if (opts.expected_multiple_religions) {
    const religions = new Set(passages.map(p => p.religion).filter(Boolean));
    if (religions.size <= 1) issues.push(`NO DIVERSITY: only religion "${[...religions][0]}" represented`);
    else notes.push(`Traditions: ${[...religions].join(', ')}`);
  }

  // Check if results are from Bahá'í when religion-filtered to another tradition
  if (opts.religion && opts.religion !== "Baha'i") {
    const wrongReligion = passages.filter(p => p.religion === "Baha'i");
    if (wrongReligion.length > 0) issues.push(`WRONG RELIGION: ${wrongReligion.length}/${passages.length} results are Bahá'í (filter was ${opts.religion})`);
  }

  // Check HyPE match rate
  const hypeMatches = passages.filter(p => p.matched_hype).length;
  if (hypeMatches > 0) notes.push(`HyPE matches: ${hypeMatches}/${passages.length}`);

  // Compute score
  let score = 5;
  score -= issues.length * 1.5;
  score = Math.max(0, Math.min(5, score));

  return { score: Math.round(score * 10) / 10, issues, notes };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Search Quality Diagnostic — ${new Date().toISOString()}`);
  console.log(`API: ${API}\n`);

  const results = [];

  for (const test of QUERIES) {
    const opts = {};
    if (test.religion) opts.religion = test.religion;
    if (test.expected_author) opts.expected_author = test.expected_author;
    if (test.expected_title_contains) opts.expected_title_contains = test.expected_title_contains;
    if (test.expected_multiple_religions) opts.expected_multiple_religions = true;

    process.stdout.write(`[${String(test.id).padStart(2)}] "${test.q.substring(0, 50)}"${test.religion ? ` (${test.religion})` : ''} ... `);

    const { passages, error, ms } = await search(test.q, test.religion ? { religion: test.religion } : {});

    if (error) {
      console.log(`ERROR: ${error}`);
      results.push({ ...test, error, score: 0, issues: [error], notes: [] });
      continue;
    }

    const { score, issues, notes } = analyzeResults(passages, opts);
    const statusIcon = score >= 4 ? '✓' : score >= 2 ? '~' : '✗';
    console.log(`${statusIcon} score=${score} results=${passages.length} ${ms}ms`);

    if (issues.length > 0) {
      for (const iss of issues) console.log(`       ⚠ ${iss}`);
    }
    if (notes.length > 0) {
      for (const n of notes) console.log(`       ℹ ${n}`);
    }

    // Show top 3 results
    for (let i = 0; i < Math.min(3, passages.length); i++) {
      const p = passages[i];
      const hype = p.matched_hype ? ' [HyPE]' : '';
      const linkStatus = p.source_url ? (p.source_url.includes('#p') || p.source_url.includes('paraId') ? '✓link' : '~link') : '✗link';
      console.log(`       ${i+1}. [${p.religion || '?'}] ${(p.title||'?').substring(0,45)} — ${(p.author||'?').substring(0,25)}${hype} ${linkStatus}`);
      console.log(`          ${(p.text||'').substring(0,100)}...`);
      if (p.source_url) console.log(`          ${p.source_url.substring(0,100)}`);
    }
    console.log();

    results.push({ ...test, passages: passages.slice(0, 5), score, issues, notes, ms });
  }

  // Summary
  const avgScore = results.filter(r => !r.error).reduce((sum, r) => sum + r.score, 0) / results.filter(r => !r.error).length;
  const issueTypes = {};
  for (const r of results) {
    for (const iss of r.issues || []) {
      const type = iss.split(':')[0];
      issueTypes[type] = (issueTypes[type] || 0) + 1;
    }
  }

  console.log('═'.repeat(60));
  console.log(`Average score: ${avgScore.toFixed(1)}/5`);
  console.log(`\nTop issues:`);
  for (const [type, count] of Object.entries(issueTypes).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${count}x ${type}`);
  }

  // Link structure check
  const allPassages = results.flatMap(r => r.passages || []);
  const withUrl = allPassages.filter(p => p.source_url);
  const withAnchor = allPassages.filter(p => p.source_url && (p.source_url.includes('#p') || p.source_url.includes('paraId')));
  console.log(`\nLink coverage: ${withUrl.length}/${allPassages.length} have source_url (${Math.round(withUrl.length/allPassages.length*100)}%)`);
  console.log(`Anchor coverage: ${withAnchor.length}/${withUrl.length} have para anchors (${withUrl.length > 0 ? Math.round(withAnchor.length/withUrl.length*100) : 0}%)`);

  // Sample links for manual verification
  console.log('\nSample links for verification:');
  for (const p of allPassages.filter(p => p.source_url).slice(0, 6)) {
    console.log(`  [${p.religion||'?'}] ${(p.source_url||'').substring(0, 100)}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
