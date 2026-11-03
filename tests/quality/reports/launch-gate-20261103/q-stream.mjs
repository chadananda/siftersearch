// W3 strategies through the production chat stream (strategy choice ON — the research-battery runner disables it with research:false).
import fs from 'fs'; import dotenv from 'dotenv';
dotenv.config({ path: '/Users/chad/Dropbox/Public/JS/Projects/siftersearch.com/.env-secrets', quiet: true });
const base = 'https://api.siftersearch.com'; const DS = process.env.DEPLOY_SECRET;
const Q = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
async function one(q) {
  const t0 = Date.now(); const o = { id: q.id, q: q.text, expect: q.expect?.extra?.strategy ?? null, type: q.type, ev: {} };
  try {
    const r = await fetch(base + '/api/chat/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: q.text }] }), signal: AbortSignal.timeout(240000) });
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', txt = '';
    for (;;) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value); const ps = buf.split('\n\n'); buf = ps.pop();
      for (const p of ps) { const m = /^data: (.*)$/m.exec(p); if (!m) continue; let e; try { e = JSON.parse(m[1]); } catch { continue; }
        if (o.ev[e.type] == null) o.ev[e.type] = Date.now() - t0;
        if (e.type === 'session') o.cid = e.conversation_id;
        if ((e.type === 'text' || e.type === 'chunk') && o.first == null) o.first = Date.now() - t0;
        if (e.type === 'chunk') txt += e.text; if (e.type === 'text' && !txt) o.t1 = e.content; if (e.type === 'error') o.err = e.message || e.error; } }
    o.total = Date.now() - t0; o.reply = txt || o.t1 || '';
    if (o.cid) { await new Promise((z) => setTimeout(z, 4000)); const t = await fetch(base + '/api/admin/anis/threads/' + o.cid, { headers: { 'X-Internal-Key': DS } }).then((x) => x.json()).catch(() => null);
      const rr = t?.rounds?.[0]?.reply; const rt = rr?.route; o.strategy = rt?.strategy; o.gate = rt?.gate; o.shape = rt?.plan?.shape; o.fmt = rt?.plan?.stages?.format;
      o.stStage = rt?.plan?.stages?.strategy; o.timeline = rt?.timeline; o.meta = rr?.meta; o.llm = (rt?.llm || []).map((x) => x.caller); }
  } catch (e) { o.err = String(e.message || e); }
  return o;
}
const out = []; let k = 0;
await Promise.all([0, 1, 2].map(async () => { while (k < Q.length) { const q = Q[k++]; const o = await one(q); out.push(o); console.error(o.id, 'exp', o.expect, 'got', o.strategy, o.shape, o.stStage?.choice, o.first, o.total, o.err || ''); } }));
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
