// concepts/link — connect concepts across traditions: analogical (family resemblance, marked as such) +
// authoritative-bridge (an authority explicitly connects them, proof-gated). Entities stay distinct. RED-FIRST.
import { describe, it, expect } from 'vitest';
import { parseLinkVerdict, linkRow, SYSTEM } from '../../api/lib/rag/concepts/link.js';
import { fakeLLM, makeRag } from './kit.js';

describe('concepts/link — pure helpers', () => {
  it('parseLinkVerdict reads the link type + optional authority/proof', () => {
    expect(parseLinkVerdict('{"link_type":"analogical","rationale":"both the creative Word"}'))
      .toMatchObject({ linkType: 'analogical', rationale: 'both the creative Word' });
    expect(parseLinkVerdict('{"link_type":"authoritative-bridge","authority":"Íqán","proof":"reinterprets the clouds"}'))
      .toMatchObject({ linkType: 'authoritative-bridge', authority: 'Íqán', proof: 'reinterprets the clouds' });
    expect(parseLinkVerdict('{"link_type":"none"}')).toMatchObject({ linkType: 'none' });
    expect(parseLinkVerdict('x')).toBeNull();
  });
  it('the prompt keeps analogical distinct from identity and requires proof for a bridge', () => {
    expect(SYSTEM).toMatch(/analogical/i);
    expect(SYSTEM).toMatch(/never asserting.*identity|not.*identity/i);
  });
  it('linkRow carries both concepts + the typed link', () => {
    expect(linkRow({ linkType: 'analogical', rationale: 'r' }, 3, 9)).toMatchObject({ aConceptId: 3, bConceptId: 9, linkType: 'analogical', rationale: 'r' });
  });
});

describe('concepts/link — run() on fake ports', () => {
  const concepts = { 3: { id: 3, canonical: 'the Primal Will', tradition: 'bahai' }, 9: { id: 9, canonical: 'the Logos', tradition: 'christian' } };
  it('records an analogical link between two distinct concepts', async () => {
    const { rag, store } = makeRag({ seed: { concepts }, llm: fakeLLM([{ content: '{"link_type":"analogical","rationale":"both the creative first emanation"}' }]) });
    const r = await rag.concepts.link(3, 9, { model: 'flash', fallback: 'haiku' });
    expect(r).toMatchObject({ linked: true, linkType: 'analogical' });
    expect(store.conceptLinks[0]).toMatchObject({ aConceptId: 3, bConceptId: 9, linkType: 'analogical' });
  });
  it('does not record a link when the verdict is none', async () => {
    const { rag, store } = makeRag({ seed: { concepts }, llm: fakeLLM([{ content: '{"link_type":"none"}' }]) });
    const r = await rag.concepts.link(3, 9, { model: 'flash', fallback: 'haiku' });
    expect(r.linked).toBe(false);
    expect(store.conceptLinks).toHaveLength(0);
  });
});
