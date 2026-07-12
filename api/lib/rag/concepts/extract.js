// concepts/extract — lift concepts to first-class claims. For the significant concepts/symbols a passage
// develops, extract cited doctrinal claims (concept → what it teaches/means), each gated by a VERBATIM proof
// span. Concept identity is DEFERRED (concept_id null; reconcile binds it against the interpretive lexicon).
// English-canonical concept names; the original-language ROOT captured where identifiable; proof stays
// verbatim in the source language. Gated on disambiguation. Mirrors entities/claims (proof-gate + deferral).
import { createHash } from 'node:crypto';
import { assertDisambiguated } from '../kernel/gate.js';
import { profileFor } from '../kernel/profile.js';
import { pool } from '../kernel/run.js';

export async function run(ctx, docId, opts = {}) {
  await assertDisambiguated(ctx, docId, { threshold: opts.threshold ?? 0.99 });
  const version = opts.version ?? ctx.config.versions?.disambig ?? 'disambig-v1';
  const extractor = opts.extractor ?? ctx.config.versions?.conceptExtract ?? 'concept-extract-v1';
  const batch = opts.batch ?? extractor;
  const profile = await profileFor(ctx, docId);
  let paras = (await ctx.store.getParagraphs(docId)).filter((p) => p.context && p.contextModel === version && (p.kind ?? 'paragraph') === 'paragraph');
  if (opts.limit) paras = paras.slice(0, opts.limit);          // small reviewed slices before a full run
  const system = buildSystem(profile);
  const route = { model: opts.model ?? profile.models.extract, fallback: opts.fallback ?? profile.fallback };
  const maxTokens = (m) => (ctx.catalog.get(m)?.capabilities?.includes('reasoning') ? 6000 : 3000);
  const stats = { paras: paras.length, claims: 0, written: 0, dropped: 0, failed: 0, escalated: 0 };

  const rows = [];
  await pool(opts.concurrency ?? 5, paras, async (p) => {
    const { parsed, escalated } = await ctx.model.runLadder({ route, system, user: buildUser(p), parse: parseConceptClaims, maxTokens });
    if (escalated) stats.escalated++;
    if (!parsed || !parsed.length) { stats.failed++; return; }
    const textNorm = proofNorm(p.text);
    for (const c of parsed) {
      stats.claims++;
      if (!c.concept || !c.relation || !c.proof || !conceptProofOk(c.proof, textNorm)) { stats.dropped++; continue; }
      rows.push(conceptClaimRow(c, { docId, pid: p.pid, methodVersion: version, extractor, batch }));
    }
  });
  ctx.log.info?.({ docId, ...stats }, 'concepts/extract');
  if (opts.dryRun) return { ...stats, written: 0, rows };   // return claims for review, write nothing
  stats.written = await ctx.store.saveConceptClaims(rows);
  return stats;
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
