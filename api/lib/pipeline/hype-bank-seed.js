// HyPE seeded from the question bank (planning/anis-tradition-rollout.md, Chad 11-10: "HyPE generation includes answers to the 100 top questions
// from the outset"). Ops job `hype-bank-seed` { tradition, dry }: every NON-held-out bank question → Anís's search restricted to the religion →
// top core/gray paragraphs → the HyPE grader (one Message Batch, billed to hype-program) confirms the ¶ answers it → the question is merged into
// the ¶'s hyp_questions (provenance in hype_bank_seeds, source 'bank') and the docs are queued for the hype index. Held-out questions never seeded.
// Deps all injectable (tests mock search, rows, checks, repo, spend).
import fs from 'node:fs';
import path from 'node:path';
import { withAIContext } from '../ai-context.js';
import { HYPE_VERSION } from '../rag/enrich/retrieval.js';
import { RUBRIC, JUDGE_MODEL, judgeUser } from './hype-rubric.js';
import { parseJudge } from './hype-judge.js';
import { BUDGET_KEY, EST_USD_PER_CHECK, monthlyUsd, budgetRoom } from './hype-program.js';
import { canonicalTradition } from '../assistant/tradition-name.js';
import { doctrinalTier } from '../authority.js';

export const SEED_TIERS = ['core', 'gray'];
export const DEFAULT_PER_QUESTION = 10;   // keep every confirmed answering ¶ up to this (Chad: "as much as possible" in the doctrinal material)
const BANK_DIR = path.join(process.cwd(), 'tests', 'quality', 'question-bank');
const r2 = (n) => Math.round(n * 100) / 100;

/** A bank question is held out when flagged OR at the harvest rule's position (index % 5 === 4) — either one excludes it. */
export const seedable = (questions = []) => questions.filter((q, i) => !q.held_out && i % 5 !== 4);
/** Bank search phrasing → a HyPE question ("what is bahai faith" → "What is bahai faith?"). */
export const asQuestion = (q) => { const s = String(q || '').trim().replace(/\s+/g, ' '); return s ? s[0].toUpperCase() + s.slice(1).replace(/[?.!\s]*$/, '?') : s; };
/** bank id ('bahai') or a religion name ("Bahá'í") → { bankId, religion } */
export function resolveTradition(t, bankIds) {
  const religion = canonicalTradition(t);
  const bankId = bankIds.find((id) => id === String(t).toLowerCase() || canonicalTradition(id) === religion) || null;
  return { bankId, religion };
}

async function defaults(over) {
  return {
    repo: over.repo || await import('../repos/hype-seed-repo.js'),
    env: process.env, sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    bankIds: () => fs.readdirSync(BANK_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)),
    bank: (id) => JSON.parse(fs.readFileSync(path.join(BANK_DIR, `${id}.json`), 'utf8')),
    search: async (q, religion, limit) => (await import('../assistant/agent-search.js')).agentSearch()(q, religion, limit),
    tier: (h) => doctrinalTier({ religion: h.religion, collection: h.collection, title: h.title, author: h.author }),
    rows: async (ids) => (await import('../repos/hype-program-repo.js')).hypeRows(ids),
    checks: async () => (await import('./hype-batch-app.js')).makeHypeChecks(BUDGET_KEY),
    spend: { month: async () => (await (await import('../repos/ai-usage-repo.js')).monthSpendByCaller())[BUDGET_KEY] || 0,
      today: async () => (await (await import('../repos/ai-usage-repo.js')).dailySpendByCaller())[BUDGET_KEY] || 0 },
    follow: async (docIds) => (await import('../ops/index-follow.js')).queueFollowIndex('hype', docIds, 'hype-bank-seed'),
    draining: async () => (await import('../drain.js')).isDraining(),
    log: async (kind, text) => (await import('../repos/activity-repo.js')).logActivity(kind, text),
    ...over,
  };
}

