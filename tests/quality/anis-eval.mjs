#!/usr/bin/env node
// Frozen Anís eval set (anis-eval-set.json) scored by CODE ONLY (forensicPass + each item's expect fields); no LLM judge, no Opus.
//   node tests/quality/anis-eval.mjs [--dry] [--from-threads [--days N]] [--split tune|held] [--class a,b] [--only id,id] [--limit N] [--concurrency 2] [--no-write]
// Prints per-class pass rate for tune and held apart; appends one line to anis-eval-history.json. API_BASE default http://tower-nas:7839;
// needs INTERNAL_API_KEY (draft) + DEPLOY_SECRET (thread route/meta). Live replies spend the anis cap: use --limit. Pure scorer: scoreItem/rollup.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { forensicPass, FIX_WHERE, copyClass, routeOf } from '../../api/lib/audit/forensics.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[‘’ʼʻʾʿ`']/g, '').replace(/[-–—_/]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const TIER_CLASSES = { writings: ['se-translation', 'writing', 'compilation'], guardian: ['quoted-authoritative'] };

const d0 = (run) => run.detail?.route ?? run.route ?? null;

/** run → forensic turn. The stored thread round (run.detail = GET /api/admin/anis/threads/:id round.reply) already carries
 *  searches / writer_passages / cited in the forensic shape; meta.path.evidence is the fallback for an older reply. */
export function turnOf(item, run = {}) {
  // the stored round's route is an object (gate, strategy, plan…): its route name is the recipe or plan shape, as improve.js reads it
  const r0 = d0(run), d = run.detail || {}, route = typeof r0 === 'object' && r0 ? (r0.recipe || r0.plan?.shape || r0.strategy || null) : r0;
  if (d.searches || d.writer_passages || d.cited) {
    return { route, question: item.question, reply: run.reply || d.text || '', searches: d.searches || [], writer_passages: d.writer_passages || [], cited: d.cited || [] };
  }
  const m = run.meta || {}, p = m.path || m, ev = (p.evidence || m.evidence || []).map((e, i) => ({ rank: i + 1, doc_id: e.doc_id ?? e.docId ?? null, title: e.title, author: e.author, language: e.language || e.lang, text: e.text, url: e.url, tier: e.tier }));
  const urls = new Set((String(run.reply || '').match(/\]\((https?:[^)\s]+)\)/g) || []).map((x) => x.slice(2, -1)));
  const searches = (m.searches || p.searches || []).length ? (m.searches || p.searches) : (ev.length ? [{ trace_id: null, tool: p.recipe || 'retrieval', query: item.question, filters: {}, hits: ev }] : []);
  return { route: route || p.recipe || p.plan?.shape || null, question: item.question, reply: run.reply || '', searches, writer_passages: ev,
    cited: ev.filter((e) => e.url && urls.has(e.url)).map((e) => ({ doc_id: e.doc_id, title: e.title })), research: p.plan?.research };
}

/** One item + one run ({ reply, route, ms, error?, turn? }) → { id, class, split, pass, checks: [{ name, ok: true|false|null, detail? }], other_defects: [class] }. Pure. */
export function scoreItem(item, run = {}) {
  const base = { id: item.id, class: item.class, split: item.split };
  if (run.error || !String(run.reply || '').trim()) return { ...base, pass: false, checks: [{ name: 'reply', ok: false, detail: run.error || 'empty reply' }], other_defects: [] };
  const turn = run.turn || turnOf(item, run), f = forensicPass({ ...turn, route: turn.route || run.route, question: item.question, reply: run.reply });
  const checks = [], x = item.expect || {}, mine = f.defects.filter((d) => d.class === item.class);
  // the class check: forensic classes must be ABSENT; judge-only classes (no forensic rule) rely on the expect fields below
  if (FIX_WHERE[item.class]) checks.push({ name: `no-${item.class}`, ok: !mine.length, detail: mine[0]?.detail });
  const known = [...(turn.cited || []), ...(turn.writer_passages || [])];
  if (x.route) checks.push({ name: 'route', ok: routeOf(f.route) === x.route, detail: f.route });
  if (x.max_ms) checks.push({ name: 'max_ms', ok: run.ms == null ? null : run.ms <= x.max_ms, detail: run.ms });
  if (x.max_words) { const n = String(run.reply).split(/\s+/).filter(Boolean).length; checks.push({ name: 'max_words', ok: n <= x.max_words, detail: n }); }
  if (x.title_like) { const re = new RegExp(x.title_like, 'i'); checks.push({ name: 'title_like', ok: re.test(fold(run.reply)) || known.some((h) => re.test(fold(h.title))) }); }
  if (x.doc_ids) checks.push({ name: 'doc_ids', ok: known.length ? known.some((h) => x.doc_ids.map(String).includes(String(h.doc_id))) : null });
  if (x.tier_first) {
    const first = (turn.cited?.length ? turn.cited : []).map((c) => (c.doc_id != null && known.find((h) => String(h.doc_id) === String(c.doc_id))) || c)[0];
    const tier = first && (first.tier || copyClass(first));
    checks.push({ name: 'tier_first', ok: first ? tier === x.tier_first || (TIER_CLASSES[x.tier_first] || []).includes(tier) : null, detail: tier });
  }
  return { ...base, pass: checks.every((c) => c.ok !== false), unchecked: checks.filter((c) => c.ok === null).length, checks, other_defects: [...new Set(f.defects.filter((d) => d.class !== item.class).map((d) => d.class))] };
}

