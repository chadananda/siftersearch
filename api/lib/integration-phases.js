// The book-integration ROADMAP for the biography "progress" view — the phased plan toward "all history
// absorbed". Doc-ids only; titles/authors + live grounded-person counts + per-book SIZE resolve from the DB
// (getIntegrationProgress in bio.js). HISTORICAL (factual) track only.
//
// Phase model (2026-07-13):
//   seed        — God Passes By + The Dawn-Breakers (the authority seed — the core cast).
//   foundation  — all the TRUSTWORTHY BAHÁ'Í SCHOLARS (that is what makes it authoritative historically):
//                 Saiedi (Gate of the Heart), Taherzadeh (ROB) + Balyuzi (author-routed), Mázindarání, Momen,
//                 Ahdieh. The carefully-documented scholarship that is the bedrock beneath the seed.
//   primary     — FIRSTHAND/documentary: 'Abdu'l-Bahá's own texts, eyewitness/pilgrim notes, and EVERYTHING
//                 translated/edited by Ahang Rabbani (author-routed) — the Nayríz documents + primary narratives.
//   biographies — the classified long tail: individual lives (content-sample genre === 'biography').
//   histories   — the classified long tail: general histories (genre === 'history'), some not Bahá'í-centric.
//
// AUTHOR routing + explicit PINS (below) run in bio.js and OVERRIDE a book's static/genre placement, so the whole
// Balyuzi/Taherzadeh/Rabbani corpus sorts correctly, not just the curated anchors.
export const INTEGRATION_PHASES = [
  {
    key: 'seed', label: 'Seed',
    blurb: "The authority seed — the Guardian's God Passes By and Nabíl's Dawn-Breakers together establish the core cast that every later book resolves against.",
    docs: [21310, 21308], // God Passes By (Shoghi Effendi) + The Dawn-Breakers (Nabíl)
  },
  {
    key: 'foundation', label: 'Foundation',
    blurb: "The trustworthy Bahá'í scholars — that is what makes this the authoritative historical foundation. Careful, well-documented research: Saiedi's Gate of the Heart (the Báb's tablets) and Taherzadeh's Revelation of Bahá'u'lláh, Balyuzi's biographies of the Central Figures, Mázindarání's Ẓuhúru'l-Ḥaqq, Momen's Western accounts, and Ahdieh's Awakening. The bedrock beneath the seed that the whole cast resolves against.",
    docs: [
      8632,                                                          // Gate of the Heart (Saiedi — the Báb's tablets)
      15228, 15257, 15254, 20028, 15256, 20035, 20037, 15255, 15259, // Mázindarání — Ẓuhúru'l-Ḥaqq (Persian)
      13433,                                                         // Momen — The Bábí & Bahá'í Religions
      20331,                                                         // Ahdieh & Chapman — Awakening (Nayríz history)
      // + everything by H.M. Balyuzi and Adib Taherzadeh (author-routed via AUTHOR_ROUTING below).
    ],
  },
  {
    key: 'primary', label: 'Primary Sources', upcoming: true,
    blurb: "FIRSTHAND / documentary — 'Abdu'l-Bahá's own texts, eyewitness & pilgrim notes, and everything translated or compiled by Ahang Rabbani (the Nayríz documents and primary narratives). High evidential value but loosely collected AS TEXTS, so each resolves AGAINST the foundation rather than overriding it.",
    docs: [
      20907, 20919, 11355, 11335, 12472, 214474, // 'Abdu'l-Bahá texts + pilgrim diaries + The Afnán Family; Rabbani joins via author routing.
    ],
  },
  {
    key: 'biographies', label: 'Biographies', upcoming: true,
    blurb: "Individual lives — biographies of believers, martyrs, and figures, tightly focused on specific people. Grounded BEFORE the general histories: the clean per-person cast disentangles identities before the broader (and sometimes non-Bahá'í) narrative histories are absorbed.",
    dynamic: 'biography', // catalog books where genre==='biography' (bahai-history-catalog.json)
  },
  {
    key: 'histories', label: 'General Histories', upcoming: true,
    blurb: "General published histories — the broad narrative context, some of it not Bahá'í-centric. Content-sample classified from the 'Baha'i Books' collection (topical, doctrinal, comparative-religion excluded). Grounded LAST so each resolves against the full clean cast.",
    dynamic: 'history', // catalog books where genre==='history'
  },
];

// AUTHOR routing — a book by these authors is PLACED in the given phase regardless of its genre/catalog placement.
// Matched against the docs.author string (case-insensitive substring). This is why every Balyuzi/Taherzadeh work
// lands in Foundation and every Rabbani translation in Primary, not just the named anchors.
export const AUTHOR_ROUTING = [
  { re: /balyuzi|taherzadeh/i, phase: 'foundation' },
  { re: /rabbani/i, phase: 'primary' },
];

// Intended grounding SEQUENCE (order of absorption) — orders books WITHIN each phase in the popup so the roadmap
// reads in the order books are actually absorbed, not scattered by size. Books not listed sort after the listed
// ones (grounded first, then largest first). Extend as the plan grows.
export const ABSORPTION_ORDER = [
  21310, 21308, 8632, 429, 430, 431, 432,                          // GPB · Dawn-Breakers · Gate · ROB vols 1-4
  466, 462, 3789, 3887, 464, 465, 467, 463, 427, 426,              // Balyuzi + Taherzadeh (Foundation; 466 canonical, not stray-scrape 28849)
  15228, 15257, 15254, 20028, 15256, 20035, 20037, 15255, 15259, 13433, 20331, // Máz · Momen · Awakening (Foundation)
  20907, 20919, 11355, 11335, 12472, 16552, 11265, 16316, 11344, 214474, 15347, 11374, 9095, // Primary
];

// Explicit PINS (docId → phase) for specific books whose author doesn't match a rule but which belong in a phase:
// pilgrim notes + firsthand primary narratives → primary; Redman's collective account → foundation.
export const PINNED_DOCS = {
  15347: 'primary',    // 1912, Ella Cooper's Notes From California (pilgrim notes)
  11374: 'primary',    // The Genesis of the Bábí-Bahá'í Faiths in Shíráz and Fárs (Afnán — firsthand)
  9095: 'foundation',  // 'Abdu'l-Bahá in Their Midst (Redman)
};
