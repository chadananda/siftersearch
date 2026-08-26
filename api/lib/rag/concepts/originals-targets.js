// concepts/originals-targets — the books whose ORIGINALS we are still locating, and where each one's is.
//
// Chad, 2026-08-26, naming the sources himself: Some Answered Questions (bahai.org), Memorials of the
// Faithful ("split by chapter"), Tablets of the Divine Plan, the Secret of Divine Civilization, the Seven
// Valleys. And on the allowlist variable that preceded this file: "These are variables you created. I did
// not… So this is fully your responsibility to manage… The rule is for code; edit properly and manage with
// git." Hence a module, reviewable and versioned, rather than an env var on a server.
//
// EVERY `lang` HERE WAS MEASURED, NOT ASSUMED — each stem's pages were fetched and asked what they are
// (`declaredRole`), because preferring Arabic filed oceanoflights' Arabic TRANSLATION of the Persian Secret
// of Divine Civilization as its "original", and nothing downstream could ever have detected it.
// Deps: none (data).

/**
 * Pages that exist but are NOT the original, recorded so one is never mistaken for one.
 *
 * Keyed by STEM, not by doc: this is a fact about a page, and the same work can have other pages that are
 * originals. That distinction is the whole lesson of the entry below.
 */
export const NOT_THE_ORIGINAL = Object.freeze({
  // The Tablets of the Divine Plan's WHOLE-BOOK Arabic page says مترجم — translated — and its whole-book
  // Persian page 404s. I concluded from those two facts that the work had no original online. WRONG, and
  // wrong in a way worth remembering: the site publishes this work BY CHAPTER, and all fourteen chapter
  // pages declare a Persian original (Chad, 2026-08-26: "it's split by chapter here… The source is Farsi").
  // A missing whole-book page is a fact about ONE URL, never about the work.
  'abdul-baha-bkw02': { work: 'Tablets of the Divine Plan', found: 'ar', declared: 'translation',
    why: 'the whole-book Arabic page is a rendering; the ORIGINAL is published per chapter (abdul-baha-bkw02-N-NN-fa)' },
  'abdul-baha-bkw19-ar': { work: 'The Secret of Divine Civilization', found: 'ar', declared: 'translation',
    why: 'the work is Persian; this Arabic page is a translation of it' },
});

/**
 * docId → where the original lives. `stems` is a LIST because a work may be published per chapter.
 *
 * `basis` says how the original relates to the English, and therefore which machinery applies:
 *   'verse-number'  — both sides carry a shared citation system; deterministic (the Kitáb-i-Aqdas)
 *   'segment'       — the original is a CONTINUOUS stream that must be cut to the English paragraphing by
 *                     comprehension (Chad: "the original has no original paragraph segmentation")
 */
