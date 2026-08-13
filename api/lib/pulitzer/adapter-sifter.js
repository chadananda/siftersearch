// Source adapter: SifterSearch corpus → ledger sources + evidence (PRD §22 Phase 1, §11.2).
// The corpus is the engine's strongest evidence channel — it holds the primary texts — so this adapter is
// what makes an article traceable rather than plausible. It records a LOCATOR for every excerpt (the
// oceanlibrary paragraph link the search pipeline already generates), because an excerpt a reader cannot
// open is not evidence. Deps: ./authority. Passages are passed IN, so this is testable with no network.
import { authorityOf } from './authority.js';

export const ADAPTER_VERSION = 'sifter-1';

/** The citation scheme the rest of the app already uses: source_url + ?paraId=external_para_id. */
export function corpusLocator(passage = {}) {
  const base = passage.source_url || passage.citation_url || null;
  const para = passage.external_para_id || passage.paraId || null;
  if (base && para && !String(base).includes('paraId=')) return `${base}?paraId=${para}`;
  return base || (passage.doc_id != null ? `doc:${passage.doc_id}` : null);
}

/**
 * Ingest search passages into a ledger. One source record per DOC (not per passage — a book cited five times
 * is one source), one evidence item per passage.
 * @param {object} ledger from createLedger()
 * @param {Array} passages search results ({doc_id,text,source_title,source_author,religion,collection,...})
 * @param {object} opts {question_id, retrievedAt}
 * @returns {{sources: object[], evidence: object[], skipped: object[]}}
 */
export function ingestPassages(ledger, passages = [], opts = {}) {
  const byDoc = new Map();
  const out = { sources: [], evidence: [], skipped: [] };

  for (const p of passages) {
    const excerpt = (p.text || p.excerpt || '').trim();
    const locator = corpusLocator(p);
    if (!excerpt) { out.skipped.push({ doc_id: p.doc_id, why: 'no text' }); continue; }
    // No locator ⇒ not admissible. Better to drop a passage than to carry an uncheckable quote.
    if (!locator) { out.skipped.push({ doc_id: p.doc_id, why: 'no locator — an unverifiable excerpt is not evidence' }); continue; }

    const key = p.doc_id ?? p.source_title ?? locator;
    let src = byDoc.get(key);
    if (!src) {
      const doc = { author: p.source_author, title: p.source_title, collection: p.collection, religion: p.religion };
      const { authority_class, corpus_class } = authorityOf(doc);
      src = ledger.addSource({
        title: p.source_title ?? null,
        creator: p.source_author ?? null,
        authority_class,
        language: p.language ?? null,
        url_or_corpus_locator: p.source_url ?? (p.doc_id != null ? `doc:${p.doc_id}` : null),
        retrieved_at: opts.retrievedAt ?? new Date().toISOString(),
        adapter_version: ADAPTER_VERSION,
        relevance: p.score ?? p._rankingScore ?? 0,
        reliability: p.reliability ?? 0,
        notes: corpus_class ? `corpus authority: ${corpus_class}` : null,
      });
      byDoc.set(key, src);
      out.sources.push(src);
    }

    const ev = ledger.addEvidence({
      source_id: src.source_id,
      locator,
      // Exact wording is preserved verbatim (§11.2) — the excerpt is the quotable artifact.
      exact_excerpt: excerpt,
      normalized_summary: p.summary ?? null,
      strength: p.score ?? 0,
      quote_eligible: true,
      verified: false,               // verified only once a checker re-reads it against the source
      context_required: p.heading ? `appears under: ${p.heading}` : null,
    });
    out.evidence.push(ev);
  }
  return out;
}
