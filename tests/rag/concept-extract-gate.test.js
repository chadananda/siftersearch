// The disambiguation gate on concept extraction must accept EITHER variant.
//
// concepts/disambiguate is documented as "an ALTERNATIVE gate for doctrinal works, not a second pass" and
// writes to the SAME context column — but it stamps 'concept-disambig-v1' while extract filtered for
// 'deepseek-disambig-v1' alone. A fully-noted book therefore reported `paras: 0`: a stage reporting success
// having read nothing. Same open-producer/closed-consumer shape as the heading whitelist and the phrase
// re-rank. Found 2026-08-26 while preparing the core books for extraction.
import { describe, it, expect, vi } from 'vitest';
import { run } from '../../api/lib/rag/concepts/extract.js';

vi.mock('../../api/lib/rag/kernel/gate.js', () => ({ assertDisambiguated: async () => {} }));
vi.mock('../../api/lib/rag/kernel/profile.js', () => ({
  profileFor: async () => ({ genre: 'doctrinal', lang: 'en', models: { extract: 'm' }, fallback: 'm' }),
}));

const para = (contextModel) => ({
  id: 1, pid: 'p1', kind: 'paragraph', context: 'the running argument', contextModel,
  text: 'A passage of sufficient length concerning the Covenant and its station.',
});

const makeCtx = (paragraphs) => ({
  config: { versions: { disambig: 'deepseek-disambig-v1', conceptDisambig: 'concept-disambig-v1' } },
  catalog: { get: () => ({ capabilities: [] }) },
  log: { info: () => {} },
  model: { runLadder: async () => ({ parsed: [], escalated: false }) },
  store: {
    getParagraphs: async () => paragraphs,
    getDocMeta: async () => ({ id: 1, title: 'Test Work' }),
    saveConceptClaims: async () => 0,
  },
});

describe('concept extraction disambiguation gate', () => {
  it('reads paragraphs noted by the ENRICH disambiguator', async () => {
    const r = await run(makeCtx([para('deepseek-disambig-v1')]), 1);
    expect(r.paras).toBe(1);
  });

  it('reads paragraphs noted by the CONCEPT disambiguator — the variant it used to skip', async () => {
    const r = await run(makeCtx([para('concept-disambig-v1')]), 1);
    expect(r.paras).toBe(1);
  });

  it('NAMES the reason when nothing is readable, rather than reporting a bare zero', async () => {
    // "paras: 0" is indistinguishable from "this book has no concepts in it".
    const r = await run(makeCtx([para('some-unknown-version')]), 1);
    expect(r.paras).toBe(0);
    expect(r.skippedReason).toMatch(/disambiguation note/i);
  });

  it('distinguishes an unnoted book from a book with no prose at all', async () => {
    const r = await run(makeCtx([]), 1);
    expect(r.skippedReason).toMatch(/no prose paragraphs/i);
  });
});
