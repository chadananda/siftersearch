// The evidence ledgers (PRD §7.1–7.4) and the invariants that make an article defensible. Pure — no I/O, no
// model calls — because these rules are the product's spine and must be testable without a network.
//
// The invariants encoded here, and why each exists:
//   5.  Evidence and prose stay separable — claims live here; prose cites claim IDs.
//   6.  Material claims are traceable — a load-bearing claim with no evidence cannot ship.
//   7.  Authority is explicit — every source carries a class, never "a source says".
//   8.  No citation laundering — cite the strongest source carrying a claim, not the page that repeats it.
//   18. Uncertainty is preserved — disagreement is recorded as contested, never averaged away.
// Deps: ./authority.
import { strongestSource, authorityMismatch, AUTHORITY_RANK } from './authority.js';

const id = (p, n) => `${p}_${String(n).padStart(4, '0')}`;

export const MATERIALITY = ['minor', 'supporting', 'major', 'load_bearing'];
export const CONSENSUS = ['settled', 'probable', 'contested', 'uncertain', 'inference'];

/** A ledger is one article's evidence world: questions, sources, evidence, claims. */
export function createLedger() {
  const state = { questions: [], sources: [], evidence: [], claims: [], counters: { q: 0, s: 0, e: 0, c: 0 } };

  const addSource = (s) => {
    const rec = {
      source_id: id('s', ++state.counters.s),
      title: s.title ?? null, creator: s.creator ?? null,
      authority_class: s.authority_class ?? 'reference',
      edition: s.edition ?? null, date: s.date ?? null, language: s.language ?? null,
      url_or_corpus_locator: s.url_or_corpus_locator ?? null,
      rights: s.rights ?? null, content_hash: s.content_hash ?? null,
      retrieved_at: s.retrieved_at ?? null, adapter_version: s.adapter_version ?? null,
      reliability: s.reliability ?? 0, relevance: s.relevance ?? 0, freshness: s.freshness ?? 0,
      bias_or_position: s.bias_or_position ?? null, notes: s.notes ?? null,
    };
    state.sources.push(rec);
    return rec;
  };

  const addEvidence = (e) => {
    if (!state.sources.some((s) => s.source_id === e.source_id)) {
      throw new Error(`evidence cites unknown source ${e.source_id}`);
    }
    // An excerpt without a locator cannot be checked by a reader, which is the whole point of the ledger.
    if (!e.locator) throw new Error('evidence needs a locator (page|section|paragraph|timestamp|record)');
    const rec = {
      evidence_id: id('e', ++state.counters.e),
      source_id: e.source_id, locator: e.locator,
      exact_excerpt: e.exact_excerpt ?? null,
      normalized_summary: e.normalized_summary ?? null,
      supports: [...(e.supports ?? [])], challenges: [...(e.challenges ?? [])],
      strength: e.strength ?? 0, context_required: e.context_required ?? null,
      quote_eligible: e.quote_eligible ?? !!e.exact_excerpt,
      verified: e.verified ?? false,
    };
    state.evidence.push(rec);
    return rec;
  };

  const addClaim = (c) => {
    const rec = {
      claim_id: id('c', ++state.counters.c),
      claim: c.claim, type: c.type ?? 'fact',
      materiality: MATERIALITY.includes(c.materiality) ? c.materiality : 'supporting',
      supporting_evidence: [...(c.supporting_evidence ?? [])],
      challenging_evidence: [...(c.challenging_evidence ?? [])],
      confidence: c.confidence ?? 0,
      consensus_state: CONSENSUS.includes(c.consensus_state) ? c.consensus_state : 'uncertain',
      allowed_wording: c.allowed_wording ?? null,
      forbidden_overclaim: c.forbidden_overclaim ?? null,
      fresh_until: c.fresh_until ?? null,
      review_status: c.review_status ?? 'open',
    };
    state.claims.push(rec);
    return rec;
  };

  const link = (claimId, evidenceId, { challenges = false } = {}) => {
    const c = state.claims.find((x) => x.claim_id === claimId);
    const e = state.evidence.find((x) => x.evidence_id === evidenceId);
    if (!c || !e) throw new Error(`cannot link ${claimId} ↔ ${evidenceId}: unknown id`);
    const cArr = challenges ? c.challenging_evidence : c.supporting_evidence;
    const eArr = challenges ? e.challenges : e.supports;
    if (!cArr.includes(evidenceId)) cArr.push(evidenceId);
    if (!eArr.includes(claimId)) eArr.push(claimId);
    return c;
  };

  const sourcesFor = (claimId) => {
    const c = state.claims.find((x) => x.claim_id === claimId);
    if (!c) return [];
    const ids = new Set(c.supporting_evidence);
    const srcIds = new Set(state.evidence.filter((e) => ids.has(e.evidence_id)).map((e) => e.source_id));
    return state.sources.filter((s) => srcIds.has(s.source_id));
  };

  /** Invariant 8: the citation a claim SHOULD carry. */
  const bestSourceFor = (claimId) => strongestSource(sourcesFor(claimId));

  /**
   * Invariant 18: a claim with evidence on both sides is contested — the ledger says so rather than
   * letting a drafting agent pick the convenient side.
   */
  const consensusFor = (claimId) => {
    const c = state.claims.find((x) => x.claim_id === claimId);
    if (!c) return null;
    if (c.challenging_evidence.length && c.supporting_evidence.length) return 'contested';
    if (!c.supporting_evidence.length) return 'inference';
    return c.consensus_state;
  };

  return {
    state, addSource, addEvidence, addClaim, link, sourcesFor, bestSourceFor, consensusFor,
    audit: () => auditLedger(state),
  };
}

