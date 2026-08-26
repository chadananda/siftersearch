// concepts/extract — lift concepts to first-class claims. For the significant concepts/symbols a passage
// develops, extract cited doctrinal claims (concept → what it teaches/means), each gated by a VERBATIM proof
// span. Concept identity is DEFERRED (concept_id null; reconcile binds it against the interpretive lexicon).
// English-canonical concept names; the original-language ROOT captured where identifiable; proof stays
// verbatim in the source language. Gated on disambiguation. Mirrors entities/claims (proof-gate + deferral).
import { createHash } from 'node:crypto';
import { assertDisambiguated } from '../kernel/gate.js';
import { profileFor } from '../kernel/profile.js';
import { pool } from '../kernel/run.js';
import { buildBilingualSystem, buildBilingualUser } from './bilingual.js';

export async function run(ctx, docId, opts = {}) {
  await assertDisambiguated(ctx, docId, { threshold: opts.threshold ?? 0.98 });
  // ACCEPT EITHER DISAMBIGUATION. concepts/disambiguate is documented as "an ALTERNATIVE gate for doctrinal
  // works, not a second pass" and writes to the SAME context column — but it stamps 'concept-disambig-v1'
  // while this stage filtered for 'deepseek-disambig-v1' alone. So the concept track's own disambiguation
  // produced notes its own extractor silently skipped, leaving `paras: 0` on a fully-noted book: a stage
  // that reports success having read nothing. Same open-producer/closed-consumer shape as the heading
  // whitelist and the phrase re-rank. Verified 2026-08-26.
  const version = opts.version ?? ctx.config.versions?.disambig ?? 'disambig-v1';
  const conceptVersion = ctx.config.versions?.conceptDisambig ?? 'concept-disambig-v1';
  const acceptedVersions = new Set([version, conceptVersion]);
  const extractor = opts.extractor ?? ctx.config.versions?.conceptExtract ?? 'concept-extract-v1';
  const batch = opts.batch ?? extractor;
  const profile = await profileFor(ctx, docId);
  let paras = (await ctx.store.getParagraphs(docId))
    .filter((p) => p.context && acceptedVersions.has(p.contextModel) && (p.kind ?? 'paragraph') === 'paragraph');
  if (opts.limit) paras = paras.slice(0, opts.limit);          // small reviewed slices before a full run
  const system = buildSystem(profile);
  // BILINGUAL WHERE WE HAVE IT. A paragraph carrying its aligned original is read with BOTH texts in view:
  // the original fixes WHICH TERM (English collapses Ṣalát/Duʿá/Dhikr into "prayer", ʿadl/inṣáf into
  // "justice"), and an authorised rendering fixes WHICH SENSE. Per paragraph, not per book — a book's
  // alignment is never complete, and a paragraph without one must degrade honestly rather than be skipped.
  // Built PER AUTHORITY, not once: whose rendering the English is decides which text governs, so a doc whose
  // paragraphs carry different authorities must not share one prompt.
  const docMeta = await ctx.store.getDocMeta(docId);
  const systemFor = new Map();
  const bilingualSystemFor = (authority) => {
    if (!systemFor.has(authority)) systemFor.set(authority, buildBilingualSystem(profile, docMeta, { translationAuthority: authority }));
    return systemFor.get(authority);
  };
  const route = { model: opts.model ?? profile.models.extract, fallback: opts.fallback ?? profile.fallback };
  const maxTokens = (m) => (ctx.catalog.get(m)?.capabilities?.includes('reasoning') ? 6000 : 3000);
  const stats = { paras: paras.length, claims: 0, written: 0, dropped: 0, failed: 0, escalated: 0, bilingual: 0 };
  // A bare `paras: 0` is indistinguishable from "this book has no concepts". Name the reason.
  if (!paras.length) {
    const all = await ctx.store.getParagraphs(docId);
    stats.skippedReason = all.length
      ? `no paragraph carries an accepted disambiguation note (${[...acceptedVersions].join(' | ')}); run disambiguate first`
      : 'document has no prose paragraphs';
  }

  const rows = [];   // dry-run review buffer only
  // Write INCREMENTALLY per paragraph so a long run is resilient (a crash keeps prior work) and observable.
  await pool(opts.concurrency ?? 5, paras, async (p) => {
    const hasOriginal = Boolean(p.original);
    // Declare the ORIGINAL's language for this paragraph, so the spend policy can see the actual capability
    // case: deepseek cannot read Persian at all. Without this the gate has only the DOC's language (English)
    // and refuses the very call the exception exists to permit.
    const { withAIContext } = await import('../../ai-context.js');
    const { parsed, escalated } = await withAIContext(
      { stage: 'concept-extract', docId, originalLang: hasOriginal ? (p.originalLang ?? null) : null },
      () => ctx.model.runLadder({
      route,
      system: hasOriginal ? bilingualSystemFor(p.translationAuthority ?? null) : system,
      user: hasOriginal
        ? buildBilingualUser(p, { source: p.original, translation: p.text })
        : buildUser(p),
      parse: parseConceptClaims, maxTokens }));
    if (hasOriginal) stats.bilingual++;
    if (escalated) stats.escalated++;
    if (!parsed || !parsed.length) { stats.failed++; return; }
    const textNorm = proofNorm(p.text);
    const paraRows = [];
    for (const c of parsed) {
      stats.claims++;
      if (!c.concept || !c.relation || !c.proof || !conceptProofOk(c.proof, textNorm)) { stats.dropped++; continue; }
      paraRows.push(conceptClaimRow(c, { docId, pid: p.pid, methodVersion: version, extractor, batch }));
    }
    if (opts.dryRun) rows.push(...paraRows);
    else if (paraRows.length) stats.written += await ctx.store.saveConceptClaims(paraRows);
  });
  ctx.log.info?.({ docId, ...stats }, 'concepts/extract');
  return opts.dryRun ? { ...stats, written: 0, rows } : stats;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function parseConceptClaims(raw) {
  const out = [];
  for (const o of String(raw).match(/\{[^{}]*\}/g) || []) {
    try { const j = JSON.parse(o); if (j && (j.concept || j.proof)) out.push(j); } catch { /* partial */ }
  }
  return out;
}

const proofNorm = (s) => String(s || '').replace(/\s+/g, ' ').toLowerCase().trim();
export function conceptProofOk(proof, paragraphNorm) {
  const p = proofNorm(proof);
  return p.length > 8 && paragraphNorm.includes(p.slice(0, 120));
}

const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);

