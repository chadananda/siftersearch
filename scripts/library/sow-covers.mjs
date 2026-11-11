#!/usr/bin/env node
// Star of the West covers: each issue doc gets its own page 1 scan from bahai-education.org (the only complete SoW
// scans); docs for the magazine as a whole get --whole <image> (Chad's cleaned v1 no1 page 1). Internal-API client: lists docs via
// /api/library/documents?search, sets covers via POST /api/covers/:docId { image }.
// Dry run by default.   node scripts/library/sow-covers.mjs --whole <png> [--replace] [--apply]
// Env: SIFTER_API (default https://api.siftersearch.com), DEPLOY_SECRET (X-Internal-Key, from .env-secrets).
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { apiBase } from '../lib/api-base.mjs';
import { sowIssue } from '../../api/lib/sow-links.js';

dotenv.config({ path: '.env-secrets', quiet: true });
const API = apiBase(), APPLY = process.argv.includes('--apply'), REPLACE = process.argv.includes('--replace');
const headers = { 'Content-Type': 'application/json', 'User-Agent': 'sifter-sow-covers', 'X-Internal-Key': process.env.DEPLOY_SECRET || '' };
// The magazine as a whole ("Star of the West", "… - Selected Content from Volumes I & II"), not a piece about it (": Use of, …").
const WHOLE = /^(the )?star of the west\b(?!, v\d)(?!:\s*use\b)/i;
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const wholeImage = arg('--whole') ? readFileSync(arg('--whole')).toString('base64') : null;

// The search stops at 250 hits; one search per volume reaches every doc.
const docs = new Map();
for (const q of ['Star of the West', ...Array.from({ length: 25 }, (_, i) => `Star of the West, v${i + 1},`)]) {
  for (let offset = 0; offset < 250; offset += 200) {
    const r = await fetch(`${API}/api/library/documents?${new URLSearchParams({ search: q, limit: '200', offset: String(offset) })}`, { headers, signal: AbortSignal.timeout(60000) });
    const page = (await r.json()).documents || [];
    for (const d of page) docs.set(d.id, d);
    if (page.length < 200) break;
  }
}
let set = 0, skipped = 0, failed = 0;
for (const d of docs.values()) {
  if (sowIssue(d) || !WHOLE.test(d.title || '') || !wholeImage) continue;
  if (d.cover_url && !REPLACE) { skipped++; continue; }
  const url = `--whole ${arg('--whole')}`;
  if (!APPLY) { console.log(`would set ${d.id} "${d.title}" ← ${url}`); set++; continue; }
  const res = await fetch(`${API}/api/covers/${d.id}`, { method: 'POST', headers, signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ image: wholeImage, source: 'Chad: Star of the West v1 no1 page 1 (Bahai News, 1910)', rights: 'public domain (published 1910)' }) });
  if (res.ok) set++; else { failed++; console.log(`FAIL ${d.id} ${res.status} ${(await res.text()).slice(0, 200)}`); }
}
console.log(`${APPLY ? 'set' : 'would set'} ${set}, had a cover ${skipped}, failed ${failed} (of ${docs.size} search hits)`);
