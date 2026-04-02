<script>
  // Religion color map — distinct per tradition
  const RELIGION_COLORS = {
    'Buddhist':    { bg: '#f59e0b', text: '#78350f' },
    'Christian':   { bg: '#3b82f6', text: '#1e3a5f' },
    'Confucian':   { bg: '#10b981', text: '#064e3b' },
    'Hindu':       { bg: '#f97316', text: '#7c2d12' },
    'Jain':        { bg: '#8b5cf6', text: '#3b0764' },
    'Jewish':      { bg: '#06b6d4', text: '#164e63' },
    'Sikh':        { bg: '#ec4899', text: '#831843' },
    'Tao':         { bg: '#84cc16', text: '#3f6212' },
    'Zoroastrian': { bg: '#ef4444', text: '#7f1d1d' },
  };

  // Tier styling
  const TIER_STYLES = {
    1: { label: 'Tier 1', desc: 'Absolute Essentials', color: '#f59e0b', icon: '★' },
    2: { label: 'Tier 2', desc: 'Major Scholarly Works', color: '#94a3b8', icon: '◆' },
    3: { label: 'Tier 3', desc: 'Deepening the Collections', color: '#a78bfa', icon: '●' },
    4: { label: 'Tier 4', desc: 'Scholarly Depth', color: '#6b7280', icon: '◉' },
  };

  // All 119 acquisition entries
  const ALL_ENTRIES = [
    // Tier 1
    { tier: 1, num: 1,   religion: 'Buddhist',    title: 'The Middle Length Discourses (Majjhima Nikaya)', author: 'tr. Bhikkhu Nanamoli & Bhikkhu Bodhi (Wisdom)', why: 'The definitive modern translation of 152 suttas. The scholarly gold standard — every Buddhist studies program uses this. We have individual ATI suttas but not this complete, annotated edition.' },
    { tier: 1, num: 2,   religion: 'Buddhist',    title: 'The Connected Discourses (Samyutta Nikaya)', author: 'tr. Bhikkhu Bodhi (Wisdom)', why: '2,904 suttas organized by topic. Bhikkhu Bodhi\'s translation with 2,000+ notes is irreplaceable for doctrinal study.' },
    { tier: 1, num: 3,   religion: 'Buddhist',    title: 'The Numerical Discourses (Anguttara Nikaya)', author: 'tr. Bhikkhu Bodhi (Wisdom)', why: '9,557 suttas. Completes the four main Nikayas.' },
    { tier: 1, num: 4,   religion: 'Buddhist',    title: 'The Long Discourses (Digha Nikaya)', author: 'tr. Maurice Walshe (Wisdom)', why: '34 major suttas including the Mahaparinibbana. Standard complete translation.' },
    { tier: 1, num: 5,   religion: 'Sikh',        title: 'Sri Guru Granth Sahib (complete, 4 vols)', author: 'tr. Manmohan Singh', why: 'The most comprehensive verse-by-verse English translation of the central Sikh scripture with Gurmukhi text and transliteration. We have individual banis from BaniDB but not this complete scholarly edition.' },
    { tier: 1, num: 6,   religion: 'Hindu',       title: 'The Rig Veda', author: 'tr. Stephanie Jamison & Joel Brereton (Oxford, 2014)', why: 'First complete scholarly English translation in over a century. 1,028 hymns. This is THE modern Rig Veda.' },
    { tier: 1, num: 7,   religion: 'Hindu',       title: 'The Principal Upanishads', author: 'tr. Patrick Olivelle (Oxford, 1996)', why: 'Definitive modern translation of all principal Upanishads with critical apparatus. Replaced Radhakrishnan as the scholarly standard.' },
    { tier: 1, num: 8,   religion: 'Hindu',       title: 'The Bhagavad Gita', author: 'tr. Barbara Stoler Miller (Bantam, 1986)', why: 'Most widely assigned Gita in universities. Clean, accurate, literary. We have Gutenberg versions but not this standard modern one.' },
    { tier: 1, num: 9,   religion: 'Christian',   title: 'New Revised Standard Version (NRSV) Bible', author: 'NRSV Translation Committee', why: 'The standard academic Bible. Used in virtually all university religion departments.' },
    { tier: 1, num: 10,  religion: 'Buddhist',    title: 'The Lotus Sutra', author: 'tr. Burton Watson (Columbia, 1993)', why: 'The most influential Mahayana sutra in East Asia. Foundation of Tiantai/Tendai and Nichiren Buddhism.' },
    { tier: 1, num: 11,  religion: 'Confucian',   title: 'The Analects of Confucius', author: 'tr. Edward Slingerland (Hackett, 2003)', why: 'Best modern scholarly translation with traditional commentary. We have Legge but not this.' },
    { tier: 1, num: 12,  religion: 'Sikh',        title: 'Sri Guru Granth Sahib Darpan (10 vols)', author: 'Professor Sahib Singh', why: 'The gold standard for Gurbani study — phrase-by-phrase Punjabi exegesis with grammatical analysis. Indispensable for any serious Sikh library.' },
    { tier: 1, num: 13,  religion: 'Jewish',      title: 'Tanakh: The Holy Scriptures (JPS, 1985)', author: 'Jewish Publication Society', why: 'The standard modern Jewish English Bible. We have the newer Gender-Sensitive JPS from Sefaria, but this classic JPS is still widely referenced.' },
    { tier: 1, num: 14,  religion: 'Tao',         title: 'Zhuangzi: The Essential Writings', author: 'tr. Brook Ziporyn (Hackett, 2009)', why: 'Best recent scholarly translation with philosophical commentary. We have Giles (1889) from Gutenberg but not a modern academic version.' },
    { tier: 1, num: 15,  religion: 'Tao',         title: 'Tao Te Ching', author: 'tr. D.C. Lau (Penguin, 1963)', why: 'The standard academic translation. We have terebess.hu excerpt but need the full Penguin edition with introduction and notes.' },
    { tier: 1, num: 16,  religion: 'Buddhist',    title: 'Visuddhimagga (The Path of Purification)', author: 'tr. Bhikkhu Nanamoli (BPS)', why: 'The definitive Theravada meditation and doctrine manual. 900 pages, no free digital version.' },
    { tier: 1, num: 17,  religion: 'Zoroastrian', title: 'The Gathas of Zarathushtra', author: 'tr. Helmut Humbach (Universitätsverlag, 1991)', why: 'The critical philological edition. We have SBE Mills translation from avesta.org but not this scholarly standard.' },
    { tier: 1, num: 18,  religion: 'Hindu',       title: 'The Mahabharata (complete)', author: 'tr. Bibek Debroy (Penguin, 2010–2014, 10 vols)', why: 'First unabridged modern English translation. We have partial Gutenberg volumes (Ganguli) but this is the contemporary standard.' },
    { tier: 1, num: 19,  religion: 'Jain',        title: 'Tattvartha Sutra (That Which Is)', author: 'tr. Nathmal Tatia (HarperCollins, 1994)', why: 'The one text accepted by all Jain sects. Definitive English translation of Jain systematic philosophy.' },
    { tier: 1, num: 20,  religion: 'Buddhist',    title: 'The Bodhicaryavatara (Guide to the Bodhisattva\'s Way of Life)', author: 'tr. Padmakara Translation Group or Vesna Wallace & B. Alan Wallace', why: 'Shantideva\'s masterpiece — the supreme Mahayana text on compassion.' },
    { tier: 1, num: 21,  religion: 'Confucian',   title: 'Mencius', author: 'tr. D.C. Lau (Penguin, 1970)', why: 'Standard modern translation of the second most important Confucian text.' },
    { tier: 1, num: 22,  religion: 'Hindu',       title: 'Ramayana of Valmiki (complete)', author: 'tr. Robert Goldman et al. (Princeton, 1984–2017, 7 vols)', why: 'The definitive scholarly Ramayana in English. 50 years in the making.' },
    { tier: 1, num: 23,  religion: 'Buddhist',    title: 'The Heart Sutra & Diamond Sutra', author: 'tr. Red Pine (Counterpoint)', why: 'The two most recited Mahayana sutras with extensive commentary.' },
    { tier: 1, num: 24,  religion: 'Zoroastrian', title: 'Textual Sources for the Study of Zoroastrianism', author: 'ed. Mary Boyce (U Chicago, 1984)', why: 'The standard scholarly anthology — carefully selected and annotated excerpts from all major Zoroastrian texts.' },
    { tier: 1, num: 25,  religion: 'Zoroastrian', title: 'A History of Zoroastrianism (3 vols)', author: 'Mary Boyce (Brill, 1975–1991)', why: 'The definitive academic history. Nothing else comes close.' },
    { tier: 1, num: 26,  religion: 'Christian',   title: 'Early Christian Writings: The Apostolic Fathers', author: 'tr. Andrew Louth / Maxwell Staniforth (Penguin)', why: 'Didache, Clement, Ignatius, Polycarp, Shepherd of Hermas — the earliest post-biblical Christian texts.' },
    { tier: 1, num: 27,  religion: 'Sikh',        title: 'Dasam Granth (complete)', author: 'Attributed to Guru Gobind Singh, tr. various', why: 'The second most important Sikh scripture. Contains Jaap Sahib, Bachitar Natak, Chaupai Sahib, Zafarnama. No complete scholarly English translation exists — this is a critical gap.' },
    { tier: 1, num: 28,  religion: 'Jain',        title: 'Jaina Sutras (SBE vols 22 & 45)', author: 'tr. Hermann Jacobi', why: 'We have these from Gutenberg but they need quality checking. The only complete English Agama translations.' },
    // Tier 2
    { tier: 2, num: 29,  religion: 'Buddhist',    title: 'The Dhammapada', author: 'tr. Gil Fronsdal (Shambhala, 2005)', why: 'Best modern translation of the most beloved Buddhist text. We have ATI and Gutenberg versions but not this.' },
    { tier: 2, num: 30,  religion: 'Buddhist',    title: 'Mulamadhyamakakarika (Fundamental Wisdom of the Middle Way)', author: 'Nagarjuna, tr. Jay Garfield (Oxford, 1995)', why: 'Foundation of Madhyamaka philosophy. Arguably the most important Buddhist philosophical text after the suttas.' },
    { tier: 2, num: 31,  religion: 'Buddhist',    title: 'The Lankavatara Sutra', author: 'tr. Red Pine (Counterpoint, 2012)', why: 'Key text for Zen/Chan and Yogacara. Foundation of mind-only philosophy.' },
    { tier: 2, num: 32,  religion: 'Buddhist',    title: 'Shobogenzo', author: 'Dogen, tr. Kazuaki Tanahashi (Shambhala)', why: 'Masterpiece of Japanese Soto Zen. Complex philosophical writing.' },
    { tier: 2, num: 33,  religion: 'Buddhist',    title: 'The Tibetan Book of the Dead (Bardo Thodol)', author: 'tr. Robert Thurman or Francesca Fremantle & Chogyam Trungpa', why: 'Essential Vajrayana text. Multiple good translations.' },
    { tier: 2, num: 34,  religion: 'Buddhist',    title: 'Lamrim Chenmo (Great Treatise on the Stages of the Path)', author: 'Tsongkhapa, tr. Lamrim Chenmo Translation Committee (Snow Lion, 3 vols)', why: 'Definitive Gelugpa manual. Dalai Lama\'s own tradition.' },
    { tier: 2, num: 35,  religion: 'Sikh',        title: 'Bhai Gurdas Vaaran (complete)', author: 'Bhai Gurdas, tr. various', why: 'Called "the key to the Guru Granth Sahib" by Guru Arjan. 40 vaars essential for understanding Sikh scripture and early Sikh history.' },
    { tier: 2, num: 36,  religion: 'Sikh',        title: 'Suraj Prakash Granth', author: 'Bhai Santokh Singh (1843), tr. various', why: 'The most comprehensive traditional narrative of Sikh history — lives of all ten Gurus in 51,820 verses. Monumental 19th-century work.' },
    { tier: 2, num: 37,  religion: 'Sikh',        title: 'A History of the Sikhs (2 vols)', author: 'Khushwant Singh (Oxford, 1963–1966)', why: 'The standard modern history covering 1469–2004. Accessible, authoritative, and beautifully written.' },
    { tier: 2, num: 38,  religion: 'Sikh',        title: 'Faridkot Tika (4 vols)', author: 'Court scholars of Maharaja Bikram Singh (1883)', why: 'First systematic commentary on the entire Guru Granth Sahib. Traditional Vedantic-influenced interpretation. Historically essential.' },
    { tier: 2, num: 39,  religion: 'Christian',   title: 'The Philokalia (complete, 4 vols)', author: 'tr. G.E.H. Palmer, Philip Sherrard, Kallistos Ware (Faber)', why: 'The central anthology of Eastern Orthodox spiritual texts. 4th–15th century. Nothing else represents Orthodoxy as well.' },
    { tier: 2, num: 40,  religion: 'Christian',   title: 'Institutes of the Christian Religion', author: 'John Calvin, tr. Ford Lewis Battles (Westminster John Knox)', why: 'The systematic theology of Reformed Christianity. One of the most influential Christian books ever written.' },
    { tier: 2, num: 41,  religion: 'Christian',   title: 'The Cloud of Unknowing', author: 'ed. James Walsh (Paulist Press)', why: 'Anonymous 14th-century English mystical classic.' },
    { tier: 2, num: 42,  religion: 'Christian',   title: 'Mere Christianity', author: 'C.S. Lewis', why: 'The most widely read modern Christian apologetic.' },
    { tier: 2, num: 43,  religion: 'Confucian',   title: 'Sishu Zhangju Jizhu (Collected Commentaries on the Four Books)', author: 'Zhu Xi', why: 'THE commentary that defined Confucian orthodoxy for 600 years. Imperial exam standard 1313–1905.' },
    { tier: 2, num: 44,  religion: 'Confucian',   title: 'Sources of Chinese Tradition (2 vols)', author: 'ed. Wm. Theodore de Bary (Columbia)', why: 'Standard university anthology covering Confucian, Taoist, Buddhist, and modern Chinese thought.' },
    { tier: 2, num: 45,  religion: 'Confucian',   title: 'Instructions for Practical Living (Chuanxilu)', author: 'Wang Yangming, tr. Wing-tsit Chan', why: 'Core text of the rival Neo-Confucian school. Mind-as-principle philosophy.' },
    { tier: 2, num: 46,  religion: 'Hindu',       title: 'Brahma Sutras', author: 'tr. S. Radhakrishnan (Allen & Unwin, 1960)', why: 'Systematic synthesis of Upanishadic philosophy. With Gita and Upanishads, forms the Prasthanatrayi.' },
    { tier: 2, num: 47,  religion: 'Hindu',       title: 'Yoga Sutras of Patanjali', author: 'tr. Edwin Bryant (North Point, 2009)', why: 'Definitive modern scholarly translation with all major classical commentaries.' },
    { tier: 2, num: 48,  religion: 'Hindu',       title: 'Bhagavata Purana (Srimad Bhagavatam)', author: 'tr. Edwin Bryant (Penguin) or Bibek Debroy', why: 'The definitive text for Krishna devotion. Most important Purana.' },
    { tier: 2, num: 49,  religion: 'Hindu',       title: 'The Devi Mahatmya (Markandeya Purana, ch. 81–93)', author: 'tr. Thomas Coburn', why: 'Foundation of Shakta/Goddess tradition.' },
    { tier: 2, num: 50,  religion: 'Tao',         title: 'The Taoist Body', author: 'Kristofer Schipper (U California, 1993)', why: 'Authoritative study of Taoist ritual, cosmology, and bodily practice by a Western Taoist priest.' },
    { tier: 2, num: 51,  religion: 'Tao',         title: 'Original Tao: Inward Training (Nei-yeh)', author: 'tr. Harold Roth (Columbia, 1999)', why: 'Critical translation of the earliest Chinese meditation text.' },
    { tier: 2, num: 52,  religion: 'Tao',         title: 'Early Chinese Mysticism', author: 'Livia Kohn (Princeton, 1992)', why: 'Study of inner cultivation from early sources through Tang.' },
    { tier: 2, num: 53,  religion: 'Zoroastrian', title: 'The Dawn and Twilight of Zoroastrianism', author: 'R.C. Zaehner (Weidenfeld, 1961)', why: 'Influential mid-century scholarly overview.' },
    { tier: 2, num: 54,  religion: 'Zoroastrian', title: 'Zurvan: A Zoroastrian Dilemma', author: 'R.C. Zaehner (Oxford, 1955)', why: 'Major study of the Zurvanite theological tradition.' },
    { tier: 2, num: 55,  religion: 'Jewish',      title: 'The Guide for the Perplexed', author: 'Maimonides, tr. Shlomo Pines (U Chicago, 1963)', why: 'Pines translation is the scholarly standard. We have Sefaria version but Pines\' notes and introduction are essential.' },
    { tier: 2, num: 56,  religion: 'Jain',        title: 'The Jaina Path of Purification', author: 'Padmanabh Jaini (U California, 1979)', why: 'The best single-volume introduction to Jain philosophy and practice by a major scholar.' },
    { tier: 2, num: 57,  religion: 'Jain',        title: 'Samayasara (The Self)', author: 'Kundakunda, tr. A. Chakravarti', why: 'Most important Digambara philosophical text. Profound work on the nature of the soul.' },
    // Tier 3
    { tier: 3, num: 58,  religion: 'Buddhist',    title: 'The Flower Ornament Scripture (Avatamsaka Sutra)', author: 'tr. Thomas Cleary (Shambhala, 1993)', why: 'Vast Mahayana vision of cosmic interpenetration. Foundation of Huayan Buddhism. 1,600 pages.' },
    { tier: 3, num: 59,  religion: 'Buddhist',    title: 'The Blue Cliff Record (Biyan Lu)', author: 'tr. Thomas & J.C. Cleary (Shambhala)', why: '100 Zen koans with commentary. Together with Mumonkan, the core of koan practice.' },
    { tier: 3, num: 60,  religion: 'Buddhist',    title: 'The Vimalakirti Sutra', author: 'tr. Burton Watson (Columbia, 1997)', why: 'Teachings on non-duality through a brilliant lay practitioner.' },
    { tier: 3, num: 61,  religion: 'Buddhist',    title: 'Abhidhammattha Sangaha', author: 'tr. Bhikkhu Bodhi (BPS, 2012)', why: 'Comprehensive manual of Abhidhamma — the Buddhist psychological system.' },
    { tier: 3, num: 62,  religion: 'Buddhist',    title: 'The Record of Linji (Linji Lu)', author: 'tr. Ruth Fuller Sasaki (U Hawaii, 2009)', why: 'Definitive translation of the founder of Rinzai Zen.' },
    { tier: 3, num: 63,  religion: 'Buddhist',    title: 'What the Buddha Taught', author: 'Walpola Rahula (Grove, 1959)', why: 'The best single-volume introduction to Theravada Buddhism. Assigned in every intro Buddhism course.' },
    { tier: 3, num: 64,  religion: 'Christian',   title: 'On the Incarnation', author: 'Athanasius, tr. John Behr (St. Vladimir\'s)', why: 'Classic defense of the Incarnation. Short, accessible, foundational.' },
    { tier: 3, num: 65,  religion: 'Christian',   title: 'Proslogion', author: 'Anselm, tr. Thomas Williams', why: 'Contains the ontological argument for God\'s existence.' },
    { tier: 3, num: 66,  religion: 'Christian',   title: 'Mystical Theology', author: 'Pseudo-Dionysius, tr. Colm Luibheid (Paulist)', why: 'Foundation of apophatic (negative) theology in Christianity.' },
    { tier: 3, num: 67,  religion: 'Christian',   title: 'The Interior Castle', author: 'Teresa of Avila, tr. Mirabai Starr or Kieran Kavanaugh', why: 'Classic of Christian contemplative literature. Seven mansions of the soul.' },
    { tier: 3, num: 68,  religion: 'Christian',   title: 'Dark Night of the Soul', author: 'John of the Cross, tr. Mirabai Starr', why: 'The mystical journey through spiritual desolation to union with God.' },
    { tier: 3, num: 69,  religion: 'Confucian',   title: 'The Analects', author: 'tr. Simon Leys (W.W. Norton, 1997)', why: 'Elegant modern literary translation. Complements Slingerland\'s scholarly version.' },
    { tier: 3, num: 70,  religion: 'Confucian',   title: 'Xunzi: The Complete Text', author: 'tr. Eric Hutton (Princeton, 2014)', why: 'First complete modern English translation. Important counterpoint to Mencius — human nature as requiring cultivation.' },
    { tier: 3, num: 71,  religion: 'Confucian',   title: 'Reflections on Things at Hand (Jinsilu)', author: 'tr. Wing-tsit Chan (Columbia, 1967)', why: 'Zhu Xi and Lü Zuqian\'s anthology of Neo-Confucian thought. The Neo-Confucian primer.' },
    { tier: 3, num: 72,  religion: 'Sikh',        title: 'Parasaraprasna (The Baisakhi of Guru Gobind Singh)', author: 'Kapur Singh (Guru Nanak Dev University, 1989)', why: 'Most important modern work of Sikh theology. Explores the metaphysics of the Khalsa and the nature of Sikh revelation.' },
    { tier: 3, num: 73,  religion: 'Sikh',        title: 'The Sikh Rahit Maryada', author: 'SGPC (official edition)', why: 'The official Sikh code of conduct. Essential for understanding lived Sikhism. Should include historical rahitnamas for context.' },
    { tier: 3, num: 74,  religion: 'Sikh',        title: 'Guru Nanak and the Sikh Religion', author: 'W.H. McLeod (Oxford, 1968)', why: 'Landmark (and controversial) critical-historical study that transformed academic Sikh studies.' },
    { tier: 3, num: 75,  religion: 'Sikh',        title: 'The Construction of Religious Boundaries', author: 'Harjot Oberoi (U Chicago, 1994)', why: 'Major scholarly work on the formation of Sikh identity. Controversial but essential.' },
    { tier: 3, num: 76,  religion: 'Hindu',       title: "Shankara's Crest-Jewel of Discrimination (Vivekachudamani)", author: 'tr. Swami Prabhavananda', why: 'Classic Advaita Vedanta text on discrimination between real and unreal.' },
    { tier: 3, num: 77,  religion: 'Hindu',       title: 'The Gospel of Sri Ramakrishna', author: 'tr. Swami Nikhilananda (Ramakrishna-Vivekananda Center, 1942)', why: 'Direct record of Ramakrishna\'s conversations. Central text of modern Hindu universalism.' },
    { tier: 3, num: 78,  religion: 'Hindu',       title: 'The Complete Works of Swami Vivekananda (8 vols)', author: 'Swami Vivekananda', why: 'Modern synthesis of Vedanta that brought Hinduism to the West.' },
    { tier: 3, num: 79,  religion: 'Hindu',       title: 'The Life Divine', author: 'Sri Aurobindo (Sri Aurobindo Ashram)', why: 'Integral philosophy — the evolution of consciousness. Major modern Hindu philosophical work.' },
    { tier: 3, num: 80,  religion: 'Hindu',       title: 'Tantra in Practice', author: 'ed. David Gordon White (Princeton, 2000)', why: 'Best scholarly anthology of Hindu and Buddhist tantric texts.' },
    { tier: 3, num: 81,  religion: 'Tao',         title: 'The Encyclopedia of Taoism', author: 'ed. Fabrizio Pregadio (Routledge, 2008)', why: 'Comprehensive modern reference. 2 vols, 1,800+ entries.' },
    { tier: 3, num: 82,  religion: 'Tao',         title: 'Taoism: The Enduring Tradition', author: 'Russell Kirkland (Routledge, 2004)', why: 'Academic corrective to popular Western misconceptions.' },
    { tier: 3, num: 83,  religion: 'Tao',         title: 'The Secret of the Golden Flower', author: 'tr. Thomas Cleary (HarperOne, 1991)', why: 'Internal alchemy meditation manual. Replaces the flawed Wilhelm/Jung version.' },
    { tier: 3, num: 84,  religion: 'Zoroastrian', title: 'Zoroastrians: Their Religious Beliefs and Practices', author: 'Mary Boyce (Routledge, 2001)', why: 'The standard modern introduction.' },
    { tier: 3, num: 85,  religion: 'Zoroastrian', title: 'The Spirit of Zoroastrianism', author: 'tr. Prods Oktor Skjaervo (Yale, 2011)', why: 'Recent anthology with scholarly commentary.' },
    { tier: 3, num: 86,  religion: 'Jain',        title: 'The A to Z of Jainism', author: 'Kristi Wiley (Scarecrow, 2004)', why: 'Best reference work for Jain terms, concepts, and history.' },
    // Tier 4
    { tier: 4, num: 87,  religion: 'Buddhist',    title: "In the Buddha's Words: An Anthology of Discourses from the Pali Canon", author: 'ed. Bhikkhu Bodhi (Wisdom, 2005)', why: 'Best thematic anthology. Perfect entry point for the Pali Canon.' },
    { tier: 4, num: 88,  religion: 'Buddhist',    title: 'The Experience of Insight', author: 'Joseph Goldstein', why: 'Foundational modern vipassana text.' },
    { tier: 4, num: 89,  religion: 'Buddhist',    title: 'The Jewel Ornament of Liberation', author: 'Gampopa, tr. Khenpo Konchog Gyaltsen', why: 'Definitive Kagyu path manual.' },
    { tier: 4, num: 90,  religion: 'Buddhist',    title: 'The Life of Milarepa', author: 'tr. Lobsang Lhalungpa (Penguin)', why: 'Most beloved Tibetan Buddhist biography.' },
    { tier: 4, num: 91,  religion: 'Buddhist',    title: 'Buddhacarita (Acts of the Buddha)', author: 'Ashvaghosha, tr. Patrick Olivelle (NYU, 2008)', why: 'Sanskrit epic poem — the first full biography of the Buddha.' },
    { tier: 4, num: 92,  religion: 'Christian',   title: 'The Cost of Discipleship', author: 'Dietrich Bonhoeffer', why: '"Cheap grace vs. costly grace." Essential modern Protestant theology from a martyr of Nazism.' },
    { tier: 4, num: 93,  religion: 'Christian',   title: 'Systematic Theology', author: 'Paul Tillich (3 vols)', why: 'Major 20th-century Protestant systematic theology.' },
    { tier: 4, num: 94,  religion: 'Christian',   title: 'The Meaning of Icons', author: 'Leonid Ouspensky & Vladimir Lossky', why: 'Essential for understanding Orthodox theology through visual tradition.' },
    { tier: 4, num: 95,  religion: 'Christian',   title: 'The Orthodox Way', author: 'Kallistos Ware (St. Vladimir\'s)', why: 'Best single-volume introduction to Eastern Orthodox Christianity.' },
    { tier: 4, num: 96,  religion: 'Christian',   title: 'Jesus Christ, Sun of God (or similar Christology)', author: 'Various', why: 'A scholarly Christological work representing modern biblical scholarship.' },
    { tier: 4, num: 97,  religion: 'Confucian',   title: 'A Source Book in Chinese Philosophy', author: 'Wing-tsit Chan (Princeton, 1963)', why: 'THE single-volume anthology of Chinese philosophical texts. Used in every Chinese philosophy course.' },
    { tier: 4, num: 98,  religion: 'Confucian',   title: 'Confucius and the Analects: New Essays', author: 'ed. Bryan Van Norden (Oxford, 2002)', why: 'State-of-the-art scholarly perspectives on the Analects.' },
    { tier: 4, num: 99,  religion: 'Hindu',       title: 'The Laws of Manu (Manusmriti)', author: 'tr. Patrick Olivelle (Oxford, 2005)', why: 'Definitive modern critical translation. Controversial but essential.' },
    { tier: 4, num: 100, religion: 'Hindu',       title: 'Arthashastra', author: 'Kautilya, tr. Patrick Olivelle (Oxford, 2013)', why: 'Ancient Indian statecraft. Often compared to Machiavelli.' },
    { tier: 4, num: 101, religion: 'Hindu',       title: 'A Survey of Hinduism', author: 'Klaus Klostermaier (SUNY, 2007)', why: 'Best comprehensive single-volume academic introduction.' },
    { tier: 4, num: 102, religion: 'Hindu',       title: 'Kashmir Shaivism: The Secret Supreme', author: 'Swami Lakshman Joo', why: 'Introduction to the non-dual Shaiva tradition of Kashmir.' },
    { tier: 4, num: 103, religion: 'Tao',         title: 'Daoism Handbook', author: 'ed. Livia Kohn (Brill, 2000)', why: 'Major academic reference covering all periods and aspects.' },
    { tier: 4, num: 104, religion: 'Tao',         title: 'To Live as Long as Heaven and Earth', author: 'Robert Ford Campany (U California, 2002)', why: "Major study of Ge Hong's Traditions of Divine Transcendents." },
    { tier: 4, num: 105, religion: 'Tao',         title: 'Taoism and Chinese Religion', author: 'Henri Maspero, tr. Frank Kierman (U Massachusetts, 1981)', why: 'Pioneering scholarly study. Still influential.' },
    { tier: 4, num: 106, religion: 'Zoroastrian', title: 'The Wiley Blackwell Companion to Zoroastrianism', author: 'ed. Stausberg & Vevaina (Wiley, 2015)', why: 'Comprehensive modern academic reference.' },
    { tier: 4, num: 107, religion: 'Zoroastrian', title: 'Zoroastrianism: An Introduction', author: 'Jenny Rose (I.B. Tauris, 2011)', why: 'Best accessible modern academic introduction.' },
    { tier: 4, num: 108, religion: 'Jain',        title: 'Collected Papers on Jaina Studies', author: 'Padmanabh Jaini (Motilal Banarsidass, 2000)', why: 'Major essays by the foremost Western Jain scholar.' },
    { tier: 4, num: 109, religion: 'Jain',        title: 'The Doctrine of the Jainas', author: 'Walther Schubring, tr. Wolfgang Beurlen (Motilal, 2000)', why: 'Classic German scholarly monograph. Standard reference.' },
    { tier: 4, num: 110, religion: 'Jain',        title: 'Dravyasangraha (Collection of Substances)', author: 'Nemichandra, tr. S.C. Ghoshal', why: 'Concise systematic Jain ontology. Elegant and important.' },
    { tier: 4, num: 111, religion: 'Sikh',        title: 'Pracheen Panth Prakash', author: 'Rattan Singh Bhangu (1841)', why: 'Eyewitness oral history of 18th-century Sikh struggles. Written at the request of the British — raw, vivid, indispensable primary source.' },
    { tier: 4, num: 112, religion: 'Sikh',        title: 'Mahan Kosh (Encyclopaedia of Sikh Literature)', author: 'Bhai Kahn Singh Nabha (1930)', why: 'The foundational Sikh encyclopedic dictionary in Punjabi. Defines every term in the Guru Granth Sahib.' },
    { tier: 4, num: 113, religion: 'Sikh',        title: 'Bhai Nand Lal: Complete Persian Works', author: 'Bhai Nand Lal Goya, tr. various', why: 'Divan-e-Goya, Zindagi Nama, Ganj Nama — the great Persian Sikh poet. Court poet of Guru Gobind Singh.' },
    { tier: 4, num: 114, religion: 'Sikh',        title: 'The Spirit of the Sikh (2 vols)', author: 'Puran Singh (1920s)', why: 'Lyrical, mystical essays on Sikh spirituality. The most beautiful English prose ever written about Sikhism.' },
    { tier: 4, num: 115, religion: 'Sikh',        title: 'Ham Hindu Nahin (We Are Not Hindus)', author: 'Bhai Kahn Singh Nabha (1898)', why: 'Foundational text of modern Sikh identity. Argued for Sikh distinctness during the Singh Sabha movement.' },
    { tier: 4, num: 116, religion: 'Sikh',        title: 'Sikhism: Its Ideals and Institutions', author: 'Teja Singh (Orient Longmans, 1951)', why: 'Classic overview of Sikh theology and practice by a leading Singh Sabha scholar.' },
    { tier: 4, num: 117, religion: 'Sikh',        title: 'Encyclopedia of Sikhism (4 vols)', author: 'ed. Harbans Singh (Punjabi University, 1992–1998)', why: 'The most comprehensive reference work on Sikhism ever compiled.' },
    { tier: 4, num: 118, religion: 'Sikh',        title: 'Guru Granth Sahib: Canon, Meaning, and Authority', author: 'Pashaura Singh (Oxford, 2000)', why: 'Modern scholarly study of the formation and authority of the Sikh scripture.' },
    { tier: 4, num: 119, religion: 'Jewish',      title: 'Major Trends in Jewish Mysticism', author: 'Gershom Scholem (Schocken, 1941)', why: 'Founded the modern academic study of Kabbalah. Still indispensable.' },
  ];

  // All unique religions in sorted order
  const ALL_RELIGIONS = [...new Set(ALL_ENTRIES.map(e => e.religion))].sort();
  const ALL_TIERS = [1, 2, 3, 4];

  // Reactive state
  let searchQuery = $state('');
  let activeReligions = $state(new Set(ALL_RELIGIONS));
  let activeTiers = $state(new Set(ALL_TIERS));
  let expandedRows = $state(new Set());

  // Derived: filtered entries
  let filtered = $derived(() => {
    const q = searchQuery.toLowerCase().trim();
    return ALL_ENTRIES.filter(e => {
      if (!activeReligions.has(e.religion)) return false;
      if (!activeTiers.has(e.tier)) return false;
      if (!q) return true;
      return e.title.toLowerCase().includes(q) || e.author.toLowerCase().includes(q) || e.why.toLowerCase().includes(q);
    });
  });

  // Derived: stats
  let stats = $derived(() => {
    const byReligion = {};
    const byTier = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const e of filtered()) {
      byReligion[e.religion] = (byReligion[e.religion] || 0) + 1;
      byTier[e.tier]++;
    }
    return { total: filtered().length, byReligion, byTier };
  });

  function toggleReligion(r) {
    const next = new Set(activeReligions);
    next.has(r) ? next.delete(r) : next.add(r);
    activeReligions = next;
  }

  function toggleTier(t) {
    const next = new Set(activeTiers);
    next.has(t) ? next.delete(t) : next.add(t);
    activeTiers = next;
  }

  function toggleRow(num) {
    const next = new Set(expandedRows);
    next.has(num) ? next.delete(num) : next.add(num);
    expandedRows = next;
  }

  function selectAllReligions() { activeReligions = new Set(ALL_RELIGIONS); }
  function clearAllReligions() { activeReligions = new Set(); }

  // Group filtered entries by tier for rendering
  let byTier = $derived(() => {
    const groups = {};
    for (const e of filtered()) {
      if (!groups[e.tier]) groups[e.tier] = [];
      groups[e.tier].push(e);
    }
    return groups;
  });
