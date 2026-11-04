// The 11-03 quote case ("Religion is the greatest of all means…"): shared by the forensics and improve-cycle tests.
export const Q = 'Religion is the greatest of all means for the establishment of order in the world';
const T = `${Q} and for the tranquillity of all that dwell therein.`;
// shaped like the 11-03 trace: the periodical with the exact wording at #1, the Tablet (SE translation, ESW) at #9
export const CASE_1103 = {
  route: 'planned:quote', question: Q,
  reply: 'This is a passage from Bahá’u’lláh’s writings, reported in several places here. The fullest is in [The Bahá’í World, Volume II](https://oceanlibrary.com/bw2), as the search results show; the [Bahá’í Statement on Nature](https://oceanlibrary.com/bic) repeats it.',
  searches: [{
    trace_id: 't-1103', tool: 'quote_search', query: Q, filters: {}, kind: 'engine',
    timings: { hydrate: 3300, qkeyword: 40, total: 3700 },
    hits: [
      { rank: 1, doc_id: 101, title: 'The Bahá’í World, Volume II', author: 'Bahá’u’lláh', text: `(Epistles of 'Abdu'l-Baha) ${T}` },
      { rank: 2, doc_id: 102, title: 'Bahá’í Statement on Nature', author: 'Bahá’í International Community', text: T },
      { rank: 3, doc_id: 103, title: 'The Promise of World Peace', author: 'Universal House of Justice', text: T },
      { rank: 4, doc_id: 104, title: 'Messages of the Universal House of Justice 1963–1986', author: 'Universal House of Justice', text: T },
      { rank: 5, doc_id: 105, title: 'Kalimát-i-Firdawsíyyih', author: 'Bahá’u’lláh', language: 'fa', text: 'دین سبب اعظم است از برای نظم جهان' },
      { rank: 6, doc_id: 106, title: 'Fountain of Wisdom: Tablets of Bahá’u’lláh', author: 'Bahá’u’lláh', text: T },
      { rank: 7, doc_id: 107, title: 'A Study of Religion', author: 'Some Scholar', text: 'religion order discussed at length elsewhere' },
      { rank: 8, doc_id: 108, title: 'Century of Light', author: 'Universal House of Justice', text: 'unrelated passage on the century' },
      { rank: 9, doc_id: 109, title: 'Epistle to the Son of the Wolf', author: 'Bahá’u’lláh', text: `The second leaf of the Most Exalted Paradise: ${T}` },
    ],
  }],
  cited: [{ doc_id: 101, title: 'The Bahá’í World, Volume II' }, { doc_id: 102, title: 'Bahá’í Statement on Nature' }],
};
