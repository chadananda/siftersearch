// The book-integration ROADMAP for the biography "progress" view — the phased plan toward "all history
// absorbed". Doc-ids only; titles/authors + live grounded-person counts + per-book SIZE (paragraph_count)
// resolve from the DB (getIntegrationProgress in bio.js), so this file never drifts from the catalog.
// HISTORICAL (factual) track only — ordered by textual rigor (see docs/architecture/history-track.md).
//
// Phase model (corrected 2026-07-13):
//   seed        — God Passes By (the authority seed).
//   foundation  — The Dawn-Breakers alone (the person-seed narrative everything resolves against).
//   pillars     — the carefully-EDITED core histories/studies: Gate of the Heart (the Báb's tablets),
//                 Taherzadeh/ROB (Bahá'u'lláh's tablets), Balyuzi, Mázindarání, Momen, Ahdieh's Awakening.
//   primary     — FIRSTHAND/documentary: 'Abdu'l-Bahá's own texts, eyewitness/pilgrim diaries, Nayríz docs.
//                 High evidential value but loosely-collected AS TEXT → resolve AGAINST the pillars, never override.
//   histories   — the long tail: EVERY published Bahá'í history & biography (collection 'Baha'i Books'),
//                 identified by a content-sample genre classification (history/biography only; topical,
//                 doctrinal, reference, comparative-religion excluded). Resolved dynamically in bio.js from
//                 the classified catalog so the phase auto-populates + stays fresh as the corpus grows.
export const INTEGRATION_PHASES = [
  {
    key: 'seed', label: 'Seed',
    blurb: "The authority seed — the Guardian's rigorous, authoritative history establishes the core cast.",
    docs: [21310], // God Passes By (Shoghi Effendi)
  },
  {
    key: 'foundation', label: 'Foundation',
    blurb: 'The person-seed narrative history — the cast every later book resolves its identities against.',
    docs: [21308], // The Dawn-Breakers (Nabíl)
  },
  {
    key: 'pillars', label: 'Pillars',
    blurb: 'The carefully collected + edited scholarly histories & tablet-studies — the reliable factual foundation.',
    docs: [
      8632,                                                 // Gate of the Heart (Saiedi — the Báb's tablets)
      429, 430, 431, 432,                                   // Revelation of Bahá'u'lláh vols 1-4 (Taherzadeh)
      28849, 462, 3789, 3887, 464, 465, 467,                // Balyuzi (The Báb, King of Glory, 'Abdu'l-Bahá, ...)
      15228, 15257, 15254, 20028, 15256, 20035, 20037, 15255, 15259, // Mázindarání — Ẓuhúru'l-Ḥaqq (Persian)
      13433,                                                // Momen — The Bábí & Bahá'í Religions (Western accounts)
      20331,                                                // Ahdieh & Chapman — Awakening (Nayríz narrative HISTORY)
    ],
  },
  {
    key: 'primary', label: 'Primary sources', upcoming: true,
    blurb: "PRIMARY / firsthand — 'Abdu'l-Bahá's own texts, eyewitness & pilgrim diaries, and documentary compilations (incl. the Nayríz documents). High evidential value (closest to the events) but loosely collected/edited AS TEXTS, so they resolve AGAINST the pillars rather than overriding them.",
    docs: [
      20907, 20919, 11355, 11335, 12472, // 'Abdu'l-Bahá texts + pilgrim diaries (Memorials · Secret of Divine Civ · Maḥmúd's Diary · Chosen Highway · Juliet Thompson)
      16552, 11265, 16316, 214474,       // Nayríz PRIMARY/documentary sources (Rabbani) — feed the convergence sweep at their primary-but-loosely-collected tier.
    ],
  },
  {
    key: 'biographies', label: 'Biographies', upcoming: true,
    blurb: "Individual lives — biographies of believers, martyrs, and figures, tightly focused on specific people. Grounded BEFORE the general histories: the clean per-person cast disentangles identities before the broader (and sometimes non-Bahá'í) narrative histories are absorbed.",
    dynamic: 'biography', // bio.js fills from the classified catalog (bahai-history-catalog.json) where genre==='biography'
  },
  {
    key: 'histories', label: 'General Histories', upcoming: true,
    blurb: "General published histories — the broad narrative context, some of it not Bahá'í-centric. Identified from the 'Baha'i Books' collection by a content-sample genre classification (topical, doctrinal, and comparative-religion works excluded). Grounded LAST so each resolves against the full clean cast already established.",
    dynamic: 'history', // catalog books where genre==='history'
  },
];