/** scored items → { tune: { class: { n, pass, rate } }, held: {…}, total } */
export function rollup(scored = []) {
  const out = { tune: {}, held: {} };
  for (const s of scored) { const c = (out[s.split] ||= {})[s.class] ||= { n: 0, pass: 0 }; c.n++; if (s.pass) c.pass++; }
  for (const sp of Object.values(out)) for (const c of Object.values(sp)) c.rate = c.n ? +(c.pass / c.n).toFixed(2) : null;
  const tot = (sp) => { const v = Object.values(out[sp]); const n = v.reduce((a, c) => a + c.n, 0); return { n, pass: v.reduce((a, c) => a + c.pass, 0), rate: n ? +(v.reduce((a, c) => a + c.pass, 0) / n).toFixed(2) : null }; };
  return { ...out, total: { tune: tot('tune'), held: tot('held') } };
}

/** item + stored thread (GET /api/admin/anis/threads/:id) → run: the latest round that asked this item's question. Pure. */
export function runFromRound(item, thread, { reply = null, ms = null } = {}) {
  const rp = (thread?.rounds || []).filter((r) => r.reply && String(r.question?.text || '').trim() === item.question.trim()).at(-1)?.reply || null;
  return { reply: reply ?? rp?.text ?? null, route: rp?.route ?? null, meta: rp?.meta ?? null, detail: rp, usd: rp?.meta?.usd ?? null, ms: ms ?? rp?.meta?.latency_ms ?? null };
}

