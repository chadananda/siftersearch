#!/usr/bin/env node
// Windowed paragraph attribution, PILOT (runs ON tower; writes nothing to sifter.db). Per book: pass 1 walks the book in
// windows (5 decided + 10 to decide + 5 ahead; api/lib/authorship/window.js), System-1 task 'paragraph-speaker-window'
// (logged → Laya training, Clef shadowed); "another person" / low confidence → deepseek-v4-flash on the same window, new
// names join the roster. Pass 2 re-reads with the final roster; a target the passes disagree on goes to the LLM. Each book
// is scored against the official bahai.org edition (where official-sections.mjs maps one) and against the current reader.
//   node scripts/authorship/window-classify.mjs <out-dir> <docId> … [--min 0.7] [--step 10] [--passes 2]
//   … <out-dir> --gold planning/authorship-gold-20261008.json   (hand-labelled speaker + quotes; only the labelled stretch ±10)
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getDoc } from '../../api/lib/docs-repo.js';
import { initialRoster, windowState, windowQuestions, parseAnswers, needsEscalation, escalationPrompt, parseEscalation, canonical, OTHER } from '../../api/lib/authorship/window.js';
import { OFFICIAL, blocks, officialAuthors, textKey } from './official-sections.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
const { ask } = await import('../../api/lib/systemone.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const VALUED = ['--min', '--step', '--passes', '--gold'];
const args = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !VALUED.includes(all[i - 1]));
const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const [OUT, ...IDS] = args;
const MIN = Number(opt('--min', 0.7)), STEP = Number(opt('--step', 10)), PASSES = Number(opt('--passes', 2));
const GOLD = opt('--gold', null) ? JSON.parse((await import('fs')).readFileSync(opt('--gold'), 'utf-8')).items : null;
const TASK = 'paragraph-speaker-window', BACK = 5, AHEAD = 5;
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });
mkdirSync(OUT, { recursive: true });

const cost = { calls: 0, tokens: 0, llm: 0, llm_tokens: 0 };
async function escalate(state, flagged, roster) {
  const r = await chatCompletion([{ role: 'user', content: escalationPrompt(state, flagged) }],
    { provider: 'deepseek', model: 'deepseek-v4-flash', temperature: 0, maxTokens: 60 * flagged.length + 40, thinking: false, caller: 'authorship-window' });
  cost.llm++; cost.llm_tokens += (r?.usage?.total_tokens || 0);
  return parseEscalation(r?.content ?? r, flagged, roster);
}

async function pass(book, rows, roster, prior) {
  const labels = new Array(rows.length).fill(null);
  for (let i0 = 0; i0 < rows.length; i0 += STEP) {
    const targets = rows.slice(i0, i0 + STEP);
    const anchors = rows.slice(Math.max(0, i0 - BACK), i0).map((p, k) => ({ ...p, label: labels[Math.max(0, i0 - BACK) + k] || {} }));
    const ahead = rows.slice(i0 + STEP, i0 + STEP + AHEAD);
    const state = windowState({ book, roster, anchors, targets, ahead });
    const r = await ask(TASK, state, windowQuestions(roster, targets.length, book), { ref: targets[0].id, timeoutMs: 40000 });
    cost.calls++; cost.tokens += r.tokens || 0;
    const got = parseAnswers(r.answers, targets.length);
    // escalate: unnamed / unsure, and in pass 2 anything that disagrees with pass 1
    const flagged = got.map((l, k) => (needsEscalation(l, MIN) || (prior && prior[i0 + k] && prior[i0 + k].speaker !== l.speaker) ? k : -1)).filter((k) => k >= 0);
    if (flagged.length) {
      const fix = await escalate(state, flagged, roster);
      for (const [k, v] of Object.entries(fix)) {
        got[k] = { ...got[k], ...v, via: 'llm' };
        for (const n of [v.speaker, v.quotes]) if (n && !roster.includes(n) && n !== OTHER) roster.push(n);   // grows going forward
      }
    }
    got.forEach((l, k) => { labels[i0 + k] = l; });
  }
  return labels;
}

