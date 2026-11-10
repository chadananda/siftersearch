#!/usr/bin/env node
// Community question list: what adherents look up (topic lookups, not outsiders' "what is X?"). Google autocomplete over insider
// prefixes × a-z → topic = the completion after the prefix → ranked by how many prefixes surface it (+ rank) → top N as questions, appended to <tradition>.json as <id>-cNNN (list: 'community').
//   node community.mjs [--tradition bahai] [--top 100]   free, ≤2 req/s, cached in tmp/question-bank/raw (resumable). No LLM.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const RAW = 'tmp/question-bank/raw/google', OUT = 'tests/quality/question-bank', TOP = Number(arg('top') || 100);
// prefix → kind; the kind phrases the question (writings: "what do the Writings say about T", prayer: "a prayer for T")
const PREFIXES = {
  bahai: {
    writings: ['bahai quotes on', 'bahai quotes about', 'bahai writings on', 'bahai teachings on', 'bahai perspective on', 'bahai view on', "baha'u'llah quotes on", 'bahaullah on', 'what did bahaullah say about', 'abdul baha quotes on', 'abdul baha on', 'what did abdul baha say about', 'shoghi effendi on', 'hidden words on', 'universal house of justice on', 'bahai deepening on'],
    prayer: ['bahai prayer for', 'bahai prayers for'],
  },
};
const ASK = { bahai: { writings: (t) => `What do the Bahá'í Writings say about ${t}?`, prayer: (t) => `Is there a Bahá'í prayer for ${t}?` } };
const JUNK = /\b(pdf|pdfs|images?|pictures?|wallpaper|printable|tattoo|instagram|quotes?|book|books|song|songs|music|meaning|in hindi|in spanish|in persian|in farsi|in arabic|for kids|for children's class|app|youtube|mp3|audio|calligraphy|card|cards)$/;
const norm = (s) => s.toLowerCase().replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').trim();
const cachePath = (p) => `${RAW}/${createHash('sha1').update(p).digest('hex').slice(0, 16)}.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0, fetched = 0;
async function suggest(p) {
  const f = cachePath(p);
  if (existsSync(f)) try { return JSON.parse(readFileSync(f, 'utf8')).list; } catch {}
  for (let a = 0; a < 4; a++) {
    await sleep(Math.max(0, 500 - (Date.now() - last))); last = Date.now();
    try {
      const r = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(p)}`, { signal: AbortSignal.timeout(10000) });
      if (r.status === 429 || r.status >= 500) { await sleep(5000 * (a + 1)); continue; }
      if (!r.ok) throw new Error(`http ${r.status}`);
      const list = (await r.json())[1] || []; fetched++;
      mkdirSync(RAW, { recursive: true }); writeFileSync(f, JSON.stringify({ prefix: p, list }));
      return list;
    } catch (e) { if (a === 3) { console.error(`  ! "${p}": ${e.message}`); return []; } await sleep(2000); }
  }
  return [];
}
for (const [id, kinds] of Object.entries(PREFIXES)) {
  if (arg('tradition') && !arg('tradition').split(',').includes(id)) continue;
  const topics = new Map();   // kind|topic → { score, prefixes:Set, seen:Set }
  for (const [kind, list] of Object.entries(kinds)) for (const base of list) for (const c of ['', ...'abcdefghijklmnopqrstuvwxyz']) {
    const p = c ? `${base} ${c}` : base;
    (await suggest(p)).forEach((raw, i) => {
      const q = norm(raw); if (!q.startsWith(base + ' ')) return;
      const t = q.slice(base.length + 1).replace(/^(the|a|an) /, '').trim();
      if (!t || t.split(' ').length > 5 || JUNK.test(t) || /instagram|not working|login/.test(t)) return;
      const k = `${kind}|${t}`, h = topics.get(k) || { kind, t, score: 0, prefixes: new Set(), seen: new Set() };
      h.score += (10 - Math.min(i, 9)) / 10; h.prefixes.add(base); h.seen.add(q); topics.set(k, h);
    });
  }
  // a topic surfaced under several insider prefixes is a common need: breadth first, then rank
  const ranked = [...topics.values()].map((h) => ({ ...h, rank: h.prefixes.size * 3 + h.score })).sort((a, b) => b.rank - a.rank);
  const out = [], keys = new Set();
  for (const h of ranked) {
    // one need, many wordings: 'fast'/'fasting', 'decision making'/'making decisions', 'assistance'/'aid and assistance'
    const toks = h.t.split(' ').filter((w) => !/^(and|of|the|for|a|aid)$/.test(w)).map((w) => w.replace(/(ing|s)$/, '')).sort();
    const key = toks.join(' ');
    if (keys.has(key)) continue; keys.add(key);
    out.push({ id: `${id}-c${String(out.length + 1).padStart(3, '0')}`, q: ASK[id][h.kind](h.t), topic: h.t, kind: h.kind, prefixes: h.prefixes.size, score: +h.rank.toFixed(2), searches: [...h.seen].slice(0, 6), held_out: out.length % 5 === 4 });
    if (out.length >= TOP) break;
  }
  // same file as the public list (every consumer — run.mjs, hype-bank-seed, precache — reads <tradition>.json): replace the c-ids, keep the rest
  const f = `${OUT}/${id}.json`, bank = JSON.parse(readFileSync(f, 'utf8'));
  bank.questions = [...bank.questions.filter((q) => q.list !== 'community'), ...out.map((q) => ({ ...q, list: 'community' }))];
  bank.community = { harvested: new Date().toISOString().slice(0, 10), candidates: ranked.length, method: 'insider-prefix autocomplete (community.mjs)' };
  writeFileSync(f, JSON.stringify(bank, null, 1) + '\n');
  console.log(`${id}: ${ranked.length} topics → top ${out.length}; fetched ${fetched}`);
}
