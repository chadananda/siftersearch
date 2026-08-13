// The article engine's spine (PRD §7, invariants 5–8 and 18). These are the rules that decide whether a
// piece may publish, so they are tested without a network or a model — if the ledger is wrong, everything
// downstream is confidently wrong.
import { describe, it, expect } from 'vitest';
import { createLedger, auditLedger, launderingReport } from '../../api/lib/pulitzer/ledger.js';
import { authorityOf, strongestSource, authorityMismatch } from '../../api/lib/pulitzer/authority.js';

const seed = () => {
  const L = createLedger();
  const scripture = L.addSource({ title: 'Gleanings', creator: "Bahá'u'lláh", authority_class: 'primary', url_or_corpus_locator: 'doc:1#p3' });
  const blog = L.addSource({ title: 'A community blog post', creator: 'A volunteer', authority_class: 'commentary', url_or_corpus_locator: 'https://example/blog' });
  return { L, scripture, blog };
};

describe('authority mapping (PRD §11.1)', () => {
  it('maps the corpus ladder onto the PRD classes', () => {
    expect(authorityOf({ author: "Bahá'u'lláh", title: 'Gleanings' }).authority_class).toBe('primary');
    expect(authorityOf({ author: 'Shoghi Effendi', title: 'God Passes By' }).authority_class).toBe('institutional');
    expect(authorityOf({ collection: 'Bahai Studies', title: 'A paper' }).authority_class).toBe('scholarship');
  });

  it('treats pilgrim notes and memoirs as TESTIMONY, not history', () => {
    // §11.1(6): valuable but bounded — this is what stops a pilgrim's recollection becoming doctrine.
    expect(authorityOf({ title: "An Early Pilgrimage", collection: 'pilgrim accounts' }).authority_class).toBe('testimony');
  });

  it('picks the strongest source, preferring one a reader can actually open', () => {
    const best = strongestSource([
      { source_id: 's_2', authority_class: 'commentary', url_or_corpus_locator: 'x' },
      { source_id: 's_1', authority_class: 'primary', url_or_corpus_locator: 'doc:1' },
    ]);
    expect(best.source_id).toBe('s_1');
    const tie = strongestSource([
      { source_id: 's_3', authority_class: 'primary', url_or_corpus_locator: null },
      { source_id: 's_4', authority_class: 'primary', url_or_corpus_locator: 'doc:9' },
    ]);
    expect(tie.source_id).toBe('s_4');       // a citation nobody can open is not the strongest
  });

  it('flags claim/authority mismatches, because authority is claim-dependent', () => {
    expect(authorityMismatch('textual', 'commentary')).toMatch(/primary text/);
    expect(authorityMismatch('interpretive', 'testimony')).toMatch(/memory/);
    expect(authorityMismatch('fact', 'open_web')).toMatch(/discovery lead/);
    expect(authorityMismatch('textual', 'primary')).toBeNull();
  });
});

describe('ledger integrity', () => {
  it('refuses evidence with no locator — a reader must be able to check it', () => {
    const { L, scripture } = seed();
    expect(() => L.addEvidence({ source_id: scripture.source_id, exact_excerpt: 'x' })).toThrow(/locator/);
  });

  it('refuses evidence citing an unknown source', () => {
    const { L } = seed();
    expect(() => L.addEvidence({ source_id: 's_999', locator: 'p1' })).toThrow(/unknown source/);
  });

  it('links claim ↔ evidence in both directions', () => {
    const { L, scripture } = seed();
    const e = L.addEvidence({ source_id: scripture.source_id, locator: 'p3', exact_excerpt: 'the earth is but one country' });
    const c = L.addClaim({ claim: 'The Writings frame humanity as one', type: 'textual', materiality: 'load_bearing' });
    L.link(c.claim_id, e.evidence_id);
    expect(c.supporting_evidence).toContain(e.evidence_id);
    expect(e.supports).toContain(c.claim_id);
  });
});

