// Companion §8 — the primary-text course companion. A curriculum GRAPH, not a conversion funnel or a
// fixed sequence: the user's question/goal leads to the relevant track. The core texts all live in the
// corpus already (OceanLibrary). Recommendation is by stated goal + question history + reading ability;
// the user always chooses. Tracks are config here; enrollment/progress persist in the DB (relationship.js).

export const TRACKS = [
  {
    id: 'foundations',
    title: 'Foundations & Worldview',
    capability: 'Moral vocabulary, God and human nature, science–religion, social principles',
    texts: ['The Hidden Words', 'Gleanings from the Writings of Bahá’u’lláh (selected)', 'Some Answered Questions', 'The Promulgation of Universal Peace'],
    goals: ['understand core beliefs', 'god', 'human nature', 'science and religion', 'social principles', 'morality', 'what do bahais believe'],
  },
  {
    id: 'revelation',
    title: 'Revelation & Interpretation',
    capability: 'Progressive revelation, symbolism, recognition, justice, prejudice',
    texts: ['The Kitáb-i-Íqán', 'Epistle to the Son of the Wolf', 'Gleanings (selected)'],
    goals: ['progressive revelation', 'prophecy', 'symbolism', 'return', 'recognition', 'why so many religions', 'seal of the prophets'],
  },
  {
    id: 'sacred_history',
    title: 'Sacred History',
    capability: 'Chronology, actors, sacrifice, source perspective, authoritative synthesis',
    texts: ['The Dawn-Breakers', 'God Passes By'],
    goals: ['history', 'the bab', 'martyrs', 'dawn-breakers', 'early believers', 'persecution', 'chronology'],
  },
  {
    id: 'covenant',
    title: 'Covenant & Social Transformation',
    capability: 'Covenant, authority, world order, moral qualities, mission, nonpartisanship',
    texts: ['The Dispensation of Bahá’u’lláh', 'The Promised Day Is Come', 'The Advent of Divine Justice', 'Tablets of the Divine Plan'],
    goals: ['covenant', 'world order', 'administration', 'nonpartisan', 'social change', 'teaching', 'mission'],
  },
  {
    id: 'devotional',
    title: 'Devotional Integration',
    capability: 'Encounter devotional language without treating experience as proof',
    texts: ['Prayers and Meditations by Bahá’u’lláh'],
    goals: ['prayer', 'meditation', 'devotion', 'worship', 'spiritual life'],
  },
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Recommend 1–2 tracks by stated goal / question history. Never vulnerability-triggered (the caller
 * gates on distress). Returns [{track, score}] best-first, score 0..1.
 */
export function recommendTracks(signals = {}) {
  const text = norm([signals.goal, ...(signals.recentQuestions || []), ...(signals.topics || [])].join(' '));
  const scored = TRACKS.map((t) => {
    const hits = t.goals.filter((g) => text.includes(norm(g))).length;
    return { track: t, score: Math.min(1, hits / 3) };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, 2);
}

export const getTrack = (id) => TRACKS.find((t) => t.id === id) || null;

// A course-section object skeleton (§8) — populated per passage-range when a section is built.
export function makeSection({ trackId, passageRefs = [], orientation = '', keyTerms = [] }) {
  return {
    track_id: trackId,
    passage_refs: passageRefs,
    orientation,                 // speaker/genre/purpose/context/why — shown BEFORE reading
    key_terms: keyTerms,
    comprehension_checks: [],    // one asked AFTER reading (explainable understanding, not pages)
    interpretive_questions: [],  // optional
    reflection_options: [],      // optional
    misconceptions: [],
  };
}
