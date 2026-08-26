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

/** A source that exists but is NOT the original, recorded so it is never mistaken for one. */
export const NOT_THE_ORIGINAL = Object.freeze({
  // Chad pointed at https://oceanoflights.org/abdul-baha-bkw02-ar/ for the Tablets of the Divine Plan. The
  // page itself says مترجم — translated. The Tablets were revealed in Persian; oceanoflights publishes only
  // an Arabic RENDERING and no Persian page (fa → 404). Using it would put a translation in `original_text`.
  20914: { work: 'Tablets of the Divine Plan', stem: 'abdul-baha-bkw02',
    found: 'ar', declared: 'translation', why: 'oceanoflights holds only an Arabic translation; no Persian page exists there' },
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
  20811: { work: 'The Seven Valleys and the Four Valleys', stems: ['bahaullah-st-006'], lang: 'fa', basis: 'segment',
    note: 'Persian original 6,177 words in 51 arbitrary blocks against 125 English paragraphs; our doc also carries the Four Valleys, which this stem does not cover' },
  20919: { work: 'The Secret of Divine Civilization', stems: ['abdul-baha-bkw19'], lang: 'fa', basis: 'segment',
    note: 'Persian original 21,989 words in 26 blocks; oceanoflights ALSO publishes an Arabic translation (abdul-baha-bkw19-ar) which must never be read as the original' },
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
  20911: { work: 'Some Answered Questions', lang: 'fa',
    url: 'https://www.bahai.org/fa/library/authoritative-texts/abdul-baha/some-answered-questions/',
    why: 'oceanoflights publishes only the English (abdul-baha-bkw22-{ar,fa} → 404); Chad supplied the bahai.org Persian text' },
});

export const isOriginalsTarget = (docId) => Object.hasOwn(ORIGINALS_TARGETS, Number(docId));
export const targetFor = (docId) => ORIGINALS_TARGETS[Number(docId)] ?? null;
