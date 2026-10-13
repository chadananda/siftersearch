// spend-ledger — corpus-rag spend per provider since its budget baseline, kept as a RUNNING TOTAL for the launch gate.
// Re-summing ai_usage froze a fresh API 18–40 s at every boot (10-12; Chad: "41 seconds frozen totaling spending is
// not ok"). The ledger catches up by id range (the primary key — only rows added since its last look), checkpoints to
// a small JSON file so a restart resumes instead of rescanning, and with no usable checkpoint fills in id chunks that
// yield the event loop between them. Returns null while filling (the gate holds launches; nothing alerts).
// Deps: repos/ai-usage-repo.js (injectable for tests).
import { readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { maxUsageId, corpusRagSpendInRange } from '../repos/ai-usage-repo.js';

export const CHUNK = 50_000;                       // ~tens of ms per chunk on the PK range
const SAVE_EVERY_MS = 60_000;
const defaultFile = () => process.env.SPEND_LEDGER_FILE || join(process.cwd(), 'data', 'spend-ledger.json');
const tick = () => new Promise((ok) => setImmediate(ok));

export function createLedger({ top: topId = maxUsageId, range = corpusRagSpendInRange, file = defaultFile(), chunk = CHUNK, persist = true } = {}) {
  const state = new Map();                         // provider → { baseline, sum, maxId, ready }
  const fills = new Map();
  let loaded = false, savedAt = 0;

  const load = () => {
    if (loaded) return; loaded = true;
    if (!persist) return;
    try { for (const [p, v] of Object.entries(JSON.parse(readFileSync(file, 'utf8')))) state.set(p, { ...v, ready: true }); } catch { /* none yet */ }
  };
  const save = (force = false) => {
    if (!persist || (!force && Date.now() - savedAt < SAVE_EVERY_MS)) return;
    savedAt = Date.now();
    const out = Object.fromEntries([...state].filter(([, v]) => v.ready).map(([p, v]) => [p, { baseline: v.baseline, sum: v.sum, maxId: v.maxId }]));
    try { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(out)); renameSync(tmp, file); } catch { /* a checkpoint is an optimisation */ }
  };
  const top = () => topId();
  const addRange = async (s, provider, from, to) => { s.sum += await range(from, to, provider, s.baseline || ''); s.maxId = to; };

  // Catch a provider up to `to` in chunks, yielding between them.
  const fill = (provider, s, to) => {
    if (fills.has(provider)) return fills.get(provider);
    const p = (async () => {
      while (s.maxId < to) { await addRange(s, provider, s.maxId, Math.min(to, s.maxId + chunk)); await tick(); }
      s.ready = true; save(true);
    })().catch(() => { /* retried on the next call */ }).finally(() => fills.delete(provider));
    fills.set(provider, p);
    return p;
  };

  /** Spend since `baseline` (null = all history). A number, or null while the ledger is still filling. */
  async function spendSince(provider, baseline) {
    load();
    let s = state.get(provider);
    if (!s || s.baseline !== (baseline || null)) { s = { baseline: baseline || null, sum: 0, maxId: 0, ready: false }; state.set(provider, s); }
    const to = await top();
    if (s.ready && to - s.maxId <= chunk) {        // the normal tick: one small delta
      if (to > s.maxId) await addRange(s, provider, s.maxId, to);
      save();
      return s.sum;
    }
    s.ready = false;                               // far behind (fresh, or an old checkpoint): fill in the background
    fill(provider, s, to);
    return null;
  }
  return { spendSince, _state: state, _settle: () => Promise.all([...fills.values()]) };
}

let shared = null;
export const spendSince = (provider, baseline) => (shared ||= createLedger()).spendSince(provider, baseline);
