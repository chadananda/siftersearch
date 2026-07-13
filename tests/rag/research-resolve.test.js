// entities/research-resolve — resolve UNCERTAINs by corpus+web research, with mandatory sourced+tiered evidence.
import { describe, it, expect } from 'vitest';
import { parseResolve, collectEvidence, decisionRow, buildUser, SYSTEM } from '../../api/lib/rag/entities/research-resolve.js';
import { fakeLLM, fakeWeb, makeRag } from './kit.js';

describe('research-resolve — pure helpers', () => {
  it('parseResolve accepts the four verdicts, rejects others', () => {
    expect(parseResolve('{"verdict":"link","entity_id":5,"used_corpus":[0],"confidence":0.9}')).toMatchObject({ verdict: 'link', entityId: 5, usedCorpus: [0] });
    expect(parseResolve('{"verdict":"hold","reason":"too thin"}')).toMatchObject({ verdict: 'hold' });
    expect(parseResolve('{"verdict":"maybe"}')).toBeNull();
  });

  it('collectEvidence records provenance and tags external evidence as the lowest tier', () => {
    const corpus = [{ docId: 21308, paraId: 'para_9', authorityTier: 2, snippet: 'the betrayer of Quddús' }];
    const web = { answer: '…', sources: [{ url: 'https://en.wikipedia.org/wiki/X', title: 'X — Wikipedia' }] };
    const ev = collectEvidence({ usedCorpus: [0], usedWeb: [0] }, corpus, web);
    expect(ev.inCorpus[0]).toMatchObject({ sourceDocId: 21308, paraId: 'para_9', authorityTier: 2 });
    expect(ev.external[0]).toMatchObject({ url: 'https://en.wikipedia.org/wiki/X', authorityTier: 'external-web' });
  });

  it('decisionRow maps hold→uncertain and tags via:research; a create carries its canonical', () => {
    const hold = decisionRow({ verdict: 'hold', reason: 'thin' }, { resolvedAs: 'Lady Agnew', paraIds: ['p1'], freq: 1 }, { inCorpus: [], external: [] }, 21310);
    expect(hold.kind).toBe('uncertain');
    expect(hold.payload.via).toBe('research');
    const create = decisionRow({ verdict: 'create', canonical: 'Siyyid-i-Qumí', type: 'person', confidence: 0.8 }, { resolvedAs: 'the betrayer', paraIds: [], freq: 3 }, { inCorpus: [], external: [] }, 21310);
    expect(create).toMatchObject({ kind: 'create', payload: { canonical: 'Siyyid-i-Qumí', via: 'research' } });
  });

  it('the prompt makes corpus outrank web and prefers hold over a wrong resolution', () => {
    expect(SYSTEM).toMatch(/CORPUS always outranks WEB/i);
    expect(SYSTEM).toMatch(/Prefer "hold"/i);
    expect(SYSTEM).toMatch(/REJECT cross-TRADITION/i);           // a Persian figure is not the biblical Potiphar
    expect(SYSTEM).toMatch(/Potiphar/);
    expect(buildUser({ resolvedAs: 'X', freq: 2 }, [{ docId: 1, title: 'DB', authorityTier: 2, snippet: 'y' }], null)).toContain('authority 2');
  });
});

describe('research-resolve — run() on fake ports', () => {
  it('resolves from the CORPUS (no web call) and records in-corpus provenance', async () => {
    const seed = {
      uncertain: { 429: [{ resolvedAs: 'the Siyyid-i-Qumí', paraIds: ['p1'], freq: 3 }] },
      corpus: [
        { docId: 21308, title: 'The Dawn-Breakers', authorityTier: 2, paraId: 'para_9', snippet: 'the Siyyid-i-Qumí, betrayer of Quddús', entityId: 501 },
        { docId: 21310, title: 'God Passes By', authorityTier: 1, paraId: 'para_3', snippet: 'the treacherous Siyyid', entityId: 501 },
      ],
    };
    const llm = fakeLLM([{ content: '{"verdict":"link","entity_id":501,"type":"person","used_corpus":[0,1],"used_web":[],"confidence":0.9,"reason":"same betrayer role"}' }]);
    const web = fakeWeb({ answer: 'should not be called', sources: [] });
    const { rag, store } = makeRag({ seed, llm, web });
    const stats = await rag.entities.researchResolve(429, { model: "flash", fallback: "haiku" });
    expect(stats).toMatchObject({ clusters: 1, adjudicated: 1, webUsed: 0, written: 1 });
    expect(web.calls).toHaveLength(0);                          // corpus was rich → web not consulted
    expect(store.decisions[0]).toMatchObject({ kind: 'link', payload: { entityId: 501, via: 'research' } });
    expect(store.decisions[0].evidence.inCorpus[0]).toMatchObject({ sourceDocId: 21308, authorityTier: 2 });
  });

  it('falls back to the WEB when the corpus is thin, and records SOURCED external evidence', async () => {
    const seed = { uncertain: { 429: [{ resolvedAs: 'Lady Agnew', paraIds: ['p1'], freq: 1 }] }, corpus: [] };
    const llm = fakeLLM([{ content: '{"verdict":"create","canonical":"Lady Agnew of Lochnaw","type":"person","used_corpus":[],"used_web":[0],"confidence":0.4,"reason":"web identifies her; no corpus"}' }]);
    const web = fakeWeb({ answer: 'Lady Agnew of Lochnaw (Gertrude Vernon, 1864–1932)', sources: [{ url: 'https://en.wikipedia.org/wiki/Lady_Agnew_of_Lochnaw', title: 'Lady Agnew of Lochnaw — Wikipedia' }] });
    const { rag, store } = makeRag({ seed, llm, web });
    const stats = await rag.entities.researchResolve(429, { model: "flash", fallback: "haiku" });
    expect(stats.webUsed).toBe(1);
    expect(web.calls[0]).toMatch(/Lady Agnew/);
    expect(store.decisions[0].evidence.external[0]).toMatchObject({ url: 'https://en.wikipedia.org/wiki/Lady_Agnew_of_Lochnaw', authorityTier: 'external-web' });
    expect(store.decisions[0].confidence).toBe(0.4);            // web-only → low confidence
  });

  it('HOLDS (stays uncertain) when research is genuinely thin — never invents', async () => {
    const seed = { uncertain: { 429: [{ resolvedAs: 'a certain believer', paraIds: ['p1'], freq: 1 }] }, corpus: [] };
    const llm = fakeLLM([{ content: '{"verdict":"hold","used_corpus":[],"used_web":[],"confidence":0.2,"reason":"no identifying evidence"}' }]);
    const { rag, store } = makeRag({ seed, llm, web: fakeWeb(null) });
    const stats = await rag.entities.researchResolve(429, { model: "flash", fallback: "haiku" });
    expect(stats).toMatchObject({ held: 1, written: 1 });
    expect(store.decisions[0].kind).toBe('uncertain');         // recorded as researched-but-held, not dropped
  });
});
