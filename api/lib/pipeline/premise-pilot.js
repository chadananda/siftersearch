// Premise-extraction PILOT (Chad 11-11): passages whose weight lies in what they ASSUME, not what they answer (HyPE cannot hold these).
// Ops job `premise-pilot` { maxUsd, targets?, dry? }: one Sonnet call per paragraph (+ prev/next ¶, heading, title/author) → premises with a verbatim proof
// (spanIsPresent-checked; unverified counted + kept in `dropped` with reason). Billed to budget key `premise-pilot`. Writes data/run/premise-pilot-<ts>.json. Deps all injectable.
import fs from 'node:fs';
import path from 'node:path';
import { withAIContext } from '../ai-context.js';
import { spanIsPresent } from '../rag/enrich/retrieval.js';
// quotes/dashes normalised on both sides: a model returns straight quotes for the texts' curly ones (11-11: a4 framingProof flagged for that)
// footnote markers ([^41]) and page markers ([pg 26]) stripped: a model copies the words without them (11-12: Aqdas unborn ¶ dropped for that)
// all quote marks → one (a model writes 'None shall…' for “None shall…”, 11-12)
const qnorm = (t) => String(t || '').replace(/\[\^[^\]]*\]|\[pg\s*[\w.-]+\]/gi, '').replace(/[\u2018\u2019\u02BC\u2032\u00B4`\u201C\u201D\u00AB\u00BB"]/g, "'").replace(/[\u2013\u2014]/g, '-');
// a proof may join separate phrases ("A... B", or two non-adjacent sentences): every piece must be present; pieces too short to check are skipped
export function spanPresent(span, texts) {
  const t = texts.map(qnorm), whole = spanIsPresent(qnorm(span), t);
  if (whole !== false) return whole;
  const pieces = qnorm(span).split(/\.{3}|\u2026|(?<=[.!?;])\s+/).map((x) => x.trim()).filter((x) => x.length >= 12);
  return pieces.length > 1 && pieces.every((x) => spanIsPresent(x, t) === true) ? true : false;
}
import { JUDGE_MODEL } from './hype-rubric.js';
import { calculateCost } from '../model-registry.js';
import { isCreditRefusal, isSpendCap, CREDIT_WAIT_MS } from '../spend-caps.js';

export const BUDGET_KEY = 'premise-pilot';
export const EST_USD_PER_PARA = 0.008;   // ESTIMATE: ~1.8k in (prompt + ¶ + neighbours) + ~150 out at Sonnet 4.6 sync prices ($3/$15 per M); replace with the metered mean
export const CONCURRENCY = 4, MIN_LEN = 40, TEXT_CAP = 600;
export const CONCEPTS = ['source of rights (divine vs. state-granted)', 'limits of sovereign/state power', 'just and unjust taxation', 'private property', 'moral status of the unborn / right to life', 'justice (ʿadl) and equity (inṣáf)', 'equality before the law', 'rule of law and accountability of rulers', 'consultation and consent of the governed', 'freedom of conscience and religion', 'extremes of wealth and poverty / economic justice', 'punishment, mercy and the purpose of penalties', 'individual rights vs. the common good', 'war, peace and collective security', 'rights and duties of women', 'education as a right', 'the family and inheritance', 'human nature (noble vs. corrupt)', 'religion and the state', 'work as worship / labour and capital'];
export const PILOT_TARGETS = [
  { docId: 20806 },   // Summons of the Lord of Hosts (Tablets to the Kings), whole book
  { docId: 21307 },   // The Kitáb-i-Aqdas, whole book
  { docId: 20911, match: 'justice|equity|punish|strike|wealth|poverty|rights' },   // Some Answered Questions
  { docId: 21310, match: 'Mashriqu|Ishq|Soviet|Russia|confiscat|expropriat|property' },   // God Passes By
];
export const SYSTEM = `You read ONE passage from a religious or historical work and list the PREMISES it rests on: things it ASSUMES (presupposes) or plainly states that carry real political, legal, economic, ethical or philosophical weight for contemporary debate.
Example: a ruler is rebuked for unjust taxation. That presupposes rights exist before the state (from God), a sovereign can be wrong, and the power to tax has moral limits.
Example: a law gives children still unborn a share of inheritance. That presupposes the unborn already have standing and rights of their own; and if they hold the lesser right (property), it implies the greater one (life), which bears directly on today's abortion debate.
IMPLICATIONS (the point of this work): a passage often bears on a modern debate it never names. Draw the implication when it follows by plain reasoning: if a lesser right is granted, the greater is implied; if a ruler can be rebuked for taking something, it was never his to give. Put it in "implies": one sentence naming the modern debate and the position the passage supports or challenges (for example "rights come from God and precede the state, against the view that governments grant them"). Leave "implies" empty when nothing follows beyond the premise.
Rules:
- The normal answer is an EMPTY list. Narrative, devotional, ritual and descriptive passages usually have no such premise. Never manufacture one.
- Stay inside what the passage itself addresses. When it speaks of one aspect (the station God created man for, the higher or spiritual nature, an ideal, one specific law), NAME that aspect in the premise; never generalise into a claim about the whole of human nature, all rulers, or all property.
- Name the speaker by the station the work gives him. When Bahá'u'lláh or the Báb (or Christ, Muhammad, Moses) changes or abolishes a law, that is a Manifestation of God founding a new religion: the Kitáb-i-Íqán teaches that every universal Manifestation renews religion by sweeping away the outdated laws, rules and social norms of past dispensations. Say so; never reduce Him to "a religious authority" or "a religious leader".
- Human nature: good is inherent in every person as a POTENTIAL. Never say people are naturally oriented or inclined toward the good or toward God: a child is born selfish and animal, and turning to God and freedom from animal impulses is attained, not initial or natural, though it is assured as possible for all.
- Keep the passage's OWN terms. If it says love of God, detachment from all save Him, turning unto God, say exactly that; never abstract it into a vaguer category ("moral conduct", "spiritual qualities", "values", "worth", "virtue"). A generalised premise loses what the passage is about. Any wider bearing on modern debates goes only in "implies".
- Say "assumes" or "presupposes", never "teaches": this is an inference from the words, not a statement of the faith's teaching.
- Plain words, no jargon. One plain sentence per premise.
- "questions": 1-3 SHORT first-principle questions (under ~10 words) that this passage answers BY IMPLICATION. The most valuable ones CHALLENGE A MODERN ASSUMPTION at its root: ask about the purpose, source or ground of the thing, where the passage's answer differs from what modern people take for granted. Examples: charity whose purpose is to cultivate generosity in the giver challenges the assumption that charity exists only to help the poor → "What is the purpose of charity?"; religion as the source of order challenges the assumption that political structures create order → "What is the source of social order?"; also "Do the unborn have rights?", "Do rights come from the state?", "Can a sacred law be annulled?". Plain and neutral, never loaded, never tied to one passage's wording; the answer stays in the passage's own terms in "premise", and "implies" names the modern assumption it challenges.
- "proof" must be words copied EXACTLY from the PASSAGE (not the context paragraphs), the words the inference rests on.
- "concept" is one of the CONCEPTS below (copy it exactly), or "other: <short label>".
- "basis" is "states" (the passage says it), "presupposes" (it takes it for granted) or "implies" (it follows from the passage by plain reasoning, as above).
- "strength" is "strong" or "moderate"; leave out weak ones.
CONCEPTS:
${CONCEPTS.map((c) => `- ${c}`).join('\n')}
Reply with JSON only: {"premises":[{"premise":"...","concept":"...","basis":"states|presupposes|implies","implies":"... or empty","questions":["..."],"proof":"...","why":"one sentence linking proof to premise","strength":"strong|moderate"}]}`;
const r4 = (n) => Math.round(n * 10000) / 10000;
const userMsg = (doc, p, prev, next) => `WORK: ${doc.title || '?'}${doc.author ? ` by ${doc.author}` : ''}\nSECTION: ${p.heading || '(none)'}\n\nPREVIOUS PARAGRAPH (context only):\n${prev?.text || '(none)'}\n\nPASSAGE:\n${p.text}\n\nNEXT PARAGRAPH (context only):\n${next?.text || '(none)'}`;

/** The reply text → premises array, or null when it is not the JSON asked for. */
export function parsePremises(text) {
  const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  let v; try { v = JSON.parse(s.slice(a, b + 1)); } catch { return null; }
  return Array.isArray(v?.premises) ? v.premises.filter((x) => x && typeof x === 'object') : null;
}

/** One doc's prose paragraphs + a target → the paragraphs to analyse (ord = 1-based position among prose ¶; from/to inclusive; match = regex + 1 neighbour each side). */
export function selectParas(paras, t = {}) {
  const all = paras.map((p, i) => ({ ...p, ord: i + 1 }));
  let picked = all;
  if (t.match) { const re = new RegExp(t.match, 'i'), keep = new Set(); all.forEach((p, i) => { if (re.test(p.text || '')) [i - 1, i, i + 1].forEach((j) => j >= 0 && j < all.length && keep.add(j)); }); picked = all.filter((_, i) => keep.has(i)); }
  if (t.from != null || t.to != null) picked = picked.filter((p) => p.ord >= (t.from ?? 1) && p.ord <= (t.to ?? Infinity));
  return { all, picked: picked.filter((p) => String(p.text || '').trim().length >= MIN_LEN) };
}

async function defaults(over) {
  return {
    doc: async (id) => (await import('../docs-repo.js')).getDoc(id, { scope: 'live' }),
    paragraphs: async (id) => (await import('../docs-repo.js')).getParagraphs(id),
    ask: async (messages, o) => (await import('../ai.js')).chatCompletion(messages, { provider: 'anthropic', model: JUDGE_MODEL, temperature: 0, maxTokens: 1500, ...o }),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    draining: async () => (await import('../drain.js')).isDraining(),
    log: async (kind, text) => (await import('../repos/activity-repo.js')).logActivity(kind, text),
    writeRun: (name, obj) => { const dir = path.join(process.cwd(), 'data', 'run'); fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, name); fs.writeFileSync(f, JSON.stringify(obj, null, 1)); return f; },
    now: () => new Date(),
    ...over,
  };
}

export async function premisePilotJob(params = {}, deps = {}) {
  const d = await defaults(deps);
  const maxUsd = Number(params.maxUsd);
  if (!(maxUsd > 0)) return { status: 'error', error: 'maxUsd required (> 0)' };
  const targets = params.targets?.length ? params.targets : PILOT_TARGETS;
  // plan: dedupe paragraphs across targets
  const work = [], seen = new Set(), docs = new Map(), missing = [];
  for (const t of targets) {
    const doc = await d.doc(t.docId);
    if (!doc) { missing.push(t.docId); continue; }
    const { all, picked } = selectParas(await d.paragraphs(t.docId), t);
    docs.set(t.docId, doc);
    for (const p of picked) if (!seen.has(p.id)) { seen.add(p.id); work.push({ doc, p, prev: all[p.ord - 2], next: all[p.ord] }); }
  }
  const plan = { paragraphs: work.length, estUsd: r4(work.length * EST_USD_PER_PARA), maxUsd, ...(missing.length ? { missingDocs: missing } : {}) };
  if (params.dry || params.dryRun) return { dryRun: true, ...plan, byDoc: Object.fromEntries([...docs].map(([id, doc]) => [id, { title: doc.title, n: work.filter((w) => w.doc === doc).length }])) };

  const out = { usd: 0, done: 0, withPremises: 0, premises: [], unverified: 0, dropped: [], unparsed: 0, errors: 0, byConcept: {}, creditWait: null, stop: null };
  let next = 0;
  const one = async ({ doc, p, prev, next: nx }) => {
    for (;;) {
      if (out.stop) return;
      if (out.usd + EST_USD_PER_PARA > maxUsd) { out.stop = 'budget'; return; }
      try {
        const res = await withAIContext({ billTo: BUDGET_KEY, stage: 'hype-judge', caller: BUDGET_KEY, docId: p.doc_id ?? doc.id }, () => d.ask([{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg(doc, p, prev, nx) }]));
        out.usd += res?.usage?.promptTokens != null || res?.usage?.completionTokens != null ? calculateCost(JUDGE_MODEL, res.usage.promptTokens || 0, res.usage.completionTokens || 0) : EST_USD_PER_PARA;
        if (out.creditWait && !out.creditWait.resolvedAt) out.creditWait.resolvedAt = d.now().toISOString();
        out.done++;
        const list = parsePremises(res?.content);
        if (!list) { out.unparsed++; return; }
        let kept = 0;
        for (const x of list) {
          if (spanPresent(x.proof, [p.text]) !== true || !x.premise) { out.unverified++; out.dropped.push({ docId: doc.id ?? p.doc_id, title: doc.title, paraId: p.id, ord: p.ord, text: String(p.text).slice(0, TEXT_CAP), premise: x?.premise, concept: x?.concept, basis: x?.basis, implies: x?.implies || '', questions: Array.isArray(x?.questions) ? x.questions : [], proof: x?.proof, why: x?.why, strength: x?.strength, reason: 'proof-not-found' }); continue; }
          kept++; out.byConcept[x.concept] = (out.byConcept[x.concept] || 0) + 1;
          out.premises.push({ docId: doc.id ?? p.doc_id, title: doc.title, paraId: p.id, ord: p.ord, text: String(p.text).slice(0, TEXT_CAP), premise: x.premise, concept: x.concept, basis: x.basis, implies: x.implies || '', questions: (Array.isArray(x.questions) ? x.questions : []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 3), proof: x.proof, why: x.why, strength: x.strength });
        }
        if (kept) out.withPremises++;
        return;
      } catch (e) {
        // no credit is a WAIT, never a failure: the same paragraph is offered again
        if (isCreditRefusal(e)) {
          if (!out.creditWait || out.creditWait.resolvedAt) { out.creditWait = { since: d.now().toISOString(), probes: 0 }; await d.log('premise', 'premise-pilot: Anthropic has no credit — waiting in place'); }
          out.creditWait.probes++;
          if (await d.draining()) { out.stop = 'yielded'; return; }
          await d.sleep(Math.max(1000, Math.min(isSpendCap(e) ? e.retryAfterMs ?? CREDIT_WAIT_MS : CREDIT_WAIT_MS, CREDIT_WAIT_MS)));
          continue;
        }
        if (isSpendCap(e)) { out.stop = 'cap'; out.capReason = String(e.message).slice(0, 200); return; }   // a daily cap: quiet stop, the run is rerunnable
        out.errors++; return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, async () => { while (next < work.length && !out.stop) await one(work[next++]); }));

  const status = out.stop === 'budget' ? 'budget' : out.stop === 'cap' ? 'cap' : out.stop === 'yielded' ? 'yielded' : 'complete';
  const result = { status, ...plan, usd: r4(out.usd), analysed: out.done, withPremises: out.withPremises, premises: out.premises, unverified: out.unverified, dropped: out.dropped, unparsed: out.unparsed, errors: out.errors, byConcept: out.byConcept, ...(out.capReason ? { capReason: out.capReason } : {}), ...(out.creditWait ? { creditWait: out.creditWait } : {}) };
  try { result.file = d.writeRun(`premise-pilot-${d.now().toISOString().replace(/[:.]/g, '-')}.json`, result); } catch (e) { result.fileError = String(e?.message || e).slice(0, 120); }
  await d.log('premise', `premise-pilot ${status}: ${out.done}/${work.length} ¶, ${out.premises.length} premises in ${out.withPremises} ¶, ${out.unverified} unverified, $${r4(out.usd)}`);
  return result;
}
