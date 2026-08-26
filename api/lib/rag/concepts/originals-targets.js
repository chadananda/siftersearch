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
    // THE HAYKAL NEEDS TWO PAGES. Its English is the single-tablet page and its Arabic is the
    // published-VOLUME page, and each 404s in the other's language (Chad supplied the pub06 URL). The `st`
    // catalogue I was sweeping never contained the `pub` series at all, which is why the probe could not
    // find it and why I concluded from the st-121 pages alone that the original was unpublished.
    // THE EMBEDDED TABLETS COME FIRST, deliberately. probe-stems found them nested inside the Haykal's
    // English range, and I first excluded them believing their text sat inside the Haykal's Arabic. The
    // arithmetic says otherwise: pub06-090 is 7,419 Arabic words against ~36,000 English in st-121, a 4.9:1
    // ratio no translation has. It is the Haykal PROPER — the kings' tablets are separate publications.
    // Listing them before the Haykal means the specific, tightly-bounded source wins any overlap, since the
    // collision guard keeps the first claim.
    'bahaullah-st-065',      // to the Pope — ours[102..130]
    'bahaullah-st-062',      // to Napoleon III — ours[131..157]
    'bahaullah-st-054',      // to the Czar — ours[158..170]
    'bahaullah-st-053',      // to Queen Victoria — ours[171..185]
    'bahaullah-st-018',      // Kitáb-i-Sulṭán, to the Sháh — ours[186..276]
    { en: 'bahaullah-st-121', src: 'bahaullah-pub06-090', lang: 'ar' },   // the Haykal proper — ours[2..101]
    'bahaullah-st-070-1', 'bahaullah-st-070-2', 'bahaullah-st-117', 'bahaullah-st-131',
  ], lang: 'ar', basis: 'segment',
    note: 'probe-stems found 13 hits; the nesting is real structure, and each nested tablet has its own original' },

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
    'abdul-baha-bkw26-01', 'abdul-baha-bkw26-02', 'abdul-baha-bkw26-03', 'abdul-baha-bkw26-04',
    'abdul-baha-bkw26-05', 'abdul-baha-bkw26-06', 'abdul-baha-bkw26-07', 'abdul-baha-bkw26-08',
    'abdul-baha-bkw26-09', 'abdul-baha-bkw26-10', 'abdul-baha-bkw26-11', 'abdul-baha-bkw26-12',
    'abdul-baha-bkw26-13', 'abdul-baha-bkw26-14', 'abdul-baha-bkw26-15', 'abdul-baha-bkw26-16',
    'abdul-baha-bkw26-17', 'abdul-baha-bkw26-18', 'abdul-baha-bkw26-19', 'abdul-baha-bkw26-20',
    'abdul-baha-bkw26-21', 'abdul-baha-bkw26-22', 'abdul-baha-bkw26-23', 'abdul-baha-bkw26-24',
    'abdul-baha-bkw26-25', 'abdul-baha-bkw26-26', 'abdul-baha-bkw26-27', 'abdul-baha-bkw26-28',
    'abdul-baha-bkw26-29', 'abdul-baha-bkw26-30', 'abdul-baha-bkw26-31', 'abdul-baha-bkw26-32',
    'abdul-baha-bkw26-33', 'abdul-baha-bkw26-34', 'abdul-baha-bkw26-35', 'abdul-baha-bkw26-36',
    'abdul-baha-bkw26-37', 'abdul-baha-bkw26-38', 'abdul-baha-bkw26-39', 'abdul-baha-bkw26-40',
    'abdul-baha-bkw26-41', 'abdul-baha-bkw26-42', 'abdul-baha-bkw26-43', 'abdul-baha-bkw26-44',
    'abdul-baha-bkw26-45', 'abdul-baha-bkw26-46', 'abdul-baha-bkw26-47', 'abdul-baha-bkw26-48',
    'abdul-baha-bkw26-49', 'abdul-baha-bkw26-50', 'abdul-baha-bkw26-51', 'abdul-baha-bkw26-52',
    'abdul-baha-bkw26-53', 'abdul-baha-bkw26-54', 'abdul-baha-bkw26-55', 'abdul-baha-bkw26-56',
    'abdul-baha-bkw26-57', 'abdul-baha-bkw26-58', 'abdul-baha-bkw26-59', 'abdul-baha-bkw26-60',
    'abdul-baha-bkw26-61', 'abdul-baha-bkw26-62', 'abdul-baha-bkw26-63', 'abdul-baha-bkw26-64',
    'abdul-baha-bkw26-65', 'abdul-baha-bkw26-66', 'abdul-baha-bkw26-67', 'abdul-baha-bkw26-68',
    'abdul-baha-bkw26-69',
  ], lang: 'fa', basis: 'segment',
    // ALL 69 CHAPTERS THE SITE PUBLISHES, taken from its SITE MAP. I first took them from the catalogue
    // page Chad linked, which lists 24, and reported "24 of the book's 77 memorials are published" — a
    // limitation of the source that was really a limitation of the index I happened to read. The sitemap
    // carries bkw26-01 through bkw26-69, every one with a Persian original.
    note: '69 chapter pages, each declaring a Persian original' },
});

/**
 * Stems the site LISTS but does not publish — the page and the .docx contain only a title and a
 * bibliographic citation pointing at a printed volume.
 *
 * Distinguished from NOT_THE_ORIGINAL because the failure is different and so is the remedy: that one is a
 * translation masquerading as an original (never use it), this one is an original nobody has digitised
 * here (use another source, or accept the gap).
 *
 * Recorded so it is not re-chased. Both transports were checked before concluding, since an empty result is
 * usually a bug in the reader — and what IS served explains the absence positively rather than by silence.
 */
export const STUB_ONLY = Object.freeze({
  // ⚠ SUPERSEDED, kept because the reasoning is worth not repeating. Everything measured below is true of
  // the `bahaullah-st-121` PAGES — and the conclusion I drew from it ("this original is not published") was
  // still wrong. The Súriy-i-Haykal's Arabic is at `bahaullah-pub06-090-ar`, 7,419 words, in a different
  // SERIES: the site keeps single tablets (`st`) apart from published volumes (`pub`), and my catalogue held
  // only the first. Controls prove a page is empty; they cannot prove a work is unpublished, because the
  // hypothesis space was never the whole site.
  'bahaullah-st-121__page-only': { work: 'Súriy-i-Haykal', lang: 'ar', supersededBy: 'bahaullah-pub06-090',
    serves: 'سورة الهيكل – حضرة بهاءالله – آثار قلم اعلى، ١٥٣ بديع، جلد ١، الصفحات ١ – ٨٨, plus the opening line',
    // MEASURED AGAINST KNOWN-GOOD STEMS, because an empty result is usually a bug in the reader and Chad was
    // right to push back twice ("all the pages are the same", "and they all have docx files too"). They are,
    // and applying that correctly is what proves this stem is the exception:
    //   st-131_ar  document.xml 65,804 chars → 7,214 words       st-011_fa 49,415 → 5,891
    //   st-015_ar  document.xml 83,117 chars → 10,952 words      st-121_ar  4,108 → 33
    // The .docx files are all ~130-155KB; that weight is images and styles, not text. What the Haykal's
    // 4KB body holds is a CITATION to the printed volume, which explains the absence positively.
    why: 'the site publishes only a citation for this work — page and .docx agree, and both differ from every other stem tested',
    costs: 'the Summons of the Lord of Hosts ours[2..277] — 275 paragraphs, the bulk of that book' },
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
