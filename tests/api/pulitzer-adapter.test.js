// The SifterSearch source adapter (PRD §22 Phase 1). It is the engine's strongest evidence channel, so the
// properties that matter are: a book cited five times is ONE source, every excerpt carries an openable
// locator, exact wording survives verbatim (§11.2), and authority comes from the corpus classifier.
import { describe, it, expect } from 'vitest';
import { createLedger } from '../../api/lib/pulitzer/ledger.js';
import { ingestPassages, corpusLocator, ADAPTER_VERSION } from '../../api/lib/pulitzer/adapter-sifter.js';

const passage = (over = {}) => ({
  doc_id: 21310, source_title: 'God Passes By', source_author: 'Shoghi Effendi',
  collection: "Bahá'í Books", religion: "Bahá'í",
  source_url: 'https://oceanlibrary.com/god-passes-by', external_para_id: 'para_142',
  text: 'the second of the two "witnesses"', score: 0.91, ...over,
});

describe('corpusLocator', () => {
  it('builds the paragraph citation the rest of the app already uses', () => {
    expect(corpusLocator(passage())).toBe('https://oceanlibrary.com/god-passes-by?paraId=para_142');
  });
  it('does not double-append when the url already carries a paraId', () => {
    expect(corpusLocator({ source_url: 'https://x/y?paraId=para_3', external_para_id: 'para_9' }))
      .toBe('https://x/y?paraId=para_3');
  });
  it('falls back to a doc locator rather than returning nothing', () => {
    expect(corpusLocator({ doc_id: 55 })).toBe('doc:55');
    expect(corpusLocator({})).toBeNull();
  });
});

describe('ingestPassages', () => {
  it('creates ONE source per doc even when many passages come from it', () => {
    const L = createLedger();
    const r = ingestPassages(L, [passage(), passage({ external_para_id: 'para_143' }), passage({ external_para_id: 'para_144' })]);
    expect(r.sources).toHaveLength(1);
    expect(r.evidence).toHaveLength(3);
    expect(L.state.sources).toHaveLength(1);
  });

  it('separates different docs into different sources', () => {
    const L = createLedger();
    const r = ingestPassages(L, [passage(), passage({ doc_id: 21308, source_title: 'The Dawn-Breakers', source_author: 'Nabíl' })]);
    expect(r.sources).toHaveLength(2);
  });

  it('classifies authority from the corpus, not from the caller', () => {
    const L = createLedger();
    ingestPassages(L, [passage({ source_author: "Bahá'u'lláh", source_title: 'Gleanings' })]);
    expect(L.state.sources[0].authority_class).toBe('primary');
    const L2 = createLedger();
    ingestPassages(L2, [passage()]);                                  // Shoghi Effendi → authorized interpretation
    expect(L2.state.sources[0].authority_class).toBe('institutional');
  });

  it('preserves exact wording verbatim (§11.2) and marks it quotable', () => {
    const L = createLedger();
    const r = ingestPassages(L, [passage({ text: '  the earth is but one country  ' })]);
    expect(r.evidence[0].exact_excerpt).toBe('the earth is but one country');
    expect(r.evidence[0].quote_eligible).toBe(true);
  });

  it('does NOT mark evidence verified — that requires a checker re-reading the source', () => {
    const L = createLedger();
    const r = ingestPassages(L, [passage()]);
    expect(r.evidence[0].verified).toBe(false);
  });

  it('DROPS a passage with no locator rather than carrying an uncheckable quote', () => {
    const L = createLedger();
    const r = ingestPassages(L, [passage({ source_url: null, doc_id: null, external_para_id: null })]);
    expect(r.evidence).toHaveLength(0);
    expect(r.skipped[0].why).toMatch(/not evidence/);
  });

  it('drops an empty passage', () => {
    const L = createLedger();
    const r = ingestPassages(L, [passage({ text: '   ' })]);
    expect(r.evidence).toHaveLength(0);
    expect(r.skipped[0].why).toBe('no text');
  });

  it('stamps provenance so a stale extraction can be found later', () => {
    const L = createLedger();
    ingestPassages(L, [passage()], { retrievedAt: '2026-08-13T00:00:00Z' });
    expect(L.state.sources[0].adapter_version).toBe(ADAPTER_VERSION);
    expect(L.state.sources[0].retrieved_at).toBe('2026-08-13T00:00:00Z');
    expect(L.state.sources[0].notes).toMatch(/corpus authority:/);
  });

  it('feeds a ledger that then passes its own audit once claims are linked', () => {
    const L = createLedger();
    const r = ingestPassages(L, [passage()]);
    const c = L.addClaim({ claim: "GPB names 'Alí as the second witness", type: 'textual', materiality: 'load_bearing', consensus_state: 'settled' });
    L.link(c.claim_id, r.evidence[0].evidence_id);
    const a = L.audit();
    expect(a.ok).toBe(true);
    expect(L.bestSourceFor(c.claim_id).title).toBe('God Passes By');
  });
});
