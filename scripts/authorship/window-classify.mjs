#!/usr/bin/env node
// Windowed paragraph attribution — EVALUATION (runs ON tower; writes nothing to sifter.db). Runs the shared engine
// (window-core.mjs; defaults = v10: hybrid, one pass, LLM only to name "another person", one LLM brief per book) and scores
// it against hand-labelled gold (speaker + quotes) or the official bahai.org edition, beside the current reader.
//   node scripts/authorship/window-classify.mjs <out-dir> <docId> …            (official-edition check)
//   node scripts/authorship/window-classify.mjs <out-dir> --gold <gold.json>    (only the labelled stretch ±10)
//   switches: [--min 0] [--step 10] [--passes 1] [--backend jev|clef|clef-flash] [--no-hybrid] [--no-brief]
//   Iterations and results: planning/window-classifier-log.md. Production run: window-run.mjs.
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getDoc } from '../../api/lib/docs-repo.js';
import { canonical } from '../../api/lib/authorship/window.js';
import { createClassifier, loadRows } from './window-core.mjs';
import { OFFICIAL, blocks, officialAuthors, textKey } from './official-sections.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
const { ask } = await import('../../api/lib/systemone.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const VALUED = ['--min', '--step', '--passes', '--gold', '--backend'];
const args = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !VALUED.includes(all[i - 1]));
const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const [OUT, ...IDS] = args;
const MIN = Number(opt('--min', 0)), STEP = Number(opt('--step', 10)), PASSES = Number(opt('--passes', 1)), BACKEND = opt('--backend', null);
const GOLD = opt('--gold', null) ? JSON.parse(readFileSync(opt('--gold'), 'utf-8')).items : null;
const { classify, cost } = createClassifier({ ask, chatCompletion, min: MIN, step: STEP, backend: BACKEND,
  hybrid: !process.argv.includes('--no-hybrid'), brief: !process.argv.includes('--no-brief') });
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });
mkdirSync(OUT, { recursive: true });

async function officialMap(docId) {
  const slug = OFFICIAL[docId]; if (!slug) return null;
  const get = async (u) => (await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (SifterSearch authorship check)' } })).text();
  const base = 'https://www.bahai.org/library/authoritative-texts/compilations';
  const x = (await get(`${base}/${slug}/`)).match(new RegExp(`/library/authoritative-texts/compilations/${slug}/[^"']+\\.xhtml[^"']*`));
  return x ? officialAuthors(blocks(await get(`https://www.bahai.org${x[0]}`))) : null;
}

const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘ʼ`'-]/g, '').toLowerCase();
const isAuthor = (pred, author) => { const a = fold(author).split(/\s+/)[0], p = fold(pred); return !!p && !!a && (p.includes(a) || a.includes(p.split(/\s+/)[0])); };
const nfc = (x) => String(x || '').normalize('NFC');
function speakerOk(pred, g, author) {
  if (g.startsWith('!')) return !!pred && !new RegExp(nfc(g.slice(1)), 'i').test(nfc(pred)) && !isAuthor(pred, author);   // someone other than…
  if (g === '@author') return isAuthor(pred, author);
  if (g.startsWith('@author|')) return isAuthor(pred, author) || new RegExp(nfc(g.slice(8)), 'i').test(nfc(pred));
  return new RegExp(nfc(g), 'i').test(nfc(pred));
}
function quotesOk(q, g, base) {
  const named = g.filter((x) => x);
  if (!named.length) return q == null;
  if (g[0] === null && q == null) return true;
  if (q == null) return false;
  return named.some((re) => (re === '*' ? !base.includes(q) : new RegExp(nfc(re), 'i').test(nfc(q))));
}
const docs = GOLD ? [...new Set(GOLD.map((g) => g.doc))] : IDS.map(Number);
const summary = [];
const t0 = Date.now();
for (const id of docs) {
  const d = await getDoc(id, { follow: false, fields: ['id', 'title', 'author', 'religion'] });
  // the full heading path (chapter › section › extract number) when the ingest kept it, else the innermost heading
  const rows0 = loadRows(db, id);
  let rows = rows0;
  const gold = GOLD ? new Map(GOLD.filter((g) => g.doc === id).map((g) => [g.pidx, g])) : null;
  if (gold) { const ps = [...gold.keys()]; const lo = Math.min(...ps) - 10, hi = Math.max(...ps) + 10; rows = rows.filter((r) => r.pidx >= lo && r.pidx <= hi); }
  const book = { title: d.title, author: d.author, religion: d.religion };
  const { roster, base, brief, p1, labels: p2 } = await classify(book, rows0, { rows, passes: PASSES });
  if (brief) writeFileSync(join(OUT, `${id}.brief.json`), JSON.stringify(brief, null, 1));
  const official = gold ? null : await officialMap(id);
  const s = { id, title: d.title.slice(0, 45), paras: rows.length, roster: roster.length, judged: 0, window_ok: 0, reader_ok: 0,
    agree_passes: 0, llm_fixed: p2.filter((l) => l.via === 'llm').length, g_n: 0, g_speaker: 0, g_quotes: 0, g_detect: 0, g_detect_n: 0, g_reader_speaker: 0 };
  const out = rows.map((r, i) => {
    const reader = (JSON.parse(r.authors || '[]').find((e) => e.role === 'author') || {}).name || null;
    const truth = official?.get(textKey(r.text))?.name || null;
    if (p1[i].speaker === p2[i].speaker) s.agree_passes++;
    if (truth) { s.judged++; if (canonical(p2[i].speaker) === truth) s.window_ok++; if (reader === truth) s.reader_ok++; }
    const g = gold?.get(r.pidx);
    if (g) {
      s.g_n++; s.g_detect_n++;
      if (speakerOk(p2[i].speaker, g.speaker, d.author)) s.g_speaker++;
      if (speakerOk(reader, g.speaker, d.author)) s.g_reader_speaker++;
      if (quotesOk(p2[i].quotes, g.quotes, base)) s.g_quotes++;
      if (g.quotes[0] === null) s.g_detect_n--;   // optional quote: detection not judged
      else if ((p2[i].quotes != null) === g.quotes.some((x) => x)) s.g_detect++;
    }
    return { id: r.id, pidx: r.pidx, speaker: p2[i].speaker, quotes: p2[i].quotes, conf: +p2[i].conf.toFixed(2), via: p2[i].via || 's1', pass1: p1[i].speaker, reader, official: truth, gold: g || null, text: r.text.slice(0, 120) };
  });
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify({ ...s, roster, paragraphs: out }, null, 1));
  summary.push(s);
  console.log(JSON.stringify({ ...s, cost }));
}
const keys = ['judged', 'window_ok', 'reader_ok', 'g_n', 'g_speaker', 'g_reader_speaker', 'g_quotes', 'g_detect', 'g_detect_n'];
const t = Object.fromEntries(keys.map((k) => [k, summary.reduce((a, s) => a + s[k], 0)]));
console.log(JSON.stringify({ total: t, cost, opts: { MIN, STEP, PASSES, BACKEND }, seconds: Math.round((Date.now() - t0) / 1000) }));
process.exit(0);
