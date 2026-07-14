// entities/claims — extract cited biographical CLAIMS from disambiguated paragraphs. For each named person the
// paragraph asserts about, the model returns {subject,relation,object,proof,when}; a claim survives only if its
// proof span is copied VERBATIM from the paragraph (the proof gate — no anonymous facts). Identity is DEFERRED
// (subject/object entity ids null; reconcile binds by evidence). Written English-canonical; proof stays verbatim
// in the source language. CONTINUATION-ON-TRUNCATION: a genealogically dense paragraph emits more claims than one
// call holds, so we keep asking for the remainder until the model closes cleanly. Gated on disambiguation.
import { createHash } from 'node:crypto';
import { assertDisambiguated } from '../kernel/gate.js';
import { profileFor } from '../kernel/profile.js';
import { pool } from '../kernel/run.js';

const DEFAULT_RELATIONS = 'born, died, martyred, converted-by, father-of, son-of, brother-of, wife-of, teacher-of, disciple-of, met, accompanied, participated-in, resided-in, appointed, wrote, titled, related-to';

export async function run(ctx, docId, opts = {}) {
  await assertDisambiguated(ctx, docId, { threshold: opts.threshold ?? 0.99 });
  const version = opts.version ?? ctx.config.versions?.disambig ?? 'disambig-v1';
  const extractor = opts.extractor ?? ctx.config.versions?.extract ?? 'extract-v2';
  const batch = opts.batch ?? extractor;
  const profile = await profileFor(ctx, docId);
  const relations = (await ctx.store.getRelations?.()) || [];
  const relKeys = new Set(relations.map((r) => r.key));
  const relList = relations.map((r) => r.key).join(', ') || DEFAULT_RELATIONS;
  let paras = (await ctx.store.getParagraphs(docId)).filter((p) => p.context && p.contextModel === version && (p.kind ?? 'paragraph') === 'paragraph');
  // RESUME: only process paragraphs that don't already have claims — a re-run cheaply fills gaps (crash / earlier
  // throttle) instead of re-doing the whole book. (INSERT OR IGNORE already dedups, but this skips the model calls.)
  if (opts.resume) { const done = new Set((await ctx.store.getClaimedParaIds?.(docId)) || []); paras = paras.filter((p) => !done.has(p.pid)); }
  const system = buildSystem(profile, relList);
  const route = { model: opts.model ?? profile.models.extract, fallback: opts.fallback ?? profile.fallback };
  // maxTokens is a CAP, not a target — a high cap costs nothing on simple paragraphs (the model stops when
  // done) but PREVENTS the truncation→continuation thrash on dense ones. deepseek-v4-flash IS a reasoning
  // model (returns reasoning_content that counts against max_tokens), so a 3000 cap starved the JSON answer →
  // finish=length → up to 5 slow continuation calls/para. Give each model its full output headroom instead.
  const maxTokens = (m) => Math.min(ctx.catalog.get(m)?.maxOutput ?? 4096, 8000);
  const stats = { paras: paras.length, claims: 0, written: 0, dropped: 0, empty: 0, failed: 0, escalated: 0, continued: 0 };

  // BATCHED, resilient writes: accumulate claim rows and flush in chunks instead of one write per paragraph.
  // Per-paragraph writes flooded the single writer (:7849) on dense books — the queue backed up until a write
  // headers-timed-out UNCAUGHT and crashed the whole run. Batching cuts writer round-trips ~15× (less contention,
  // fewer timeouts, faster). A flush failure is CAUGHT (never crashes the run): those paragraphs stay un-claimed
  // and a cheap `--resume` re-does only them (claims are idempotent per paragraph, so no partial/duplicate risk).
  // 20 rows ≈ a handful of paragraphs — small enough that the progress %'s within-stage fraction climbs in fine steps
  // (not ~40% jumps), still ~10× fewer writer round-trips than per-paragraph, so no contention/timeout regression.
  const FLUSH_ROWS = 20;
  const buf = [];
  const flush = async () => {
    if (opts.dryRun || !buf.length) return;
    const rows = buf.splice(0, buf.length);                          // synchronous splice → safe under the async pool
    try { stats.written += await ctx.store.saveClaims(rows); }
    catch (e) { if (e?.fatal) throw e; stats.writeFailed = (stats.writeFailed || 0) + rows.length; ctx.log.warn?.({ err: e?.message, rows: rows.length }, 'claims write failed — paragraphs left for --resume'); }
  };
  await pool(opts.concurrency ?? 5, paras, async (p) => {
    const { claims, escalated, continued, errored } = await extractAll(ctx, { system, baseUser: buildUser(p), route, maxTokens });
    if (escalated) stats.escalated++;
    stats.continued += continued;
    if (!claims.length) { if (errored) stats.failed++; else stats.empty++; return; }
    const era = eraOf(p.context), textNorm = proofNorm(p.text);
    for (const c of claims) {
      stats.claims++;
      if (!c.subject || !c.relation || !c.proof || !proofPresent(c.proof, textNorm)) { stats.dropped++; continue; }
      buf.push(claimRow(c, { docId, pid: p.pid, era, relKeys, methodVersion: version, extractor, batch }));
    }
    if (buf.length >= FLUSH_ROWS) await flush();
  });
  await flush();                                                     // final partial batch
  ctx.log.info?.({ docId, ...stats }, 'entities/claims');
  return stats;
}

