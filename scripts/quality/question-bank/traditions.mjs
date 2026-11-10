// The library's religions → name variants for the question bank. A = adherents (plural), R = the religion, F = founders/figures, S = scripture. `terms` = any one must appear at a word start (leading = also needs a word end) in a kept question.
export const TRADITIONS = {
  bahai: { label: "Baha'i", A: ['bahais', "baha'is", 'bahai'], R: ['bahai faith', "baha'i faith", 'bahaism'], F: ['bahaullah', "baha'u'llah", 'the bab', 'abdul baha'], S: ['kitab-i-aqdas', 'hidden words'], terms: ['bahai', "baha'i", 'bahá', 'bahaullah', "baha'u", '=the bab', 'abdul baha', 'aqdas', 'hidden words'] },
  judaism: { label: 'Judaism', A: ['jews', 'jewish people'], R: ['judaism', 'jewish religion'], F: ['moses', 'abraham'], S: ['the torah', 'the talmud'], terms: ['jew', 'judaism', 'torah', 'talmud', 'moses', 'abraham', 'rabbi'] },
  buddhism: { label: 'Buddhism', A: ['buddhists', 'buddhist monks'], R: ['buddhism'], F: ['the buddha', 'buddha'], S: ['the dhammapada', 'the tripitaka'], terms: ['buddhis', 'buddha', 'dhammapada', 'tripitaka', 'zen', 'nirvana'] },
  islam: { label: 'Islam', A: ['muslims'], R: ['islam'], F: ['muhammad', 'prophet muhammad'], S: ['the quran', 'the hadith'], terms: ['muslim', 'islam', 'quran', "qur'an", 'hadith', 'muhammad', 'allah'] },
  christianity: { label: 'Christianity', A: ['christians'], R: ['christianity'], F: ['jesus'], S: ['the bible', 'the gospel'], terms: ['christian', 'jesus', 'bible', 'gospel', 'trinity'] },
  hinduism: { label: 'Hinduism', A: ['hindus'], R: ['hinduism'], F: ['krishna'], S: ['the bhagavad gita', 'the vedas'], terms: ['hindu', 'krishna', 'gita', 'veda', 'upanishad', 'karma'] },
  zoroastrianism: { label: 'Zoroastrianism', A: ['zoroastrians'], R: ['zoroastrianism'], F: ['zoroaster'], S: ['the avesta'], terms: ['zoroast', 'zarathus', 'avesta', 'parsi'] },
  taoism: { label: 'Taoism', A: ['taoists', 'daoists'], R: ['taoism', 'daoism'], F: ['lao tzu', 'laozi'], S: ['the tao te ching'], terms: ['tao', 'dao', 'lao tzu', 'laozi', 'yin yang'] },
  confucianism: { label: 'Confucianism', A: ['confucianists'], R: ['confucianism'], F: ['confucius'], S: ['the analects'], terms: ['confuci', 'analects', 'mencius'] },
  sikhism: { label: 'Sikhism', A: ['sikhs'], R: ['sikhism'], F: ['guru nanak'], S: ['the guru granth sahib'], terms: ['sikh', 'guru nanak', 'granth', 'khalsa', 'kirpan', 'turban'] },
  jainism: { label: 'Jainism', A: ['jains'], R: ['jainism'], F: ['mahavira'], S: ['the agamas'], terms: ['jain', 'mahavira', 'agama', 'ahimsa'] },
};
// stems per name kind; {x} = the name
export const STEMS = {
  A: ['what do {x}', 'why do {x}', 'how do {x}', 'do {x}', 'are {x}', 'can {x}', 'when do {x}', 'where do {x}', 'who do {x}', 'should {x}', 'what do {x} believe', 'do {x} believe in', 'what do {x} think about', 'is it true that {x}', '{x} vs'],
  R: ['what is {x}', 'what does {x} teach', 'what does {x} say about', 'why is {x}', 'how did {x}', 'how does {x}', 'is {x}', 'does {x}', 'can {x}', 'when did {x}', 'who founded {x}', 'when was {x} founded', 'what are the beliefs of {x}', '{x} vs', '{x} or'],
  F: ['who was {x}', 'who is {x}', 'what did {x} teach', 'when was {x} born', 'what is {x} known for', 'what does {x} say about', 'why did {x}'],
  S: ['what is {x}', 'what does {x} say about', 'who wrote {x}', 'what does {x} teach', 'how many books are in {x}', 'what is the meaning of {x}'],
};
// these stems also get a-z expansion
export const ALPHA = [['A', 'why do {x}'], ['A', 'do {x}'], ['A', 'how do {x}'], ['R', 'what is {x}'], ['R', 'does {x}'], ['R', 'what does {x} say about']];
