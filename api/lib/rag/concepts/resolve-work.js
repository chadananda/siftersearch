// concepts/resolve-work — find WHICH of our documents holds a given aligned work, by TEXT rather than title.
//
// Why not by title (2026-08-25): title matching is how a plan ends up pointing at empty duplicates. It put
// the grounding plan on husks (6555→12511, 15342→14870), it proposed "On divine origination" as the
// original of "The Secret of Divine Civilization", and it showed a soft-deleted tombstone beside a live
// canonical and read as a dedupe failure. A title is a label two records can share while holding different
// text — or no text at all.
//
// The text IS the identity test, and it self-checks: a husk has nothing to match, so it cannot win. We take
// the aligned source's own English for several passages, look each up in our corpus, and let the documents
// vote. The document that repeatedly answers with the actual words of the work is the work.
//
// STILL RECALL, NOT PROOF. This nominates a document; `backfillDoc` then aligns every paragraph and reports
// coverage, which is the real confirmation. A work resolved here but aligning at 5% is a wrong answer that
// the coverage number makes visible — that is the intended division of labour.
// Deps: ctai.js (transport), the injected store (search port).

import { fetchPair } from './ctai.js';

const PROBE_PAIRS = [1, 3, 5, 8, 12];       // spread through the work, not clustered at the opening
const PROBE_WORDS = 12;

/** Take a distinctive mid-passage phrase, skipping the opening words that formulaic texts share. Pure. */
export function probePhrase(translation, words = PROBE_WORDS) {
  const w = String(translation || '').replace(/\s+/g, ' ').trim().split(' ');
  if (w.length <= words) return w.join(' ');
  // Openings like "O Son of Spirit!" or "He is the Glory of Glories" repeat across many tablets; start past them.
  return w.slice(2, 2 + words).join(' ');
}

/**
 * Rank our documents by how often they answer a work's own text.
 *
 * `search` is injected — (query, {limit}) → [{ docId, title, sourceSite }] — so this stays free of any
 * search-engine dependency and is testable without one.
 *
 * Returns candidates sorted by votes, each with the share of probes it answered. A caller wanting certainty
 * should require both a clear winner and a high `share`; a work split across several documents shows up as
 * several candidates with middling shares rather than as one confident wrong answer.
 */
export async function resolveWorkDoc(work, { search, pairs = PROBE_PAIRS, canonicalOnly = true, log } = {}) {
  const votes = new Map();
  let probes = 0;

  for (const pi of pairs) {
    const pair = await fetchPair(work, pi, { log });
    if (!pair?.translation) continue;
    const q = probePhrase(pair.translation);
    if (q.split(' ').length < 5) continue;
    probes++;
    const hits = (await search(q, { limit: 10 })) || [];
    const seen = new Set();
    for (const h of hits) {
      const id = Number(h.docId);
      if (!id || seen.has(id)) continue;                 // one vote per document per probe
      // Canonical = oceanlibrary.com or the main library (NULL). Scrapes outnumber canonicals ~128:1, so
      // without this the vote is decided by how many copies a site happens to host.
      if (canonicalOnly && h.sourceSite && h.sourceSite !== 'oceanlibrary.com') continue;
      seen.add(id);
      const v = votes.get(id) || { docId: id, title: h.title, sourceSite: h.sourceSite ?? null, votes: 0 };
      v.votes++;
      votes.set(id, v);
    }
  }

  const candidates = [...votes.values()]
    .map((v) => ({ ...v, share: probes ? Number((v.votes / probes).toFixed(2)) : 0 }))
    .sort((a, b) => b.votes - a.votes);

  return {
    work, probes, candidates: candidates.slice(0, 5),
    // A winner needs to answer most probes AND beat the runner-up; otherwise this is a HOLD, exactly as with
    // an ambiguous person name — recall widely, bind on evidence, and refuse when the evidence is split.
    resolved: candidates.length && candidates[0].share >= 0.6
      && (candidates.length === 1 || candidates[0].votes > candidates[1].votes)
      ? candidates[0].docId : null,
  };
}
