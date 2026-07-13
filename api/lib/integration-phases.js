// The book-integration ROADMAP for the biography "progress" view — the phased plan toward the goal of
// "all history absorbed". Doc-ids only; titles/authors and live grounded-person counts resolve from the DB
// (getIntegrationProgress in bio.js), so this file never drifts from the catalog. Historical (factual) track
// only — ordered by textual rigor (see docs/architecture/history-track.md). Add later phases as they begin.
export const INTEGRATION_PHASES = [
  {
    key: 'seed', label: 'Seed',
    blurb: 'The authority seed — the Guardian’s rigorous, authoritative history establishes the core cast.',
    docs: [21310], // God Passes By (Shoghi Effendi)
  },
  {
    key: 'foundation', label: 'Foundation',
    blurb: 'The person-seed narrative history + the core-tablet study everything else resolves against.',
    docs: [21308, 8632], // The Dawn-Breakers (Nabíl) · Gate of the Heart (Saiedi — the Báb’s tablets)
  },
  {
    key: 'pillars', label: 'Pillars',
    blurb: 'The rigorously collected + edited scholarly histories — the reliable factual foundation.',
    docs: [
      429, 430, 431, 432,                                   // Revelation of Bahá’u’lláh vols 1–4 (Taherzadeh)
      28849, 462, 3789, 3887, 464, 465, 467,                // Balyuzi (The Báb, King of Glory, ‘Abdu’l-Bahá, …)
      15228, 15257, 15254, 20028, 15256, 20035, 20037, 15255, 15259, // Mázindarání — Ẓuhúru’l-Ḥaqq (Persian)
      13433,                                                // Momen — The Bábí & Bahá’í Religions (Western accounts)
      20331,                                                // Ahdieh & Chapman — Awakening (Nayríz history)
      // Nayríz source cluster (resolves Dawn-Breakers' large unresolved Nayríz-martyr tail) — candidates
      // pending confirmation: 16552 Rabbani Bábís of Nayríz · 11265 Martyrdom of Ḥájí Muḥammad-Riḍá · 16316
      // Memories of My Life · 214474 The Afnán Family.
    ],
  },
  {
    key: 'next', label: 'Coming next', upcoming: true,
    blurb: '‘Abdu’l-Bahá’s own texts + eyewitness/pilgrim accounts, then the wider corpus — toward all history absorbed.',
    docs: [20907, 20919, 11355, 11335, 12472], // Memorials · Secret of Divine Civilization · Maḥmúd’s Diary · The Chosen Highway · Juliet Thompson’s Diary
  },
];
