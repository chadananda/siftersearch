// Premise RECONCILE (Chad 11-11): per concept, check a premise-pilot result's entries against core anchor passages that address the concept
// explicitly → one framing (the teaching with its distinctions) + a verdict per entry (keep | rescope | drop). Ops job `premise-reconcile`
// { maxUsd, file?, dry? }. Same budget key/caller/stage as premise-pilot (anthropic-policy unchanged). Writes data/run/premise-reconcile-<ts>.json.
// Anchors: search.js hybridSearch (Bahá'í, Qdrant-routed) post-filtered to authority.js doctrinalTier core. Deps all injectable.
import fs from 'node:fs';
import path from 'node:path';
import { withAIContext } from '../ai-context.js';
import { JUDGE_MODEL } from './hype-rubric.js';
import { BUDGET_KEY, TEXT_CAP, CONCEPTS, spanPresent } from './premise-pilot.js';
export { spanPresent };
import { calculateCost } from '../model-registry.js';
import { isCreditRefusal, isSpendCap, CREDIT_WAIT_MS } from '../spend-caps.js';

export const MAX_ANCHORS = 8, CHUNK = 30, CONCURRENCY = 3, PARA_CAP = 2500;
// ESTIMATE (Sonnet 4.6 sync, $3/$15 per M): per call ≈ 2.6k in (prompt + 8 anchors) + 570 in / 70 out per entry (120 premise+proof, ~450 the whole paragraph, capped at 2500 chars) + 300 out for the framing
export const EST_IN_BASE = 2600, EST_IN_PER_ENTRY = 570, EST_OUT_BASE = 300, EST_OUT_PER_ENTRY = 70;
export const estCall = (n) => (EST_IN_BASE + EST_IN_PER_ENTRY * n) * 3e-6 + (EST_OUT_BASE + EST_OUT_PER_ENTRY * n) * 15e-6;
// extra search words per concept (query = label + these); unknown/other concepts search the label alone
export const SYNONYMS = {
  'human nature (noble vs. corrupt)': ['man two natures lower higher', 'created noble'],
  'source of rights (divine vs. state-granted)': ['rights bestowed by God', 'human rights'],
  'limits of sovereign/state power': ['duty of kings and rulers', 'tyranny oppression'],
  'just and unjust taxation': ['taxes tribute subjects', 'exactions of rulers'],
  'private property': ['possessions ownership', 'wealth acquired'],
  'moral status of the unborn / right to life': ['the embryo soul', 'life of the child in the womb'],
  'justice (ʿadl) and equity (inṣáf)': ['justice is the best beloved', 'equity fairness'],
  'equality before the law': ['equal in the sight of the law', 'oneness of mankind'],
  'rule of law and accountability of rulers': ['rulers accountable to God', 'laws of the land'],
  'consultation and consent of the governed': ['consultation', 'elected representatives'],
  'freedom of conscience and religion': ['independent investigation of truth', 'liberty of conscience'],
  'extremes of wealth and poverty / economic justice': ['rich and poor', 'distribution of wealth'],
  'punishment, mercy and the purpose of penalties': ['penalty for crime', 'mercy and forgiveness'],
  'individual rights vs. the common good': ['welfare of the community', 'rights of the individual'],
  'war, peace and collective security': ['collective security', 'universal peace'],
  'rights and duties of women': ['equality of men and women', 'education of girls'],
  'education as a right': ['universal education', 'education compulsory'],
  'the family and inheritance': ['inheritance', 'marriage and the family'],
  'religion and the state': ['religion and government', 'separation of church and state'],
  'work as worship / labour and capital': ['work in the spirit of service is worship', 'profit sharing labour'],
};
export const SYSTEM = `You reconcile PREMISES that were each inferred from ONE passage with what the religion's core texts say EXPLICITLY on the same concept.
You get the CONCEPT, ANCHOR passages (core texts that address it directly), and ENTRIES (id, premise, proof) grouped under the whole PARAGRAPH each was inferred from.
Authority order: Bahá'u'lláh and the Báb > 'Abdu'l-Bahá > Shoghi Effendi > others. An explicit statement outranks an inference.
1. Write "framing": the teaching as the texts frame it, WITH its distinctions (for example: man has two natures, a lower material one and a higher spiritual potential one; a statement about the noble station must not be ascribed to the lower nature). 2-5 sentences, plain words. Use only the anchors and entries; never invent doctrine they do not contain.
2. "framingProof": [{"anchorId":"a1","words":"..."}] words copied EXACTLY from the anchor texts that the framing rests on.
3. For every ENTRY give a verdict, judged against the WHOLE paragraph, not the proof words alone (read what the paragraph makes it conditional on):
- "keep": consistent with the framing and scoped to what the paragraph addresses.
- "rescope": true only of one aspect, rewrite "premise" to name it. A paragraph that speaks of a POTENTIAL, a station humans are CALLED to, or a condition ("whosoever turneth unto this Countenance shall manifest the potentialities of that inborn nature, and whosoever remaineth veiled shall be deprived") MUST be rescoped to say so; never state it as a fact about people as they are.
- "drop": overreach, or contradicts the framing. An "implies" that follows by plain reasoning (a lesser right granted implies the greater; a ruler rebuked for taking what was never his) is NOT overreach: keep it unless the framing contradicts it.
- "move": the premise is sound but belongs to a different concept; give "concept" (copy one from the CONCEPTS list below, or "other: <short label>"). Wrong concept is NOT overreach.
Name the speaker by the station the work gives him. When Bahá'u'lláh or the Báb (or Christ, Muhammad, Moses) changes or abolishes a law, that is a Manifestation of God founding a new religion: the Kitáb-i-Íqán teaches that every universal Manifestation renews religion by sweeping away the outdated laws, rules and social norms of past dispensations. Say so; never reduce Him to "a religious authority" or "a religious leader". A premise that says otherwise is rescoped.
Human nature: good is inherent in every person as a POTENTIAL. Never say people are naturally oriented or inclined toward the good or toward God: a child is born selfish and animal, and turning to God and freedom from animal impulses is attained, not initial or natural, though it is assured as possible for all. A premise that says otherwise is rescoped.
If your "reason" names something the premise's wording gets wrong or leaves out (who is speaking, a condition), the verdict is "rescope" with the premise rewritten, never "keep".
Keep the passage's OWN terms. If it says love of God, detachment from all save Him, turning unto God, say exactly that; never abstract it into a vaguer category ("moral conduct", "spiritual qualities", "values", "worth", "virtue"). A generalised premise loses what the passage is about. Any wider bearing on modern debates goes only in "implies". A premise that abstracts the passage's terms is rescoped back to them.
Never assign a faculty or quality (reason, will, love…) to the higher or the lower nature unless an anchor or the paragraph says so.
"reason" is one short sentence.
CONCEPTS:
${CONCEPTS.map((c) => `- ${c}`).join('\n')}
Reply with JSON only: {"framing":"...","framingProof":[...],"verdicts":[{"id":"e1","verdict":"keep|rescope|drop|move","premise":"only when rescope","concept":"only when move","reason":"..."}]}`;
const r4 = (n) => Math.round(n * 10000) / 10000;
const userMsg = (concept, anchors, entries, framing) => `CONCEPT: ${concept}\n\n${framing ? `FRAMING ALREADY ESTABLISHED (use it as given; keep "framing" the same and judge only these entries):\n${framing}\n\n` : ''}ANCHORS:\n${anchors.map((a) => `[${a.id}] ${a.title}${a.author ? ` — ${a.author}` : ''}\n${a.text}`).join('\n\n') || '(none found)'}\n\nENTRIES (grouped by paragraph):\n${paraGroups(entries).map((g) => `PARAGRAPH — ${g[0].title} ¶${g[0].ord}:\n${String(g[0].fullText || g[0].text || '').slice(0, PARA_CAP)}\n${g.map((e) => `  [${e.id}] premise: ${e.premise}${e.implies ? `\n      implies: ${e.implies}` : ''}\n      proof: ${e.proof}`).join('\n')}`).join('\n\n')}`;
/** entries → arrays sharing one paragraph (docId + paraId), so each paragraph's text is sent once per call. */
export const paraGroups = (entries) => [...entries.reduce((m, e) => { const k = `${e.docId}:${e.paraId}`; (m.get(k) || m.set(k, []).get(k)).push(e); return m; }, new Map()).values()];