/** The plan: seedable questions → top core/gray paragraphs not yet judged at this version. Search only (no LLM). */
export async function planPairs({ bankId, religion, questions, perQuestion, judged }, d) {
  const pairs = [], noHits = [];
  for (const q of questions) {
    // the question and each of its measured variants are searched; results interleave by rank so every phrasing contributes
    const phrasings = [q.q, ...(q.variants || [])].filter((x, i, a) => x && a.indexOf(x) === i);
    const lists = [], errors = [];
    for (const ph of phrasings) {
      try { lists.push((await d.search(ph, religion, perQuestion * 4)) || []); } catch (e) { errors.push(String(e?.message || e).slice(0, 120)); }
    }
    if (!lists.length) { noHits.push({ bankId: q.id, error: errors[0] }); continue; }
    const hits = [];
    for (let r = 0; r < Math.max(...lists.map((l) => l.length)); r++) for (const l of lists) if (l[r]) hits.push(l[r]);
    const picked = [], seen = new Set();
    for (const h of hits || []) {
      const paraId = Number(h.id), docId = Number(h.doc_id ?? h.document_id);
      if (!paraId || !docId || seen.has(paraId)) continue;
      seen.add(paraId);
      if (canonicalTradition(h.religion) !== religion) continue;
      const tier = d.tier(h); if (!SEED_TIERS.includes(tier)) continue;
      if (judged.has(`${q.id}|${paraId}`)) continue;
      picked.push({ bankId: q.id, q: q.q, question: asQuestion(q.q), paraId, docId, tier, title: h.title || null });
      if (picked.length >= perQuestion) break;
    }
    if (!picked.length) noHits.push({ bankId: q.id }); else pairs.push(...picked);
  }
  return { pairs, noHits };
}

/** One check request per paragraph (all its bank questions at once) → [{ custom_id, system, user, maxTokens }] + the index map. */
export function checkRequests(pairs, rows) {
  const byPara = new Map(), text = new Map(rows.map((r) => [Number(r.id), r]));
  for (const p of pairs) { const a = byPara.get(p.paraId) || []; a.push(p); byPara.set(p.paraId, a); }
  const reqs = [], missing = [];
  for (const [paraId, ps] of byPara) {
    const r = text.get(paraId);
    if (!r?.text) { missing.push(...ps); continue; }
    reqs.push({ custom_id: `d${ps[0].docId}_p${paraId}`, system: RUBRIC, user: judgeUser(r.text, r.original_text, ps.map((p) => p.question)), maxTokens: 2000 });
  }
  return { reqs, byPara, missing };
}

/** A check batch's results → verdict per pair: answered === true → 'seeded', else 'rejected'. Unparsed ¶ stay unjudged (retried next run). */
export async function collectVerdicts(c, bid, byPara) {
  const out = [], unparsed = [];
  for await (const x of c.results(bid)) {
    const m = /^d(\d+)_p(\d+)$/.exec(x.custom_id || ''), paraId = Number(m?.[2]), docId = Number(m?.[1]) || null;
    try { await c.meter({ model: JUDGE_MODEL, docId, ok: x.ok, usage: x.usage, error: x.error }); } catch { /* metering never loses a verdict */ }
    const ps = byPara.get(paraId); if (!ps) continue;
    const v = x.ok ? parseJudge(x.text) : null;
    if (!v || v.unparsed != null || !Array.isArray(v.questions)) { unparsed.push(paraId); continue; }
    ps.forEach((p, i) => { const g = v.questions.find((q) => Number(q.i) === i); out.push({ ...p, verdict: g?.answered === true ? 'seeded' : 'rejected', why: g?.why || (g ? null : 'not graded') }); });
  }
  return { verdicts: out, unparsed };
}

