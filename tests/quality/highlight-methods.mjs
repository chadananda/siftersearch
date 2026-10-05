#!/usr/bin/env node
// Experiment (runs on tower: System-1 router, Gemini key): alternative ORIGINAL-side highlight methods over the cases saved by
// score-sourcehunt-highlight.mjs, written back into the same file under methods.<name> for that scorer.
//   span-vote — the quote is ONE contiguous run, so ask two choice questions (start clause, end clause) instead of a yes/no per
//               clause; Clef + Clef-flash vote, Jev breaks a disagreement.
//   windows   — every run of 1..MAXW consecutive clauses embedded (Gemini, the phrase index's model); the closest run wins.
//   node tests/quality/highlight-methods.mjs --in=planning/x.json [--methods=span-vote,windows] [--limit=N]
import { readFileSync, writeFileSync } from 'fs';
import { segment } from '../../api/lib/phrases.js';
import { ask } from '../../api/lib/systemone.js';

const args = process.argv.slice(2);
const arg = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const IN = arg('in'), METHODS = (arg('methods') || 'span-vote,windows').split(',');
const MODEL = 'gemini-embedding-2', DIMS = 3072, MAXW = Number(arg('maxw') || 12), MAXC = 40;

async function embed(texts, query = false) {
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    const body = { requests: texts.slice(i, i + 100).map((t) => ({ model: `models/${MODEL}`, outputDimensionality: DIMS,
      content: { parts: [{ text: query ? `task: search result | query: ${t}` : `title: none | text: ${t}` }] } })) };
    for (let a = 0; ; a++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents?key=${process.env.GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
      if (r.ok) { out.push(...(await r.json()).embeddings.map((e) => e.values)); break; }
      if (a > 6) throw new Error(`gemini ${r.status}`);
      await new Promise((res) => setTimeout(res, 2000 * 2 ** a));
    }
  }
  return out;
}
const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y); };

export async function windowsMethod(quote, text, units) {
  const spans = [];
  for (let i = 0; i < units.length; i++) for (let w = 1; w <= MAXW && i + w <= units.length; w++) spans.push([i, i + w - 1]);
  const [q] = await embed([quote], true);
  const vs = await embed(spans.map(([a, b]) => text.slice(units[a].start, units[b].end)));
  let best = 0; vs.forEach((v, k) => { if (cos(q, v) > cos(q, vs[best])) best = k; });
  const [a, b] = spans[best];
  return { highlight: [[units[a].start, units[b].end]], span: [a, b] };
}

export async function spanVoteMethod(quote, text, units) {
  const clause = (u) => text.slice(u.start, u.end);
  const state = `QUOTATION (English):\n${quote}\n\nPASSAGE (Arabic/Persian) — numbered clauses:\n` + units.map((u, i) => `[c${i + 1}] ${clause(u)}`).join('\n');
  const criteria = Object.fromEntries(units.map((u, i) => [`c${i + 1}`, clause(u).slice(0, 80)]));
  const questions = {
    start: { type: 'choice', criteria, instructions: 'The quotation is a translation of ONE continuous stretch of this passage. In which clause does that stretch BEGIN?' },
    end: { type: 'choice', criteria, instructions: 'The quotation is a translation of ONE continuous stretch of this passage. In which clause does that stretch END (the last clause it includes)?' },
  };
  const one = (backend) => ask('sourcehunt-span', state, questions, { timeoutMs: 15000, retries: 0, backend }).then((r) => r?.answers || null).catch(() => null);
  const idx = (ans, k) => { const c = ans?.[k]?.choice ?? ans?.[k]?.value ?? ans?.[k]; const m = /c(\d+)/.exec(String(c || '')); return m ? Number(m[1]) - 1 : null; };
  const [big, flash] = await Promise.all([one('clef'), one('clef-flash')]);
  let s = [idx(big, 'start'), idx(flash, 'start')], e = [idx(big, 'end'), idx(flash, 'end')];
  if (s[0] !== s[1] || e[0] !== e[1]) {
    const jev = await one('jev');
    const maj = (xs, j) => { const all = [...xs, j].filter((x) => x != null); return all.find((x) => all.filter((y) => y === x).length >= 2) ?? j ?? all[0] ?? null; };
    s = [maj(s, idx(jev, 'start'))]; e = [maj(e, idx(jev, 'end'))];
  }
  let a = s[0], b = e[0];
  if (a == null && b == null) return { highlight: [], span: null };
  a ??= b; b ??= a; if (a > b) [a, b] = [b, a];
  return { highlight: [[units[a].start, units[b].end]], span: [a, b] };
}

const data = JSON.parse(readFileSync(IN, 'utf8'));
const cases = arg('limit') ? data.cases.slice(0, Number(arg('limit'))) : data.cases;
let done = 0;
for (let i = 0; i < cases.length; i += 4) {
  await Promise.all(cases.slice(i, i + 4).map(async (c) => {
    let units = segment(c.text, c.lang);
    if (units.length > MAXC) {   // centre a window of clauses on the live highlight (the experiment's only concession to length)
      const at = c.methods.live.highlight[0]?.[0] ?? 0, k = Math.max(0, units.findIndex((u) => u.end > at));
      const from = Math.max(0, Math.min(units.length - MAXC, k - (MAXC >> 1))); units = units.slice(from, from + MAXC);
    }
    for (const m of METHODS) {
      const t0 = Date.now();
      try { c.methods[m] = { ...(await (m === 'windows' ? windowsMethod : spanVoteMethod)(c.query, c.text, units)), ms: Date.now() - t0, clauses: units.length }; }
      catch (e) { c.methods[m] = { highlight: [], error: e.message.slice(0, 100) }; }
    }
    done++;
  }));
  process.stderr.write(`\r${done}/${cases.length}`);
}
writeFileSync(IN, JSON.stringify(data, null, 1));
console.log('\nwritten', IN);