/** The reply text → {framing, framingProof, verdicts} or null. */
export function parseReconcile(text) {
  const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  let v; try { v = JSON.parse(s.slice(a, b + 1)); } catch { return null; }
  return v && Array.isArray(v.verdicts) ? { framing: String(v.framing || ''), framingProof: Array.isArray(v.framingProof) ? v.framingProof : [], verdicts: v.verdicts.filter((x) => x && typeof x === 'object') } : null;
}

/** entries → [{concept, entries}] grouped by concept (ids e1…); an "other: …" concept with fewer than 2 entries is skipped. */
export function groupByConcept(entries) {
  const m = new Map(), skipped = [];
  entries.forEach((e, i) => { const x = { ...e, id: `e${i + 1}` }; (m.get(e.concept) || m.set(e.concept, []).get(e.concept)).push(x); });
  const groups = [];
  for (const [concept, list] of m) { if (String(concept).startsWith('other') && list.length < 2) skipped.push(...list); else groups.push({ concept, entries: list }); }
  return { groups, skipped };
}
export const chunk = (list, n = CHUNK) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n));

async function defaults(over) {
  return {
    // core anchors: Bahá'í hybrid search (Qdrant-routed), over-fetched then kept only where doctrinalTier says core (paragraph's own writer decides)
    search: async (query) => (await import('../search.js')).hybridSearch(query, { limit: 40, filters: { religion: "Baha'i" } }),
    isCore: async (h) => (await import('../authority.js')).doctrinalTier({ religion: h.religion || "Baha'i", collection: h.collection, title: h.title, author: h.doc_author || h.author }, { author: h.author }) === 'core',
    // whole paragraph by doc (docs-repo getParagraphs, as premise-pilot reads them)
    paragraphs: async (docId) => (await import('../docs-repo.js')).getParagraphs(docId),
    readRun: (f) => { const dir = path.join(process.cwd(), 'data', 'run'); const name = f ? path.basename(f) : fs.readdirSync(dir).filter((n) => /^premise-pilot-.*\.json$/.test(n)).sort().pop(); if (!name) return null; return { name, ...JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) }; },
    ask: async (messages, o) => (await import('../ai.js')).chatCompletion(messages, { provider: 'anthropic', model: JUDGE_MODEL, temperature: 0, maxTokens: 8000, ...o }),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    draining: async () => (await import('../drain.js')).isDraining(),
    log: async (kind, text) => (await import('../repos/activity-repo.js')).logActivity(kind, text),
    writeRun: (name, obj) => { const dir = path.join(process.cwd(), 'data', 'run'); fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, name); fs.writeFileSync(f, JSON.stringify(obj, null, 1)); return f; },
    now: () => new Date(),
    ...over,
  };
}