export function conceptClaimRow(c, { docId, pid, methodVersion, extractor, batch }) {
  const semanticKey = `${nrm(c.concept)}|${c.relation}|${nrm(c.teaching || c.target || '')}|${pid}`;
  const statement = `${c.concept} — ${c.relation}${c.teaching ? ' ' + c.teaching : ''}`.slice(0, 300);
  return {
    claimHash: sha(`${docId}|${pid}|${semanticKey}`), concept: c.concept, relation: c.relation,
    target: c.teaching || c.target || null, root: c.root || null, statement, proofVerbatim: String(c.proof).slice(0, 240),
    docId, paraId: pid, semanticKey, methodVersion, extractor, confidence: 0.7, status: 'supported', proofOk: 1, batch,
  };
}

// ── Prompt (pure) ────────────────────────────────────────────────────────────

export function buildSystem(profile) {
  return `Extract cited DOCTRINAL/CONCEPT claims from ONE passage of a ${profile.genre} work${profile.lang !== 'en' ? ` (written in ${profile.lang}; write concept/relation/teaching in ENGLISH, keep proof verbatim in the source)` : ''}. For each SIGNIFICANT concept, symbol, or metaphor the passage develops (NOT generic words), state what the passage teaches about it.
Rules:
• concept = the English canonical name of the idea/symbol (e.g. "the Covenant", "the clouds", "the Manifestation").
• relation = one of: means | teaches | interprets | symbolizes | fulfills | is-station-of | ranks.
• teaching = what the passage asserts (the interpretation / development), in a short clause.
• proof = a span copied VERBATIM and EXACTLY from the passage (≤200 chars) supporting the claim; if you cannot, OMIT.
• root = the original-language term behind the concept IF the passage/context makes it identifiable (else omit).
• ONLY what the passage states — NO outside doctrine. Skip generic words; capture load-bearing doctrinal assertions.
Return ONLY JSON: {"claims":[{"concept":"..","relation":"..","teaching":"..","proof":"..","root":".."}]}`;
}

export function buildUser(p) {
  return `NOTE: ${p.context}\n\nPASSAGE [${p.pid}]:\n${p.text}`;
}