/**
 * The gate. Returns the blocking problems (publication-forbidding) and the warnings.
 * Called before drafting AND before publication, because a claim can lose its evidence mid-flight.
 */
export function auditLedger(state) {
  const blocking = [], warnings = [];
  for (const c of state.claims) {
    const material = c.materiality === 'major' || c.materiality === 'load_bearing';
    // Invariant 6: material claims are traceable.
    if (material && c.supporting_evidence.length === 0) {
      blocking.push({ claim_id: c.claim_id, problem: `${c.materiality} claim has no supporting evidence`, claim: c.claim });
      continue;
    }
    if (!material && c.supporting_evidence.length === 0 && c.consensus_state !== 'inference') {
      warnings.push({ claim_id: c.claim_id, problem: 'unsupported claim is not marked as inference' });
    }
    // Invariant 18: contested evidence must not be presented as settled.
    if (c.challenging_evidence.length && ['settled', 'probable'].includes(c.consensus_state)) {
      blocking.push({ claim_id: c.claim_id, problem: `claim has challenging evidence but is marked ${c.consensus_state}`, claim: c.claim });
    }
    // Invariant 7/§11.1: authority must fit the claim type.
    const srcIds = new Set(state.evidence.filter((e) => c.supporting_evidence.includes(e.evidence_id)).map((e) => e.source_id));
    const srcs = state.sources.filter((s) => srcIds.has(s.source_id));
    const best = strongestSource(srcs);
    if (best) {
      const mismatch = authorityMismatch(c.type, best.authority_class);
      if (mismatch) warnings.push({ claim_id: c.claim_id, problem: mismatch });
    }
    // A quote must come from an excerpt, not a summary.
    for (const eid of c.supporting_evidence) {
      const e = state.evidence.find((x) => x.evidence_id === eid);
      if (e && e.quote_eligible && !e.exact_excerpt) {
        blocking.push({ claim_id: c.claim_id, problem: `evidence ${eid} is quote-eligible but has no exact excerpt` });
      }
    }
  }
  for (const e of state.evidence) {
    if (!e.supports.length && !e.challenges.length) {
      warnings.push({ evidence_id: e.evidence_id, problem: 'evidence is attached to no claim (collected but unused)' });
    }
  }
  return { ok: blocking.length === 0, blocking, warnings };
}

/** Invariant 8 as a report: where the article cites something weaker than what it holds. */
export function launderingReport(ledger) {
  const out = [];
  for (const c of ledger.state.claims) {
    const srcs = ledger.sourcesFor(c.claim_id);
    if (srcs.length < 2) continue;
    const best = strongestSource(srcs);
    for (const s of srcs) {
      if (s.source_id !== best.source_id && AUTHORITY_RANK[s.authority_class] < AUTHORITY_RANK[best.authority_class]) {
        out.push({ claim_id: c.claim_id, cite: best.source_id, not: s.source_id,
          why: `${best.authority_class} available; ${s.authority_class} merely repeats it` });
      }
    }
  }
  return out;
}