export async function premiseReconcileJob(params = {}, deps = {}) {
  const d = await defaults(deps);
  const maxUsd = Number(params.maxUsd);
  if (!(maxUsd > 0)) return { status: 'error', error: 'maxUsd required (> 0)' };
  const src = d.readRun(params.file);
  if (!src?.premises?.length) return { status: 'error', error: 'no premise-pilot result with premises found' };
  const { groups, skipped } = groupByConcept(src.premises);
  const estUsd = r4(groups.reduce((s, g) => s + chunk(g.entries).reduce((t, c) => t + estCall(c.length), 0), 0));
  const plan = { source: src.name || params.file, entries: src.premises.length, concepts: groups.length, skippedEntries: skipped.length, estUsd, maxUsd, estimate: `per call ${EST_IN_BASE}+${EST_IN_PER_ENTRY}/entry in, ${EST_OUT_BASE}+${EST_OUT_PER_ENTRY}/entry out at Sonnet 4.6 sync $3/$15 per M` };
  if (params.dry || params.dryRun) return { dryRun: true, ...plan };

  const out = { usd: 0, stop: null, errors: [], creditWait: null }, concepts = [], verdictOf = new Map();
  // the whole paragraph of every entry (the pilot file keeps only 600 chars); a doc that can't be read falls back to that excerpt
  const full = new Map();
  for (const docId of new Set(groups.flatMap((g) => g.entries.map((e) => e.docId)))) {
    try { for (const p of await d.paragraphs(docId)) full.set(`${docId}:${p.id}`, p.text); } catch (e) { out.errors.push(`paragraphs ${docId}: ${String(e?.message || e).slice(0, 80)}`); }
  }
  for (const g of groups) for (const e of g.entries) e.fullText = full.get(`${e.docId}:${e.paraId}`) || e.text;
  const call = async (concept, anchors, entries, framing) => {
    for (;;) {
      if (out.stop) return null;
      if (out.usd + estCall(entries.length) > maxUsd) { out.stop = 'budget'; return null; }
      try {
        const res = await withAIContext({ billTo: BUDGET_KEY, stage: 'hype-judge', caller: BUDGET_KEY }, () => d.ask([{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg(concept, anchors, entries, framing) }]));
        out.usd += res?.usage?.promptTokens != null || res?.usage?.completionTokens != null ? calculateCost(JUDGE_MODEL, res.usage.promptTokens || 0, res.usage.completionTokens || 0) : estCall(entries.length);
        if (out.creditWait && !out.creditWait.resolvedAt) out.creditWait.resolvedAt = d.now().toISOString();
        return parseReconcile(res?.content);
      } catch (e) {
        // no credit is a WAIT, never a failure: the same call is offered again
        if (isCreditRefusal(e)) {
          if (!out.creditWait || out.creditWait.resolvedAt) { out.creditWait = { since: d.now().toISOString(), probes: 0 }; await d.log('premise', 'premise-reconcile: Anthropic has no credit — waiting in place'); }
          out.creditWait.probes++;
          if (await d.draining()) { out.stop = 'yielded'; return null; }
          await d.sleep(Math.max(1000, Math.min(isSpendCap(e) ? e.retryAfterMs ?? CREDIT_WAIT_MS : CREDIT_WAIT_MS, CREDIT_WAIT_MS)));
          continue;
        }
        if (isSpendCap(e)) { out.stop = 'cap'; out.capReason = String(e.message).slice(0, 200); return null; }
        out.errors.push(`${concept}: ${String(e?.message || e).slice(0, 120)}`); return null;
      }
    }
  };
  const one = async ({ concept, entries }) => {
    // anchors: concept label + synonyms, core only, deduped, best first
    const seen = new Map();
    for (const q of [concept.replace(/^other:\s*/, ''), ...(SYNONYMS[concept] || [])]) {
      let hits = []; try { hits = (await d.search(q))?.hits || []; } catch (e) { out.errors.push(`${concept}: anchor search ${String(e?.message || e).slice(0, 80)}`); }
      for (const h of hits) { const k = h.id ?? h.paragraph_id ?? h.text; if (seen.size < MAX_ANCHORS && !seen.has(k) && String(h.text || '').trim() && await d.isCore(h)) seen.set(k, h); }
    }
    const anchors = [...seen.values()].map((h, i) => ({ id: `a${i + 1}`, title: h.title, author: h.author, text: String(h.text).slice(0, TEXT_CAP * 2) }));
    let framing = null, framingProof = [], unverifiedFraming = [];
    for (const part of chunk(entries)) {
      const r = await call(concept, anchors, part, framing);
      if (!r) { if (!out.stop) out.errors.push(`${concept}: unparsed reply`); if (out.stop) break; continue; }
      if (framing == null) {
        framing = r.framing; framingProof = r.framingProof;
        unverifiedFraming = framingProof.filter((f) => spanPresent(f?.words, [anchors.find((a) => a.id === f?.anchorId)?.text ?? '']) !== true);
      }
      for (const v of r.verdicts) verdictOf.set(v.id, v);
    }
    const counts = { keep: 0, rescope: 0, drop: 0, move: 0 };
    for (const e of entries) { const v = verdictOf.get(e.id); if (v && counts[v.verdict] != null) counts[v.verdict]++; }
    concepts.push({ concept, framing, framingProof, ...(unverifiedFraming.length ? { framingUnverified: unverifiedFraming } : {}), anchors: anchors.map((a) => ({ ...a, text: a.text.slice(0, TEXT_CAP) })), counts });
  };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, groups.length) }, async () => { while (next < groups.length && !out.stop) await one(groups[next++]); }));

  const entries = src.premises.map((e, i) => {
    const id = `e${i + 1}`, v = verdictOf.get(id), skip = skipped.some((s) => s.id === id);
    if (!v || !['keep', 'rescope', 'drop', 'move'].includes(v.verdict)) return { ...e, id, verdict: skip ? 'skipped' : 'unjudged', newPremise: e.premise, reason: skip ? 'single other-concept entry' : 'no verdict' };
    return { ...e, id, verdict: v.verdict, newPremise: v.verdict === 'rescope' && v.premise ? v.premise : e.premise, reason: v.reason || '', ...(v.verdict === 'move' ? { movedTo: v.concept || null } : {}) };
  });
  const status = out.stop === 'budget' ? 'budget' : out.stop === 'cap' ? 'cap' : out.stop === 'yielded' ? 'yielded' : 'complete';
  const result = { status, ...plan, usd: r4(out.usd), concepts, entries, errors: out.errors, ...(out.capReason ? { capReason: out.capReason } : {}), ...(out.creditWait ? { creditWait: out.creditWait } : {}) };
  try { result.file = d.writeRun(`premise-reconcile-${d.now().toISOString().replace(/[:.]/g, '-')}.json`, result); } catch (e) { result.fileError = String(e?.message || e).slice(0, 120); }
  const c = (v) => entries.filter((e) => e.verdict === v).length;
  await d.log('premise', `premise-reconcile ${status}: ${concepts.length} concepts, keep ${c('keep')} rescope ${c('rescope')} drop ${c('drop')} move ${c('move')}, $${r4(out.usd)}`);
  return result;
}
