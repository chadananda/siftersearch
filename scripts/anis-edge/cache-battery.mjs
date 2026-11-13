// Anís edge battery: ask the Worker (SSE) and check the research cache. Modes:
//   ask "<q>"            one turn → JSON summary (reply, timings, cites, tower calls)
//   embed                cosine of every seed vs its paraphrases / related / control (threshold calibration, no LLM spend)
//   seed [n]             research the first n seeds through the Worker (captures their research sets)
//   battery [n]          paraphrases must hit, related → related/start, control → miss (lookup only, no LLM spend)
//   chat [n]             a paraphrase per seed through the full Worker chat: latency on a cache hit
// Env: ANIS_URL (default workers.dev), DEPLOY_SECRET (the Worker's TOWER_KEY, for /_anis/*). Writes tmp/anis-edge/<mode>-<ts>.json.
import fs from 'node:fs';

const URL0 = process.env.ANIS_URL || 'https://anis.chadananda.workers.dev';
const KEY = process.env.DEPLOY_SECRET;
const seeds = JSON.parse(fs.readFileSync(new URL('../../tests/quality/anis-cache-paraphrases.json', import.meta.url))).seeds;
const [mode = 'battery', arg] = process.argv.slice(2);
const n = Number(arg) || seeds.length;

export async function ask(q, history = []) {
  const t0 = Date.now();
  const r = await fetch(`${URL0}/api/chat/stream`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [...history, { role: 'user', content: q }] }) });
  const dec = new TextDecoder(); let buf = '', firstByte = null, firstText = null, reply = '', streamed = '';
  const ev = [];
  for await (const chunk of r.body) {
    firstByte ??= Date.now() - t0;
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (!line.startsWith('data:')) continue;
      const e = JSON.parse(line.slice(5));
      ev.push(e.type);
      if (e.type === 'text') { firstText ??= Date.now() - t0; streamed += e.content; }
      if (e.type === 'chunk') reply += e.text;
      if (e.type === 'complete') ev.complete = e;
      if (e.type === 'followups') ev.followups = e.items;
      if (e.type === 'error') ev.error = e.message;
    }
  }
  const c = ev.complete;
  return { q, ms: Date.now() - t0, firstByte, firstText, status: r.status, error: ev.error || null, timings: c?.meta?.timings,
    cites: c?.citations?.length ?? 0, followups: ev.followups || [], events: [...new Set(ev)], reply, streamedLen: streamed.length };
}

const internal = async (path, body) => (await fetch(`${URL0}${path}`, { method: 'POST',
  headers: { 'content-type': 'application/json', 'x-internal-key': KEY }, body: JSON.stringify(body) })).json();
const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y); };

async function pool(items, k, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: k }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

const out = { mode, at: new Date().toISOString(), url: URL0 };
if (mode === 'ask') {
  out.result = await ask(arg);
  console.log(JSON.stringify({ ...out.result, reply: out.result.reply.slice(0, 1500) }, null, 1));
} else if (mode === 'embed') {
  const rows = await pool(seeds.slice(0, n), 4, async (s) => {
    const texts = [s.q, ...s.same, s.related, s.other];
    const { vectors } = await internal('/_anis/embed', { texts });
    return { q: s.q, same: s.same.map((_, i) => +cos(vectors[0], vectors[i + 1]).toFixed(3)), related: +cos(vectors[0], vectors[4]).toFixed(3), other: +cos(vectors[0], vectors[5]).toFixed(3) };
  });
  const all = (k) => rows.flatMap((r) => [].concat(r[k])).sort((a, b) => a - b);
  const pct = (a, p) => a[Math.floor((a.length - 1) * p)];
  out.rows = rows;
  out.summary = Object.fromEntries(['same', 'related', 'other'].map((k) => { const a = all(k); return [k, { min: a[0], p10: pct(a, 0.1), p50: pct(a, 0.5), p90: pct(a, 0.9), max: a.at(-1) }]; }));
  console.log(JSON.stringify(out.summary, null, 1));
  for (const r of rows) { const lo = Math.min(...r.same); if (lo < 0.88 || r.related >= 0.88 || r.other >= 0.6) console.log(`${lo.toFixed(2)} rel ${r.related} oth ${r.other}  ${r.q}`); }
} else if (mode === 'seed') {
  out.rows = await pool(seeds.slice(0, n), 3, async (s) => { const r = await ask(s.q); console.log(`${r.ms}ms tower ${r.timings?.tower_ms}/${r.timings?.tower_calls} cites ${r.cites} ${r.error || ''} ${s.q}`); return r; });
} else if (mode === 'battery') {
  out.rows = await pool(seeds.slice(0, n), 4, async (s) => {
    const look = async (q) => { const r = await internal('/_anis/lookup', { question: q }); return { q, sim: r.similarity, same: r.same, set: r.set?.question || null, status: r.set?.status || null }; };
    const seed = await look(s.q);
    const same = await Promise.all(s.same.map(look));
    const related = await look(s.related), other = await look(s.other);
    return { seed, same, related, other,
      ok: { seed: seed.same && seed.set === s.q, same: same.filter((x) => x.same && x.set === s.q).length, related: !!related.set && !related.same, other: !other.same } };
  });
  const t = (f) => out.rows.reduce((a, r) => a + f(r), 0);
  out.summary = { seeds: out.rows.length, seed_found: t((r) => +r.ok.seed), paraphrase_hits: `${t((r) => r.ok.same)}/${out.rows.length * 3}`,
    related_start: t((r) => +r.ok.related), controls_missed: t((r) => +r.ok.other), wrong_set: t((r) => r.same.filter((x) => x.same && x.set !== r.seed.q).length) };
  console.log(JSON.stringify(out.summary, null, 1));
  for (const r of out.rows) for (const x of r.same) if (!(x.same && x.set === r.seed.q)) console.log(`MISS ${x.sim?.toFixed?.(3)} ${x.q}  → ${x.set}`);
} else if (mode === 'chat') {
  out.rows = await pool(seeds.slice(0, n), 3, async (s, i) => { const q = s.same[i % 3]; const r = await ask(q);
    console.log(`${r.ms}ms first ${r.firstText} tower ${r.timings?.tower_ms}/${r.timings?.tower_calls} rounds ${r.timings?.rounds} ${r.error || ''} ${q}`); return r; });
}
fs.mkdirSync('tmp/anis-edge', { recursive: true });
const f = `tmp/anis-edge/${mode}-${Date.now()}.json`; fs.writeFileSync(f, JSON.stringify(out, null, 1)); console.log(f);