</script>

<div class="acquisition-list">
  <!-- Stats bar -->
  <div class="stats-bar">
    <div class="stat-total">
      <span class="stat-number">{stats().total}</span>
      <span class="stat-label">texts shown</span>
    </div>
    <div class="stat-tiers">
      {#each ALL_TIERS as t}
        {#if stats().byTier[t] > 0}
          <span class="stat-tier" style="color: {TIER_STYLES[t].color}">
            {TIER_STYLES[t].icon} T{t}: {stats().byTier[t]}
          </span>
        {/if}
      {/each}
    </div>
  </div>

  <!-- Controls -->
  <div class="controls">
    <!-- Search -->
    <div class="search-wrap">
      <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        class="search-input"
        type="text"
        placeholder="Search by title, author, or description..."
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button class="search-clear" onclick={() => searchQuery = ''} aria-label="Clear search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      {/if}
    </div>

    <!-- Tier filters -->
    <div class="filter-group">
      <span class="filter-label">Tier</span>
      <div class="filter-pills">
        {#each ALL_TIERS as t}
          <button
            class="tier-pill"
            class:active={activeTiers.has(t)}
            style={activeTiers.has(t) ? `background: ${TIER_STYLES[t].color}22; border-color: ${TIER_STYLES[t].color}; color: ${TIER_STYLES[t].color}` : ''}
            onclick={() => toggleTier(t)}
          >
            {TIER_STYLES[t].icon} {TIER_STYLES[t].label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Religion filters -->
    <div class="filter-group">
      <div class="filter-label-row">
        <span class="filter-label">Religion</span>
        <button class="filter-action" onclick={selectAllReligions}>All</button>
        <span class="filter-divider">/</span>
        <button class="filter-action" onclick={clearAllReligions}>None</button>
      </div>
      <div class="filter-pills">
        {#each ALL_RELIGIONS as r}
          {@const color = RELIGION_COLORS[r] || { bg: '#64748b', text: '#fff' }}
          <button
            class="religion-pill"
            class:active={activeReligions.has(r)}
            style={activeReligions.has(r) ? `background: ${color.bg}22; border-color: ${color.bg}; color: ${color.bg}` : ''}
            onclick={() => toggleReligion(r)}
          >
            {r}
            {#if stats().byReligion[r]}
              <span class="pill-count">{stats().byReligion[r]}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Entry list grouped by tier -->
  {#if filtered().length === 0}
    <div class="empty-state">No texts match the current filters.</div>
  {:else}
    {#each ALL_TIERS as t}
      {#if byTier()[t]?.length > 0}
        <!-- Tier header -->
        <div class="tier-header" style="border-color: {TIER_STYLES[t].color}">
          <span class="tier-icon" style="color: {TIER_STYLES[t].color}">{TIER_STYLES[t].icon}</span>
          <div class="tier-header-text">
            <span class="tier-name" style="color: {TIER_STYLES[t].color}">{TIER_STYLES[t].label}</span>
            <span class="tier-desc">{TIER_STYLES[t].desc}</span>
          </div>
          <span class="tier-count" style="color: {TIER_STYLES[t].color}">{byTier()[t].length} texts</span>
        </div>

        <!-- Entries for this tier -->
        <div class="entry-list">
          {#each byTier()[t] as entry}
            {@const color = RELIGION_COLORS[entry.religion] || { bg: '#64748b', text: '#fff' }}
            {@const expanded = expandedRows.has(entry.num)}
            <div class="entry" class:expanded>
              <button class="entry-main" onclick={() => toggleRow(entry.num)} aria-expanded={expanded}>
                <span class="entry-num">{entry.num}</span>
                <span class="religion-badge" style="background: {color.bg}22; color: {color.bg}; border: 1px solid {color.bg}44">
                  {entry.religion}
                </span>
                <div class="entry-text">
                  <span class="entry-title">{entry.title}</span>
                  <span class="entry-author">{entry.author}</span>
                </div>
                <span class="expand-icon" aria-hidden="true">{expanded ? '−' : '+'}</span>
              </button>
              {#if expanded}
                <div class="entry-why">
                  <span class="why-label">Why essential:</span>
                  {entry.why}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .acquisition-list {
    font-size: 0.9rem;
  }

  /* Stats bar */
  .stats-bar {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0.75rem 1rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }
  .stat-total {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
  }
  .stat-number {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .stat-label {
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .stat-tiers {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .stat-tier {
    font-size: 0.8rem;
    font-weight: 600;
  }

  /* Controls */
  .controls {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  /* Search */
  .search-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  .search-icon {
    position: absolute;
    left: 0.75rem;
    color: var(--text-muted);
    pointer-events: none;
    flex-shrink: 0;
  }
  .search-input {
    width: 100%;
    padding: 0.625rem 2.5rem 0.625rem 2.5rem;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 0.5rem;
    color: var(--text-primary);
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.15s;
  }
  .search-input:focus {
    border-color: var(--input-border-focus);
  }
  .search-input::placeholder {
    color: var(--input-placeholder);
  }
  .search-clear {
    position: absolute;
    right: 0.75rem;
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    align-items: center;
  }
  .search-clear:hover { color: var(--text-primary); }

  /* Filter groups */
  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .filter-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }
  .filter-label-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .filter-action {
    font-size: 0.7rem;
    color: var(--accent-primary);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }
  .filter-action:hover { color: var(--accent-primary-hover); }
  .filter-divider {
    color: var(--text-muted);
    font-size: 0.7rem;
  }
  .filter-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  /* Tier pills */
  .tier-pill,
  .religion-pill {
    padding: 0.25rem 0.625rem;
    border-radius: 2rem;
    border: 1px solid var(--border-default);
    background: none;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .tier-pill:hover,
  .religion-pill:hover {
    color: var(--text-primary);
    border-color: var(--border-strong);
  }
  .tier-pill.active,
  .religion-pill.active {
    font-weight: 600;
  }
  .pill-count {
    font-size: 0.7rem;
    opacity: 0.8;
    margin-left: 0.125rem;
  }

  /* Tier header */
  .tier-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-left: 4px solid;
    background: var(--surface-1);
    border-radius: 0 0.375rem 0.375rem 0;
    margin: 1.5rem 0 0.5rem;
  }
  .tier-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }
  .tier-header-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .tier-name {
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 1;
  }
  .tier-desc {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .tier-count {
    font-size: 0.75rem;
    font-weight: 600;
    opacity: 0.8;
  }

  /* Entry list */
  .entry-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  /* Entry */
  .entry {
    background: var(--surface-0);
    transition: background 0.1s;
  }
  .entry:hover { background: var(--surface-1); }
  .entry.expanded { background: var(--surface-1); }
  .entry + .entry {
    border-top: 1px solid var(--border-subtle);
  }

  .entry-main {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.75rem 1rem;
    color: inherit;
  }
  .entry-main:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .entry-num {
    width: 1.75rem;
    text-align: right;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .religion-badge {
    padding: 0.125rem 0.5rem;
    border-radius: 2rem;
    font-size: 0.7rem;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    letter-spacing: 0.02em;
  }

  .entry-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .entry-title {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.875rem;
    line-height: 1.3;
  }
  .entry-author {
    font-size: 0.775rem;
    color: var(--text-muted);
    line-height: 1.3;
  }

  .expand-icon {
    color: var(--text-muted);
    font-size: 1rem;
    font-weight: 400;
    width: 1.25rem;
    text-align: center;
    flex-shrink: 0;
    line-height: 1;
  }

  /* Expanded why row */
  .entry-why {
    padding: 0.625rem 1rem 0.875rem calc(1rem + 1.75rem + 0.75rem + 4rem);
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.6;
    border-top: 1px solid var(--border-subtle);
  }
  .why-label {
    font-weight: 600;
    color: var(--text-primary);
    margin-right: 0.375rem;
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .entry-main { gap: 0.5rem; padding: 0.625rem 0.75rem; }
    .entry-num { width: 1.5rem; }
    .entry-why { padding: 0.625rem 0.75rem 0.75rem; }
    .religion-badge { display: none; }
    .tier-header { padding: 0.625rem 0.75rem; }
  }
</style>
