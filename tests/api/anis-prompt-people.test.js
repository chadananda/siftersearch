// Anís must see the people answer as the search decided it — met / did not meet / contested / no evidence — with
// every claim's verbatim proof (2026-09-27: "Ṭáhirih met the Báb" was served from proofs saying she never did).
import { describe, it, expect } from 'vitest';
import { anisUserPayload } from '../../api/lib/anis/prompt.js';

describe('anisUserPayload people answer', () => {
  it('renders the four lists and the proofs', () => {
    const e = (statement, proof) => ({ statement, proof, source: 'The Dawn-Breakers', url: 'https://oceanlibrary.com/db?paraId=para_1', when: '1844' });
    const out = anisUserPayload({
      question: 'Which Letters of the Living met the Báb?',
      entities: [{ name: 'Quddús', evidence: [e('Quddús — met the Báb', 'Quddús was admitted into His presence')] }],
      peopleAnswer: {
        notMet: [{ name: 'Ṭáhirih', evidence: [e('Ṭáhirih — met the Báb', 'she never attained the presence of the Báb')] }],
        contested: [],
        noEvidence: [{ name: 'Mullá Ḥasan-i-Bajistání' }],
      },
    });
    expect(out).toMatch(/MET:\n- Quddús: .*proof: "Quddús was admitted into His presence"/);
    expect(out).toMatch(/SOURCES SAY DID NOT MEET:\n- Ṭáhirih: .*never attained the presence/);
    expect(out).toMatch(/NO CITED EVIDENCE either way:\n- Mullá Ḥasan-i-Bajistání/);
    expect(out).not.toMatch(/CONTESTED/);
  });
});

describe('anisUserPayload — search target', () => {
  it('says who a misspelled name resolved to, so the reply answers about the place the texts name', () => {
    const u = anisUserPayload({ question: 'iderne', passages: [{ source_title: 'SAQ', text: 'exiled to Adrianople' }],
      target: { id: 1, name: 'Adrianople', type: 'place', names: ['Adrianople', 'Edirne', 'Adirnih'] } });
    expect(u).toMatch(/NAMED IN THE QUESTION: Adrianople \(place\) — the texts also call it Edirne, Adirnih/);
  });
  it('adds nothing when there is no target', () => {
    expect(anisUserPayload({ question: 'justice', passages: [] })).not.toMatch(/NAMED IN THE QUESTION/);
  });
});