async function officialMap(docId) {
  const slug = OFFICIAL[docId]; if (!slug) return null;
  const get = async (u) => (await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (SifterSearch authorship check)' } })).text();
  const base = 'https://www.bahai.org/library/authoritative-texts/compilations';
  const x = (await get(`${base}/${slug}/`)).match(new RegExp(`/library/authoritative-texts/compilations/${slug}/[^"']+\\.xhtml[^"']*`));
  return x ? officialAuthors(blocks(await get(`https://www.bahai.org${x[0]}`))) : null;
}

const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘ʼ`'-]/g, '').toLowerCase();
const isAuthor = (pred, author) => { const a = fold(author).split(/\s+/)[0], p = fold(pred); return !!p && !!a && (p.includes(a) || a.includes(p.split(/\s+/)[0])); };
const speakerOk = (pred, g, author) => (g === '@author' ? isAuthor(pred, author) : new RegExp(g, 'i').test(pred || ''));
function quotesOk(q, g, base) {
  const named = g.filter((x) => x);
  if (!named.length) return q == null;
  if (g[0] === null && q == null) return true;
  if (q == null) return false;
  return named.some((re) => (re === '*' ? !base.includes(q) : new RegExp(re, 'i').test(q)));
}
const docs = GOLD ? [...new Set(GOLD.map((g) => g.doc))] : IDS.map(Number);
const summary = [];
const t0 = Date.now();
for (const id of docs) {
  const d = await getDoc(id, { follow: false, fields: ['id', 'title', 'author', 'religion'] });
  // the full heading path (chapter › section › extract number) when the ingest kept it, else the innermost heading
  let rows = db.prepare('SELECT id, paragraph_index pidx, text, heading, block_attrs, authors FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index').all(id)
    .map((r) => { const path = r.block_attrs ? JSON.parse(r.block_attrs).path : null; return { ...r, heading: path?.length ? path.join(' › ') : r.heading }; });
  const gold = GOLD ? new Map(GOLD.filter((g) => g.doc === id).map((g) => [g.pidx, g])) : null;
  if (gold) { const ps = [...gold.keys()]; const lo = Math.min(...ps) - 10, hi = Math.max(...ps) + 10; rows = rows.filter((r) => r.pidx >= lo && r.pidx <= hi); }
  const book = { title: d.title, author: d.author, religion: d.religion };
  const roster = initialRoster(book), base = [...roster];
  const p1 = await pass(book, rows, roster, null);
  const p2 = PASSES > 1 ? await pass(book, rows, roster, p1) : p1;
  const official = gold ? null : await officialMap(id);
  const s = { id, title: d.title.slice(0, 45), paras: rows.length, roster: roster.length, judged: 0, window_ok: 0, reader_ok: 0,
    agree_passes: 0, llm_fixed: p2.filter((l) => l.via === 'llm').length, g_n: 0, g_speaker: 0, g_quotes: 0, g_detect: 0, g_reader_speaker: 0 };
  const out = rows.map((r, i) => {
    const reader = (JSON.parse(r.authors || '[]').find((e) => e.role === 'author') || {}).name || null;
    const truth = official?.get(textKey(r.text))?.name || null;
    if (p1[i].speaker === p2[i].speaker) s.agree_passes++;
    if (truth) { s.judged++; if (canonical(p2[i].speaker) === truth) s.window_ok++; if (reader === truth) s.reader_ok++; }
    const g = gold?.get(r.pidx);
    if (g) {
      s.g_n++;
      if (speakerOk(p2[i].speaker, g.speaker, d.author)) s.g_speaker++;
      if (speakerOk(reader, g.speaker, d.author)) s.g_reader_speaker++;
      if (quotesOk(p2[i].quotes, g.quotes, base)) s.g_quotes++;
      if ((p2[i].quotes != null) === g.quotes.some((x) => x)) s.g_detect++;
    }
    return { id: r.id, pidx: r.pidx, speaker: p2[i].speaker, quotes: p2[i].quotes, conf: +p2[i].conf.toFixed(2), via: p2[i].via || 's1', pass1: p1[i].speaker, reader, official: truth, gold: g || null, text: r.text.slice(0, 120) };
  });
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify({ ...s, roster, paragraphs: out }, null, 1));
  summary.push(s);
  console.log(JSON.stringify({ ...s, cost }));
}
const keys = ['judged', 'window_ok', 'reader_ok', 'g_n', 'g_speaker', 'g_reader_speaker', 'g_quotes', 'g_detect'];
const t = Object.fromEntries(keys.map((k) => [k, summary.reduce((a, s) => a + s[k], 0)]));
console.log(JSON.stringify({ total: t, cost, opts: { MIN, STEP, PASSES }, seconds: Math.round((Date.now() - t0) / 1000) }));
process.exit(0);
