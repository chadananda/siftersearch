// HyPE batch runner (HYPE_MODE=batch, the default; sync stays for urgent single-doc work). plan() → provider Message Batches
// → settle(): the library builds prompts and validates/writes (rag.retrieval.plan/settle — same prompt, parser, gates and
// version stamp as the live path); this file only chunks, transports, persists and meters. Job state lives in a JSON file so a
// restart resumes the SAME batches (never pays twice), paragraphs in flight are excluded from the next plan, failed ones
// retry in a later batch (finer slices after a truncation), and a paragraph that keeps failing is stamped empty after MAX_ATTEMPTS.
// Limits: per request input <= BATCH_MAX_INPUT_TOKENS and output <= BATCH_MAX_OUTPUT_TOKENS (retrieval.js; Haiku 5.5 allows
// 1M in / 128k out but prices 5x past 100k); per batch <= MAX_REQUESTS and <= MAX_BYTES (API ceilings: 100,000 / 256 MB).
// Deps: rag (retrieval.plan/settle), a transport {create,status,results} (ai.js anthropicBatchTransport; fake in tests).
import fs from 'node:fs';
import path from 'node:path';
import { HYPE_VERSION } from '../rag/enrich/retrieval.js';

export const hypeMode = (env = process.env) => (String(env.HYPE_MODE || 'batch').toLowerCase() === 'sync' ? 'sync' : 'batch');
export const MAX_REQUESTS = 10000;          // under the 100,000 API ceiling; the shared system prefix makes bytes bind first
export const MAX_BYTES = 150 * 1024 * 1024; // under the 256 MB API ceiling
export const MAX_ATTEMPTS = 3;
const DEFAULT_DIR = path.join(process.cwd(), 'data', 'run', 'hype-batch');
const cid = (docId, paraId, part) => `d${docId}_p${paraId}_s${part}`;
const parseCid = (c) => { const m = /^d(\d+)_p(\d+)_s(\d+)$/.exec(c); return m ? { docId: +m[1], id: +m[2], part: +m[3] } : null; };