// ---- CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; }, has = (k) => process.argv.includes(`--${k}`), list = (k) => arg(k)?.split(',').filter(Boolean);
  const { items: all } = JSON.parse(readFileSync(join(DIR, 'anis-eval-set.json'), 'utf8'));
  let items = all;
  if (arg('split')) items = items.filter((i) => i.split === arg('split'));
  if (list('class')) items = items.filter((i) => list('class').includes(i.class));
  if (list('only')) items = items.filter((i) => list('only').includes(i.id));
  if (arg('limit')) items = items.slice(0, Number(arg('limit')));
  if (has('dry')) {
    const by = {}; for (const i of items) (by[`${i.class} ${i.split}`] ||= []).push(i.id);
    for (const i of items) console.log(`${i.id.padEnd(28)} ${i.split.padEnd(4)} ${JSON.stringify(i.expect)}  ${i.question.slice(0, 70)}`);
    console.log(`\n${items.length} items · tune ${items.filter((i) => i.split === 'tune').length} · held ${items.filter((i) => i.split === 'held').length} · classes ${new Set(items.map((i) => i.class)).size}`);
    process.exit(0);
  }
  const dotenv = (await import('dotenv')).default; const ROOT = join(DIR, '..', '..');
  for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
  const API = process.env.API_BASE || 'http://tower-nas:7839', KEY = process.env.INTERNAL_API_KEY, ADMIN = process.env.DEPLOY_SECRET;
  if (!KEY || !ADMIN) { console.error('INTERNAL_API_KEY and DEPLOY_SECRET required'); process.exit(1); }
  const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
  const jfetch = async (url, o = {}) => { const r = await fetch(url, { signal: AbortSignal.timeout(40000), ...o }); return { r, j: await r.json().catch(() => ({})) }; };
  const RUN = Date.now().toString(36); let seq = 0;
  const thread = (id) => jfetch(`${API}/api/admin/anis/threads/${id}`, { headers: { 'X-Internal-Key': ADMIN } }).then((x) => x.j).catch(() => null);
  // --from-threads: score the eval conversations already stored (last day) — $0, no new replies. Each item's thread is found by its battery email.
  const stored = async (item) => {
    const list = (stored.list ||= await jfetch(`${API}/api/admin/anis/threads?days=${arg('days') || 1}`, { headers: { 'X-Internal-Key': ADMIN } }).then((x) => x.j?.threads || []));
    const t = list.filter((x) => x.person?.email === `battery+eval-${item.id}@siftersearch.com`).sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)))[0];
    return t ? runFromRound(item, await thread(t.id), {}) : { error: 'no stored thread' };
  };
  // one reply: draft job → poll → stored thread round (route + meta). Same endpoints as score-anis-wording.mjs.
  const ask = async (item) => {
    const t0 = Date.now(), job = `eval-${RUN}-${++seq}`, H = { 'content-type': 'application/json', 'X-Internal-Key': KEY };
    const messages = [...(item.history || []), { role: 'user', content: item.question }];
    try {
      const s = await jfetch(`${API}/api/v1/anis/draft`, { method: 'POST', headers: H, body: JSON.stringify({ messages, email: `battery+eval-${item.id}@siftersearch.com`, async: true, job }) });
      if (!s.r.ok) return { error: `start ${s.r.status}`, ms: Date.now() - t0 };
      for (;;) {
        await sleep(2500);
        const g = await jfetch(`${API}/api/v1/anis/draft/job/${job}`, { headers: H }).then((x) => x.j).catch(() => ({ status: 'poll-failed' }));
        if (g.status === 'done') {
          const res = g.result || {}, ms = Date.now() - t0;
          for (let k = 0; k < 4 && res.conversationId; k++) {
            if (k) await sleep(2500);
            const run = runFromRound(item, await thread(res.conversationId), { reply: res.reply, ms });
            if (run.detail || k === 3) return run;
          }
          return runFromRound(item, null, { reply: res.reply, ms });
        }
        if (['failed', 'lost'].includes(g.status)) return { error: `job ${g.status} ${g.error || ''}`, ms: Date.now() - t0 };
        if (Date.now() - t0 > 300000) return { error: 'timeout 5 min', ms: Date.now() - t0 };
      }
    } catch (e) { return { error: e.message, ms: Date.now() - t0 }; }
  };
  const scored = [], conc = Number(arg('concurrency') || 2), queue = [...items];
  await Promise.all(Array.from({ length: conc }, async () => { for (let it; (it = queue.shift());) { const run = has('from-threads') ? await stored(it) : await ask(it); if (run.error === 'no stored thread') continue; const s = { ...scoreItem(it, run), usd: run.usd ?? null }; scored.push(s);
    console.log(`${s.pass ? 'PASS' : 'FAIL'} ${s.id} $${s.usd ?? '?'} ${s.checks.map((c) => `${c.ok === false ? '✗' : c.ok === null ? '?' : '✓'}${c.name}${c.ok === false && c.detail != null ? `:${c.detail}` : ''}`).join(' ')}`); } }));
  const r = rollup(scored), usd = +scored.reduce((a, x) => a + (x.usd || 0), 0).toFixed(4), unchecked = scored.reduce((a, x) => a + (x.unchecked || 0), 0);
  console.log(`\ncost $${usd} (${scored.filter((x) => x.usd == null).length} replies without a cost) · ${unchecked} unchecked check(s)`);
  for (const sp of ['tune', 'held']) { console.log(`\n${sp}  ${r.total[sp].pass}/${r.total[sp].n}`); for (const [c, v] of Object.entries(r[sp])) console.log(`  ${c.padEnd(24)} ${v.pass}/${v.n}`); }
  if (!has('no-write')) {
    const H = join(DIR, 'anis-eval-history.json'), hist = existsSync(H) ? JSON.parse(readFileSync(H, 'utf8')) : [];
    hist.push({ date: new Date().toISOString(), n: scored.length, partial: scored.length < all.length, usd, unchecked, total: r.total, tune: r.tune, held: r.held, failed: scored.filter((s) => !s.pass).map((s) => s.id) });
    writeFileSync(H, JSON.stringify(hist, null, 1) + '\n');
  }
}