export async function hypeBankSeedJob(params = {}, deps = {}) {
  const d = await defaults(deps);
  const { tradition = null, dry = false, dryRun = false, perQuestion = DEFAULT_PER_QUESTION, maxUsd = null, pollMs = 60000, limit = Infinity, checkBatch = null } = params;
  if (!tradition) return { status: 'error', error: 'tradition required (a question-bank id, e.g. bahai)' };
  const { bankId, religion } = resolveTradition(tradition, d.bankIds());
  if (!bankId) return { status: 'error', error: `no question bank for ${tradition}` };
  const bank = d.bank(bankId), all = bank.questions || [], questions = seedable(all).slice(0, limit);
  const head = { tradition: bankId, religion, version: HYPE_VERSION, bankQuestions: all.length, heldOut: all.length - seedable(all).length, seedable: questions.length };

  let pairs = params.pairs || null, noHits = [];
  if (!pairs) ({ pairs, noHits } = await planPairs({ bankId, religion, questions, perQuestion, judged: await d.repo.judgedPairs(bankId, HYPE_VERSION) }, d));
  const checks = new Set(pairs.map((p) => p.paraId)).size, estUsd = r2(checks * EST_USD_PER_CHECK);
  const plan = { ...head, pairs: pairs.length, checks, estUsd, estFormula: `checks (one per paragraph, all its bank questions) x $${EST_USD_PER_CHECK}`, noHits: noHits.length };
  if (dry || dryRun) return { dryRun: true, ...plan, planned: pairs.map(({ bankId: b, q, paraId, docId, tier, title }) => ({ bankId: b, q, paraId, docId, tier, title })), noHitIds: noHits.map((x) => x.bankId) };
  if (!pairs.length) return { ...plan, status: 'complete', seeded: 0, rejected: 0, note: 'nothing to judge (all pairs judged at this version, or no core/gray hits)' };

  return withAIContext({ billTo: BUDGET_KEY, stage: 'hype-judge', caller: BUDGET_KEY }, async () => {
    const c = await d.checks();
    let bid = checkBatch, byPara;
    if (!bid) {
      const monthUsd = monthlyUsd(d.env);
      if (!monthUsd) return { ...plan, status: 'budget', reason: 'HYPE_PROGRAM_USD_MONTH is 0 or not a number' };
      const [spentMonth, spentToday] = await Promise.all([d.spend.month(), d.spend.today()]);
      const room = budgetRoom({ monthUsd, spentMonth, spentToday, maxUsd: maxUsd == null ? null : Number(maxUsd) });
      if (room.usd < estUsd) return { ...plan, status: 'budget', binding: room.binding, roomUsd: r2(room.usd) };   // quiet stop: the next run tries again
      const built = checkRequests(pairs, await d.rows([...new Set(pairs.map((p) => p.paraId))]));
      byPara = built.byPara;
      if (!built.reqs.length) return { ...plan, status: 'complete', seeded: 0, rejected: 0, missingText: built.missing.length };
      bid = await c.create(built.reqs, { model: JUDGE_MODEL });
      await d.log('hype', `hype-bank-seed ${bankId}: ${built.reqs.length} checks submitted (${pairs.length} question×¶ pairs) · est $${estUsd}`);
    } else byPara = checkRequests(pairs, pairs.map((p) => ({ id: p.paraId, text: '-' }))).byPara;   // resume: only the pair map is needed
    for (;;) {
      let st = null; try { st = await c.status(bid); } catch { /* look again */ }
      if (st?.ended) break;
      if (await d.draining()) return { ...plan, yielded: true, resume: { ...params, checkBatch: bid, pairs } };
      await d.sleep(pollMs);
    }
    const { verdicts, unparsed } = await collectVerdicts(c, bid, byPara);
    const saved = await d.repo.saveBankSeeds(verdicts, { tradition: bankId, version: HYPE_VERSION });
    const docIds = [...new Set(verdicts.filter((v) => v.verdict === 'seeded').map((v) => v.docId))];
    if (docIds.length) try { await d.follow(docIds); } catch { /* the follow pass picks the docs up from the ledger */ }
    const seeded = verdicts.filter((v) => v.verdict === 'seeded').length;
    await d.log('hype', `hype-bank-seed ${bankId}: ${seeded} seeded, ${verdicts.length - seeded} rejected, ${unparsed.length} unparsed · ${docIds.length} docs to the hype index`);
    return { ...plan, status: 'complete', checkBatch: bid, seeded, rejected: verdicts.length - seeded, unparsed: unparsed.length, merged: saved.merged, indexedDocs: docIds.length };
  });
}

/** After a HyPE run regenerated paragraphs: put the tradition's seeded bank questions back (free) and queue those docs for the index. */
export async function reapplyBankSeeds(tradition, deps = {}) {
  const d = await defaults(deps);
  const { bankId } = resolveTradition(tradition, d.bankIds());
  if (!bankId) return { status: 'error', error: `no question bank for ${tradition}` };
  const r = await d.repo.reapplySeeds(bankId, HYPE_VERSION);
  if (r.docIds.length) try { await d.follow(r.docIds); } catch { /* the follow pass picks them up */ }
  return { tradition: bankId, paragraphs: r.paragraphs, merged: r.merged, indexedDocs: r.docIds.length };
}