export const ORIGINALS_TARGETS = Object.freeze({
  // TWO STEMS FOR ONE DOC: our copy prints the Seven Valleys and the Four Valleys together, and the site
  // publishes them as separate works (Haft-Vádí and Chihár-Vádí). Aligning only the first left the second
  // half of the document with no original at all — 55% doc coverage that reads like a failure and is really
  // a missing stem.
  20811: { work: 'The Seven Valleys and the Four Valleys', stems: ['bahaullah-st-006', 'bahaullah-st-007'], lang: 'fa', basis: 'segment',
    note: 'Persian originals 6,177 + 2,113 words in arbitrary blocks; the two works must be bound to disjoint stretches of the doc, which is what largestCluster is for' },
  20919: { work: 'The Secret of Divine Civilization', stems: ['abdul-baha-bkw19'], lang: 'fa', basis: 'segment',
    note: 'Persian original 21,989 words in 26 blocks; oceanoflights ALSO publishes an Arabic translation (abdul-baha-bkw19-ar) which must never be read as the original' },
  // FOURTEEN CHAPTER STEMS, each declaring a Persian original — measured, after the whole-book page had me
  // record this work as having none. 95 Persian paragraphs against our 221 English ones, so the source's
  // paragraphing is not usable and this is a segmentation job.
  20914: { work: 'Tablets of the Divine Plan', stems: [
    'abdul-baha-bkw02-1-01', 'abdul-baha-bkw02-1-02', 'abdul-baha-bkw02-1-03', 'abdul-baha-bkw02-1-04',
    'abdul-baha-bkw02-1-05', 'abdul-baha-bkw02-1-06', 'abdul-baha-bkw02-1-07', 'abdul-baha-bkw02-1-08',
    'abdul-baha-bkw02-2-01', 'abdul-baha-bkw02-2-02', 'abdul-baha-bkw02-2-03', 'abdul-baha-bkw02-2-04',
    'abdul-baha-bkw02-2-05', 'abdul-baha-bkw02-2-06',
  ], lang: 'fa', basis: 'segment',
    note: '11,084 Persian words in 95 blocks; the Arabic pages are translations and must never be read as the original' },
  // ── COMPILATIONS, discovered by probe-stems rather than recalled. Each of these is a gathering of tablets
  // that oceanoflights publishes separately; the deterministic English-to-English match found which ones and
  // in what order, at no cost. The ranges below came back disjoint and sequential, which is the check.
  20806: { work: 'The Summons of the Lord of Hosts', stems: [
    'bahaullah-st-121',      // Súriy-i-Haykal — ours[2..277]; NESTS the five tablets to the kings, so those
    'bahaullah-st-070-1',    //   stems (065 Pope, 062 Napoleon, 054 Czar, 053 Victoria, 018 Sháh) are NOT
    'bahaullah-st-070-2',    //   listed: their text is already inside the Haykal's Persian.
    'bahaullah-st-117',
    'bahaullah-st-131',
  ], lang: 'ar', basis: 'segment',
    note: 'probe-stems: 13 hits, 5 top-level works covering 98.6% of the document; the rest were nested or quoted' },

  20781: { work: 'Fountain of Wisdom / Tablets of Bahá’u’lláh Revealed After the Kitáb-i-Aqdas', stems: [
    'bahaullah-st-051', 'bahaullah-st-026', 'bahaullah-st-005', 'bahaullah-st-148', 'bahaullah-st-147',
    'bahaullah-st-012', 'bahaullah-st-036', 'bahaullah-st-011', 'bahaullah-st-043', 'bahaullah-st-002',
    'bahaullah-st-057', 'bahaullah-st-140', 'bahaullah-st-035', 'bahaullah-st-014', 'bahaullah-st-046-1',
  ], lang: 'ar', basis: 'segment',
    // TWO PAIRS OF STEMS CLAIMED IDENTICAL RANGES with identical counts — st-005/st-132 and st-035/st-110.
    // That is the site listing one tablet under two names, not two tablets in one place. Only one of each is
    // listed here; the collision guard in segment-ool-work would catch it either way.
    note: 'probe-stems: 15 disjoint tablets in sequence covering 75% of the document' },

  20907: { work: 'Memorials of the Faithful', stems: [
    'abdul-baha-bkw26-02', 'abdul-baha-bkw26-07', 'abdul-baha-bkw26-13', 'abdul-baha-bkw26-18',
    'abdul-baha-bkw26-20', 'abdul-baha-bkw26-21', 'abdul-baha-bkw26-22', 'abdul-baha-bkw26-23',
    'abdul-baha-bkw26-27', 'abdul-baha-bkw26-30', 'abdul-baha-bkw26-31', 'abdul-baha-bkw26-32',
    'abdul-baha-bkw26-33', 'abdul-baha-bkw26-34', 'abdul-baha-bkw26-35', 'abdul-baha-bkw26-41',
    'abdul-baha-bkw26-46', 'abdul-baha-bkw26-48', 'abdul-baha-bkw26-51', 'abdul-baha-bkw26-60',
    'abdul-baha-bkw26-63', 'abdul-baha-bkw26-64', 'abdul-baha-bkw26-67', 'abdul-baha-bkw26-69',
  ], lang: 'fa', basis: 'segment',
    // PARTIAL BY THE SOURCE'S OWN LIMIT, and said so here rather than discovered as a disappointing number
    // later: the book has 77 memorials and the catalogue publishes 24. The other 53 are not missing from our
    // fetch, they are absent from oceanoflights.
    note: '24 of the book’s 77 memorials are published, each as its own chapter page with a declared Persian original' },
});

/** Works whose original is real but NOT on oceanoflights — a different source, not a dead end. */
export const ORIGINALS_ELSEWHERE = Object.freeze({
  20911: { work: 'Some Answered Questions', lang: 'fa', source: 'bahai.org',
    path: 'abdul-baha/some-answered-questions',
    why: 'oceanoflights publishes only the English (abdul-baha-bkw22-{ar,fa} → 404); Chad supplied the bahai.org Persian text',
    // MEASURED: 781 numbered Persian paragraphs, 61,261 words, against our 789 English ones. The source's
    // paragraphing is real here, so the anchors are whole paragraphs rather than word-runs.
    note: 'sections 4-8 carry the body; 1-3 and 9+ are front matter and yield no numbered paragraphs' },
});

/** Every doc id we are actively sourcing an original for, from either place. */
export const ALL_ORIGINAL_TARGET_IDS = Object.freeze([
  ...Object.keys(ORIGINALS_TARGETS), ...Object.keys(ORIGINALS_ELSEWHERE)].map(Number));

export const isOriginalsTarget = (docId) => Object.hasOwn(ORIGINALS_TARGETS, Number(docId));
export const targetFor = (docId) => ORIGINALS_TARGETS[Number(docId)] ?? null;