describe('the publication gate (invariant 6)', () => {
  it('BLOCKS a load-bearing claim with no evidence', () => {
    const { L } = seed();
    L.addClaim({ claim: 'A sweeping historical assertion', type: 'historical', materiality: 'load_bearing' });
    const a = L.audit();
    expect(a.ok).toBe(false);
    expect(a.blocking[0].problem).toMatch(/no supporting evidence/);
  });

  it('allows a minor claim without evidence only when marked as inference', () => {
    const { L } = seed();
    L.addClaim({ claim: 'A small aside', materiality: 'minor', consensus_state: 'inference' });
    const a = L.audit();
    expect(a.ok).toBe(true);
    expect(a.warnings.filter((w) => /not marked as inference/.test(w.problem))).toHaveLength(0);
  });

  it('BLOCKS presenting a contested claim as settled (invariant 18)', () => {
    const { L, scripture, blog } = seed();
    const pro = L.addEvidence({ source_id: scripture.source_id, locator: 'p3', exact_excerpt: 'a' });
    const con = L.addEvidence({ source_id: blog.source_id, locator: 'para 2', normalized_summary: 'disputes it' });
    const c = L.addClaim({ claim: 'X happened in 1848', type: 'historical', materiality: 'major', consensus_state: 'settled' });
    L.link(c.claim_id, pro.evidence_id);
    L.link(c.claim_id, con.evidence_id, { challenges: true });
    const a = L.audit();
    expect(a.ok).toBe(false);
    expect(a.blocking.some((b) => /challenging evidence but is marked settled/.test(b.problem))).toBe(true);
    expect(L.consensusFor(c.claim_id)).toBe('contested');   // the ledger states it, not the drafter
  });

  it('BLOCKS a quote-eligible evidence item with no exact excerpt', () => {
    const { L, scripture } = seed();
    const e = L.addEvidence({ source_id: scripture.source_id, locator: 'p3', normalized_summary: 'a paraphrase', quote_eligible: true });
    const c = L.addClaim({ claim: 'The text says so', type: 'textual', materiality: 'major' });
    L.link(c.claim_id, e.evidence_id);
    expect(L.audit().blocking.some((b) => /no exact excerpt/.test(b.problem))).toBe(true);
  });

  it('warns about evidence collected but attached to nothing', () => {
    const { L, scripture } = seed();
    L.addEvidence({ source_id: scripture.source_id, locator: 'p9', exact_excerpt: 'unused' });
    expect(L.audit().warnings.some((w) => /attached to no claim/.test(w.problem))).toBe(true);
  });

  it('passes a well-formed, fully evidenced claim', () => {
    const { L, scripture } = seed();
    const e = L.addEvidence({ source_id: scripture.source_id, locator: 'p3', exact_excerpt: 'the earth is but one country', verified: true });
    const c = L.addClaim({ claim: 'The Writings frame humanity as one', type: 'textual', materiality: 'load_bearing', consensus_state: 'settled' });
    L.link(c.claim_id, e.evidence_id);
    const a = L.audit();
    expect(a.ok).toBe(true);
    expect(a.blocking).toEqual([]);
  });
});

describe('no citation laundering (invariant 8)', () => {
  it('names the strongest source and reports the weaker one that merely repeats it', () => {
    const { L, scripture, blog } = seed();
    const e1 = L.addEvidence({ source_id: blog.source_id, locator: 'para 4', exact_excerpt: 'the earth is but one country' });
    const e2 = L.addEvidence({ source_id: scripture.source_id, locator: 'p3', exact_excerpt: 'the earth is but one country' });
    const c = L.addClaim({ claim: 'Humanity is one country', type: 'textual', materiality: 'major', consensus_state: 'settled' });
    L.link(c.claim_id, e1.evidence_id);
    L.link(c.claim_id, e2.evidence_id);
    expect(L.bestSourceFor(c.claim_id).source_id).toBe(scripture.source_id);
    const rep = launderingReport(L);
    expect(rep).toHaveLength(1);
    expect(rep[0]).toMatchObject({ claim_id: c.claim_id, cite: scripture.source_id, not: blog.source_id });
  });

  it('says nothing when only one source carries the claim', () => {
    const { L, scripture } = seed();
    const e = L.addEvidence({ source_id: scripture.source_id, locator: 'p3', exact_excerpt: 'x' });
    const c = L.addClaim({ claim: 'y', materiality: 'supporting' });
    L.link(c.claim_id, e.evidence_id);
    expect(launderingReport(L)).toEqual([]);
  });
});

describe('auditLedger is callable on a bare state (pre-publication re-check)', () => {
  it('re-audits a ledger whose evidence was removed after drafting', () => {
    const { L, scripture } = seed();
    const e = L.addEvidence({ source_id: scripture.source_id, locator: 'p3', exact_excerpt: 'x' });
    const c = L.addClaim({ claim: 'load bearing', materiality: 'load_bearing' });
    L.link(c.claim_id, e.evidence_id);
    expect(auditLedger(L.state).ok).toBe(true);
    c.supporting_evidence.length = 0;                       // evidence retracted late
    expect(auditLedger(L.state).ok).toBe(false);
  });
});
