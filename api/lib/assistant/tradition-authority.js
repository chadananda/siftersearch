// ONE authority model per tradition, as data: scripture → authoritative interpretation → tradition/commentary → scholarship.
// Bahá'í keeps Chad's order (10-23, 11-09); every other tradition's own scripture is core (authority.js doctrinalTier is the classifier).
// Fills prompts/templates ({{authority_order}}) and gives non-Bahá'í passages a Passage.authority kind. Pure. Deps: authority, tradition-name.
import { doctrinalTier, isTalkCollection } from '../authority.js';
import { canonicalTradition } from './tradition-name.js';
import { sourceTier } from './source-tier.js';

/** Tiers per canonical religion (tradition-name RELIGIONS), best first. `core`/`gray` are doctrinalTier's two canon tiers; the rest is commentary. */
export const AUTHORITY_MODEL = {
  "Baha'i": ["the Writings of the Báb, Bahá'u'lláh and 'Abdu'l-Bahá", 'Shoghi Effendi (letters written on his behalf included)', "pilgrims' notes of the Central Figures and the Guardian", 'scholarship, named by its author (the Universal House of Justice has legal authority only — never doctrinal or interpretive)'],
  Islam: ["the Qur'án", "the hadith collections and the sayings of the Imams (a recognised second tier)", 'tafsir and later theology, named by their author', 'modern scholarship'],
  Christian: ['the Bible (Old and New Testaments)', 'the deuterocanonical and early Christian writings', 'the Church Fathers, councils and later theology, named by their author', 'modern scholarship'],
  Judaism: ['the Tanakh (Torah, Prophets, Writings)', 'the Mishnah, Talmud, Midrash and Zohar', 'the rabbinic commentators and later thought, named by their author', 'modern scholarship'],
  Hindu: ['the Vedas, Upanishads, Bhagavad Gita and the epics', 'the Puranas, smriti and dharma texts', 'the acharyas’ commentaries, named by their author', 'modern scholarship'],
  Buddhist: ['the Pali Canon suttas and the Mahayana sutras (Dhammapada, Diamond, Heart and Lotus Sutras)', 'the Jataka, Abhidhamma and treatises', 'later commentary, named by its author', 'modern scholarship'],
  Jain: ['the Agamas and the foundational sutras (Acaranga, Uttaradhyayana, Tattvartha Sutra)', 'the niryuktis and classical commentaries', 'later teachers, named by their author', 'modern scholarship'],
  Sikh: ['the Guru Granth Sahib', 'the Dasam Granth, Janamsakhis and the Rahit', 'later Sikh teachers, named by their author', 'modern scholarship'],
  Zoroastrian: ['the Avesta (Gathas, Yasna, Vendidad, Yashts)', 'the Pahlavi books (Bundahishn, Denkard)', 'later priestly commentary, named by its author', 'modern scholarship'],
  Tao: ['the Tao Te Ching', 'the Zhuangzi and the Liezi', 'later Daoist commentary, named by its author', 'modern scholarship'],
  Confucian: ['the Analects and the Four Books and Five Classics (including the I Ching)', 'Mencius, Xunzi and the Record of Rites', 'later Neo-Confucian commentary, named by its author', 'modern scholarship'],
};
const GENERIC = ["the tradition's own scripture", 'its authoritative interpretation', 'its recognised commentary, named by its author', 'modern scholarship'];

/** The tier list for a tradition name ("Buddhism", "Hindu"…); the generic order for an unknown or absent one. Pure. */
export const authorityModel = (religion) => AUTHORITY_MODEL[canonicalTradition(religion)] || GENERIC;

/** The order as one sentence for a prompt/template slot: "Qur'án first; then …". Pure. */
export const authorityOrder = (religion) => authorityModel(religion).map((t, i) => (i ? `then ${t}` : `${t} first`)).join('; ');

// doctrinalTier core | gray | supplemental → the Passage.authority kind trees rank and filter by (tool-kit KIND)
const KIND_OF_TIER = { core: 'scripture', gray: 'interpretation', supplemental: 'scholarship' };

/** A NON-Bahá'í passage's authority kind from the tradition's own canon (doctrinalTier); null when its religion is unknown. Pure. */
export function traditionKind(p = {}) {
  if (!p || p.web || !String(p.religion || '').trim()) return null;
  try {
    const kind = KIND_OF_TIER[doctrinalTier({ religion: p.religion, collection: p.collection, title: p.title ?? p.source_title, author: p.book_author || p.author || p.source_author })];
    return isTalkCollection(p.collection) ? 'reported' : kind ?? null;
  } catch { return null; }
}

// kind → the source-tier name of the same rank, so one ordering/filter (TIER_ORDER, doctrinal sets) serves every tradition
const TIER_OF_KIND = { scripture: 'writings', interpretation: 'guardian', reported: 'reported', scholarship: 'secondary' };

/** A passage's standing as a source-tier NAME (writings > guardian > compilation > reported > house > secondary) for ANY tradition:
 *  Bahá'í by source-tier, others by their own canon (scripture ≙ 'writings', recognised second tier ≙ 'guardian'). null = truly unknown
 *  (no religion, web) — callers treat that as not doctrinal, never as doctrinal. Pure. */
export const standingOf = (p) => sourceTier(p) ?? TIER_OF_KIND[traditionKind(p)] ?? null;
