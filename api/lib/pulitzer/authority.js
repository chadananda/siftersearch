// Authority classification for the article engine (PRD §11.1). SifterSearch already classifies every corpus
// doc into the companion's Bahá'í-specific ladder (B1_REVEALED … G_GENERAL); the PRD wants a tradition-neutral
// class (primary|institutional|scholarship|reference|commentary|testimony|open_web). Map, don't reinvent —
// one classifier means the article engine and the chat companion can never disagree about what a source IS.
// Deps: companion/authority (classifyAuthority). Pure.
import { classifyAuthority } from '../companion/authority.js';

// PRD §11.1 order is also the strength order: it decides "cite the strongest available source" (invariant 8).
export const AUTHORITY_RANK = {
  primary: 100, institutional: 80, scholarship: 60, reference: 45, commentary: 35, testimony: 30, open_web: 10,
};

// The companion ladder → the PRD's neutral vocabulary.
const MAP = {
  B1_REVEALED: 'primary',                 // revealed scripture
  I1_TRADITION_PRIMARY: 'primary',        // another tradition's own scripture
  B2_AUTH_INTERPRETATION: 'institutional',// authorized interpretation
  B3_UHJ_GUIDANCE: 'institutional',       // institutional guidance
  B4_OFFICIAL_EXPOSITORY: 'institutional',
  H1_PRIMARY_HISTORY: 'testimony',        // pilgrim notes, memoirs, eyewitness — bounded by PRD §11.1(6)
  H2_SCHOLARSHIP: 'scholarship',
  I2_TRADITION_SECONDARY: 'scholarship',
  G_GENERAL: 'reference',
};

/**
 * @param {object} doc a corpus doc ({author,title,collection,religion,...})
 * @returns {{authority_class: string, corpus_class: string, rank: number}}
 */
export function authorityOf(doc = {}) {
  const corpus = classifyAuthority(doc);
  const cls = MAP[corpus] || 'reference';
  return { authority_class: cls, corpus_class: corpus, rank: AUTHORITY_RANK[cls] };
}

/**
 * Invariant 8, "no citation laundering": given several sources carrying the same claim, name the strongest.
 * Ties break toward the source with a real locator — a citation a reader cannot open is not the strongest.
 */
export function strongestSource(sources = []) {
  return [...sources].sort((a, b) => {
    const r = (AUTHORITY_RANK[b.authority_class] ?? 0) - (AUTHORITY_RANK[a.authority_class] ?? 0);
    if (r) return r;
    const loc = (b.url_or_corpus_locator ? 1 : 0) - (a.url_or_corpus_locator ? 1 : 0);
    if (loc) return loc;
    return (b.reliability ?? 0) - (a.reliability ?? 0);
  })[0] || null;
}

/**
 * Authority is CLAIM-DEPENDENT (PRD §11.1 closing note): a primary text establishes what it says, not every
 * historical inference drawn from it. Returns null when the pairing is fine, or a string naming the mismatch.
 */
export function authorityMismatch(claimType, authorityClass) {
  if (claimType === 'textual' && authorityClass !== 'primary' && authorityClass !== 'institutional') {
    return 'a textual claim should rest on the primary text (or an authorized translation), not on commentary about it';
  }
  if (claimType === 'historical' && authorityClass === 'primary') {
    // Not an error — but the PRD prefers scholarship for historical INTERPRETATION, so surface it.
    return null;
  }
  if (claimType === 'interpretive' && authorityClass === 'testimony') {
    return 'an interpretive claim resting only on testimony states one person’s memory as interpretation';
  }
  if (authorityClass === 'open_web') {
    return 'open web is a discovery lead until verified against a stronger source';
  }
  return null;
}