// Continuation + escalation loop. Try the primary model, keep continuing while the reply is truncated
// (finish=length) and still adding claims; escalate to the fallback if the primary yields nothing.
async function extractAll(ctx, { system, baseUser, route, maxTokens }) {
  const models = route.model === route.fallback ? [route.model] : [route.model, route.fallback];
  let continued = 0, gotResponse = false;
  for (const model of models) {
    const claims = [], seen = new Set();
    let user = baseUser, complete = false;
    for (let cont = 0; cont < 5; cont++) {
      let res;
      try { res = await ctx.model.retry(() => ctx.model.callModel({ model, system, user, maxTokens: maxTokens(model), json: true })); } catch (e) { if (e?.fatal) throw e; break; }
      gotResponse = true;                                            // distinguishes a transient error from a genuine empty
      let added = 0;
      for (const c of parseClaims(res.content || '')) {
        const k = `${c.subject}|${c.relation}|${c.object}`;
        if (!seen.has(k)) { seen.add(k); claims.push(c); added++; }
      }
      if (res.finishReason !== 'length') { complete = true; break; } // model closed the JSON → done
      if (added === 0) break;                                        // truncated but nothing new → stop
      continued++;
      user = `${baseUser}\n\nYou already listed these (do NOT repeat them): ${[...seen].slice(-50).join(' ; ')}\nContinue with the REMAINING claims ONLY, as JSON {"claims":[...]}.`;
    }
    if (complete || claims.length) return { claims, escalated: model !== route.model, continued, errored: false };
  }
  return { claims: [], escalated: false, continued, errored: !gotResponse };  // errored: every call threw (transient) — recoverable
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

// Pull COMPLETE flat claim objects even from a JSON array truncated mid-stream (dense paragraphs).
export function parseClaims(raw) {
  const out = [];
  for (const o of String(raw).match(/\{[^{}]*\}/g) || []) {
    try { const j = JSON.parse(o); if (j && (j.subject || j.proof)) out.push(j); } catch { /* partial object */ }
  }
  return out;
}

const proofNorm = (s) => String(s || '').replace(/\s+/g, ' ').toLowerCase().trim();
// The proof gate: the span must be a real, ≥8-char verbatim substring of the paragraph.
export function proofPresent(proof, paragraphNorm) {
  const p = proofNorm(proof);
  return p.length > 8 && paragraphNorm.includes(p.slice(0, 120));
}

const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const eraOf = (context) => { const m = String(context).match(/@[^—]*—/); return m ? m[0].replace(/^@/, '').replace(/—$/, '').trim() : ''; };

// Map a validated claim to the stored row shape. entity_id / target_entity_id stay null (deferred). The
// semantic_key is reword-robust (normalized subject|relation|object|para); the claim_hash is its content id.
export function claimRow(c, { docId, pid, era, relKeys, methodVersion, extractor, batch }) {
  const rel = relKeys.has(c.relation) ? c.relation : 'related-to';
  const when = c.when || era;
  const timeBasis = /\[pin/i.test(when) ? 'pin' : /\[est/i.test(when) ? 'estimate' : (era ? (/\[pin/i.test(era) ? 'pin' : 'estimate') : null);
  const year = (String(when).match(/\b(1[678]\d{2})\b/) || [])[1] || null;
  const semanticKey = `${nrm(c.subject)}|${rel}|${nrm(c.object)}|${pid}`;
  const statement = `${c.subject} — ${c.relation}${c.object ? ' ' + c.object : ''}`.slice(0, 300);
  return {
    claimHash: sha(`${docId}|${pid}|${semanticKey}`), relation: rel, statement,
    proofVerbatim: String(c.proof).slice(0, 240), docId, paraId: pid,
    timeValue: year, timePrecision: year ? 'year' : null, timeBasis, timeAnchor: String(when).slice(0, 160),
    semanticKey, methodVersion, extractor, confidence: 0.7, status: 'supported', proofOk: 1, batch,
  };
}

// ── Prompt (pure) ────────────────────────────────────────────────────────────

const LANG_NAME = { en: 'English', fa: 'Persian', ar: 'Arabic', he: 'Hebrew' };

export function buildSystem(profile, relList) {
  const lang = LANG_NAME[profile.lang] || profile.lang;
  const foreign = profile.lang !== 'en'
    ? `\nThe paragraph is in ${lang}; the NOTE is English. Write subject / relation / object / statement in ENGLISH (canonical names from the NOTE) — but the "proof" span must be copied VERBATIM from the ${lang} paragraph.` : '';
  return `Extract cited biographical CLAIMS from ONE paragraph of a historical narrative. You get the paragraph and a NOTE that resolves who-is-who and the place/era. For each NAMED PERSON, list the factual claims the paragraph ASSERTS about them.${foreign}
Rules:
• subject = the person's resolved canonical name FROM THE NOTE (never a bare pronoun).
• relation = the single best-fitting key from RELATIONS; if none fits use "related-to".
• object = the other entity (person/place/work) or a short literal value.
• DIRECTION (critical) — the subject DOES the relation; the object is what it is done TO. Read "subject relation object" back: it must match what the paragraph asserts. Passive voice moves the doer — "X was killed/attacked/exiled/opposed/persecuted/betrayed by Y", "at the hands of Y", "Y arose/rose against X", "X suffered under Y" all make Y the AGENT: put Y as subject (or, ONLY if a passive relation key such as "converted-by"/"condemned-by" fits, keep X as subject with that passive key). NEVER make the victim the doer. Why: "He was assailed by the Covenant-breakers" is NOT "He persecuted the Covenant-breakers." Ex: "‘Abdu'l-Bahá was assailed on every side by the Covenant-breakers" ⇒ {Covenant-breakers, opposed, ‘Abdu'l-Bahá} — never {‘Abdu'l-Bahá, persecuted, Covenant-breakers}.
• proof = a span copied VERBATIM and EXACTLY from the paragraph (≤200 chars) that supports the claim AND its direction — include the "by …" / negation words; do not cut mid-clause so the meaning flips. If you cannot copy an exact, self-contained supporting span, OMIT the claim.
• when = copy the note's era for this scene (keep its "[pin: …]"/"[est: …]" tag); a more specific date only if stated.
• ONLY narrator-asserted FACTS — no outside knowledge, and NOT what a party merely CLAIMS. An accusation, boast, rumour, or assertion ATTRIBUTED to someone (especially an adversary — "the Covenant-breakers claimed…", "his enemies alleged…") is not a fact about the target; skip it, along with negated / hypothetical / questioned statements. Why: a hostile party's slander is evidence of the slander, not of the target's conduct. Capture LOAD-BEARING facts (birth, death/martyrdom w/ place+cause, kinship, conversion, teacher/disciple, office/title, participation, authorship, meetings, journeys), NOT narrative colour. The object must be a CONCRETE named entity or substantive value — skip vague/anaphoric objects. At most ONE characterised-as per person.
RELATIONS: ${relList}
Return ONLY JSON: {"claims":[{"subject":"..","relation":"..","object":"..","proof":"..","when":".."}]}`;
}

export function buildUser(p) {
  return `NOTE: ${p.context}\n\nPARAGRAPH [${p.pid}]:\n${p.text}`;
}