export function createHypeBatch({ rag, transport, budgetOver = async () => false, langOf = async () => null, assertSpend = () => {}, meter = () => {},
  dir = DEFAULT_DIR, now = () => Date.now(), log = console, maxRequests = MAX_REQUESTS, maxBytes = MAX_BYTES, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const file = path.join(dir, 'state.json');
  const load = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { batches: {}, attempts: {}, split: [] }; } };
  const save = (st) => { fs.mkdirSync(dir, { recursive: true }); const t = `${file}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(st)); fs.renameSync(t, file); };
  const inflight = (st) => new Set(Object.values(st.batches).flatMap((b) => Object.values(b.docs).flatMap((d) => d.units.map((u) => u.id))));

  /** Plan + submit. docIds in PRIORITY ORDER. limit = max paragraphs this call. Returns what was sent and why anything was not. */
  async function submit(docIds, { limit = Infinity, noDisambig = false, upgrade = false, model, maxTokens } = {}) {
    const st = load(); const out = { batches: [], paragraphs: 0, requests: 0, gated: [], overCap: 0, spendRefused: [], over_budget: false, docs: 0 };
    if (await budgetOver()) { out.over_budget = true; return out; }
    const exclude = inflight(st), split = new Set(st.split || []);
    let cur = null, left = limit;
    const flush = async () => {
      if (!cur?.requests.length) { cur = null; return; }
      const id = await transport.create(cur.requests, { model: cur.model });   // reserve nothing before this succeeds: a throw leaves state untouched
      st.batches[id] = { at: now(), model: cur.model, version: HYPE_VERSION, requests: cur.requests.length, docs: cur.docs, settled: {} };
      save(st); out.batches.push(id); out.requests += cur.requests.length; cur = null;
    };
    for (const docId of docIds) {
      if (left <= 0) break;
      let p;
      try { p = await rag.retrieval.plan(docId, { limit: left, noDisambig, upgrade, exclude, split, model, maxTokens }); }
      catch (e) { if (e?.fatal) throw e; out.gated.push({ docId, why: String(e.message).slice(0, 120) }); continue; }   // disambiguation gate etc.: skip the doc, keep going
      if (p.skipped.length) out.overCap += p.skipped.length;
      if (!p.units.length) continue;
      try { assertSpend({ provider: 'anthropic', model: p.model, lang: await langOf(docId), stage: 'hype', docId }); }
      catch (e) { if (e?.fatal) { out.spendRefused.push(docId); continue; } throw e; }
      for (const u of p.units) {
        const reqs = u.parts.map((user, i) => ({ custom_id: cid(docId, u.id, i), system: p.system, user, maxTokens: p.maxTokens }));
        const bytes = reqs.reduce((n, r) => n + r.system.length + r.user.length + 400, 0);
        if (cur && (cur.model !== p.model || cur.requests.length + reqs.length > maxRequests || cur.bytes + bytes > maxBytes)) await flush();
        cur ||= { model: p.model, requests: [], bytes: 0, docs: {} };
        cur.requests.push(...reqs); cur.bytes += bytes;
        (cur.docs[docId] ||= { units: [] }).units.push({ id: u.id, parts: u.parts.length });
        exclude.add(u.id); left--; out.paragraphs++;
      }
      out.docs++;
    }
    await flush();
    return out;
  }

  /** Collect every ended batch: validate + write through rag.retrieval.settle, meter usage, retry bookkeeping. Idempotent. */
  async function collect() {
    const st = load(); const sum = { checked: 0, ended: 0, written: 0, failed: 0, exhausted: 0, alreadyDone: 0, pending: 0, errors: [] };
    for (const [id, b] of Object.entries(st.batches)) {
      sum.checked++;
      let s; try { s = await transport.status(id); } catch (e) { sum.pending++; sum.errors.push(`status ${id}: ${e.message}`); continue; }
      if (!s.ended) { sum.pending++; continue; }
      sum.ended++;
      const byDoc = {};   // docId → id → { replies, stops }
      try {
        for await (const r of transport.results(id)) {
          const k = parseCid(r.custom_id); if (!k) continue;
          const slot = ((byDoc[k.docId] ||= {})[k.id] ||= { replies: [], truncated: false });
          slot.replies[k.part] = r.ok ? r.text : null;
          if (r.stopReason === 'max_tokens') slot.truncated = true;
          meter({ model: b.model, docId: k.docId, ok: r.ok, usage: r.usage, error: r.error });
        }
      } catch (e) { sum.errors.push(`results ${id}: ${e.message}`); continue; }   // keep the batch; results stay retrievable for weeks
      let allSettled = true;
      for (const [docId, d] of Object.entries(b.docs)) {
        if (b.settled[docId]) continue;
        const outcomes = d.units.map((u) => ({ id: u.id, replies: Array.from({ length: u.parts }, (_, i) => byDoc[docId]?.[u.id]?.replies[i] ?? null) }));
        const exhaust = new Set(outcomes.filter((o) => (st.attempts[o.id] || 0) + 1 >= MAX_ATTEMPTS).map((o) => o.id));
        try {
          const r = await rag.retrieval.settle(Number(docId), outcomes, { exhaust });
          sum.written += r.written; sum.exhausted += r.exhausted; sum.alreadyDone += r.alreadyDone; sum.failed += r.failed.length;
          for (const f of r.failed) { st.attempts[f] = (st.attempts[f] || 0) + 1; if (byDoc[docId]?.[f]?.truncated) (st.split ||= []).includes(f) || st.split.push(f); }
          for (const o of outcomes) if (!r.failed.includes(o.id)) { delete st.attempts[o.id]; st.split = (st.split || []).filter((x) => x !== o.id); }
          b.settled[docId] = true; save(st);
        } catch (e) { allSettled = false; sum.errors.push(`settle doc ${docId}: ${e.message}`); if (e?.fatal) throw e; }
      }
      if (allSettled) { delete st.batches[id]; save(st); log.info?.({ batch: id, ...sum }, 'hype-batch collected'); }
    }
    return sum;
  }

  const status = () => { const st = load(); return { batches: Object.entries(st.batches).map(([id, b]) => ({ id, requests: b.requests, model: b.model, ageMin: Math.round((now() - b.at) / 60000), docs: Object.keys(b.docs).length })),
    inflight: inflight(st).size, retrying: Object.keys(st.attempts).length }; };

  /** Blocking driver (the hype STAGE and the CLI): submit, then collect until nothing is pending. Resumes batches left by a dead process. */
  async function run(docIds, opts = {}) {
    const { pollMs = 30000, maxRounds = Infinity } = opts; const total = { submitted: 0, written: 0, failed: 0, exhausted: 0, rounds: 0 };
    for (let round = 0; round < maxRounds; round++) {
      total.rounds++;
      const sub = await submit(docIds, opts); total.submitted += sub.paragraphs;
      let pend; do { const c = await collect(); total.written += c.written; total.exhausted += c.exhausted; total.failed += c.failed; pend = c.pending; if (pend) await sleep(pollMs); } while (pend);
      if (!sub.paragraphs) break;   // nothing left to send; the failed ones were retried in this round's submit
    }
    return total;
  }

  return { submit, collect, status, run };
}
