// Every enrichment stage puts the paragraph's VOICE (who speaks it, whom it quotes) beside it (Chad 2026-10-09).
import { describe, it, expect } from 'vitest';
import { buildUser as disambiguate } from '../../api/lib/rag/enrich/disambiguate.js';
import { buildUser as claims } from '../../api/lib/rag/entities/claims.js';
import { buildUser as concepts } from '../../api/lib/rag/concepts/extract.js';
import { buildUser as conceptDisambiguate } from '../../api/lib/rag/concepts/disambiguate.js';
import { buildUser as hype } from '../../api/lib/rag/enrich/retrieval.js';

const p = { pid: 'p1', text: 'I have learned with profound regret…', context: 'note', voice: 'VOICE: Shoghi Effendi (quoted in this book by Rúḥíyyih Rabbání)' };
describe('voice in every stage', () => {
  it('appears in each per-paragraph message, and is absent when unknown', () => {
    for (const u of [disambiguate(p, { place: null, era: null, known: [] }), claims(p), concepts(p), conceptDisambiguate(p), hype(p)]) expect(u).toContain(p.voice);
    expect(claims({ ...p, voice: '' })).not.toContain('VOICE');
  });
});
