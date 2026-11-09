import { describe, it, expect } from 'vitest';
import { doctrinalTier as T } from '../../api/lib/authority.js';
import { coverageTier, isCore, TIER_CODE } from '../../api/lib/repos/coverage-repo.js';

const bahai = { religion: "Baha'i", collection: 'Books' };
describe('doctrinalTier (per paragraph author; Chad 11-09)', () => {
  it('Bahá’í: a Central Figure / Guardian paragraph is core in ANY book', () => {
    const lights = { ...bahai, title: 'Lights of Guidance', author: 'Helen Hornby' };
    expect(T(lights, { author: 'Shoghi Effendi' })).toBe('core');                       // Shoghi Effendi letter inside Lights of Guidance
    expect(T(lights, { author: 'Helen Hornby' })).toBe('supplemental');                  // the compiler's intro
    expect(T(lights, { author: 'Universal House of Justice' })).toBe('supplemental');   // a UHJ letter
    expect(T({ ...bahai, title: 'Paris Talks', author: "‘Abdu’l-Bahá" })).toBe('core');
    expect(T({ ...bahai, title: 'Paris Talks', author: "‘Abdu’l-Bahá" }, { author: "‘Abdu’l-Bahá" })).toBe('core');
  });
  it('a quoted tablet in a history is core; the historian’s narrative is not', () => {
    const history = { ...bahai, title: 'The Chronicle of Mázindarání', author: 'Mázindarání' };
    expect(T(history, { author: 'Bahá’u’lláh' })).toBe('core');
    expect(T(history, { author: 'Mázindarání' })).toBe('supplemental');
  });
  it('a website copy of the Hidden Words is core; Some Answered Questions is core; UHJ document is not', () => {
    expect(T({ religion: "Baha'i", collection: 'Library', title: 'The Hidden Words', author: 'Unknown', source_site: 'bahai-library.com' })).toBe('core');
    expect(T({ ...bahai, title: 'Some Answered Questions', author: 'Unknown' })).toBe('core');
    expect(T({ ...bahai, title: 'Messages 1963-1986', author: 'Universal House of Justice' })).toBe('supplemental');
    expect(T({ ...bahai, title: 'Compilation', author: "Compilation (Bahá'í Writings)" })).toBe('core');
  });
  it('pilgrim notes gray; media talks supplemental', () => {
    expect(T({ ...bahai, collection: 'Pilgrim Notes', title: 'Notes', author: 'A Pilgrim' })).toBe('gray');
    expect(T({ ...bahai, collection: 'Media', title: 'A talk', author: 'Modern Speaker' })).toBe('supplemental');
  });
  it('Islam: only the Qur’an is core; hadith and the Imams gray; tafsir supplemental', () => {
    const is = { religion: 'Islam', collection: 'Books' };
    expect(T({ ...is, title: 'The Qur’an (Rodwell)', author: 'Unknown' })).toBe('core');
    expect(T({ ...is, title: 'Sahih Bukhari', author: 'Al-Bukhari' })).toBe('gray');
    expect(T({ ...is, title: 'Nahj al-Balagha', author: 'Ali' })).toBe('gray');
    expect(T({ ...is, title: 'The Qur’an Commentary of al-Tabari', author: 'Tabari' })).toBe('supplemental');
  });
  it('Christianity: only the Bible; other traditions: scripture core, secondary canon gray', () => {
    expect(T({ religion: 'Christian', title: 'The King James Bible', author: 'Unknown' })).toBe('core');
    expect(T({ religion: 'Christian', title: 'Confessions', author: 'Augustine' })).toBe('supplemental');
    expect(T({ religion: 'Hindu', title: 'Bhagavad Gita (Arnold)', author: 'Vyāsa' })).toBe('core');
    expect(T({ religion: 'Jewish', title: 'The Talmud', author: 'Unknown' })).toBe('gray');
    expect(T({ religion: 'Buddhist', title: 'Jataka Tales', author: 'Unknown' })).toBe('gray');
    expect(T({ religion: 'Taoist', title: 'Zhuangzi', author: 'Zhuangzi' })).toBe('gray');
  });
  it('ledger code: a book with ≥1 core paragraph is core (1), gray 2, supplemental 0', () => {
    const lights = { ...bahai, title: 'Lights of Guidance', author: 'Helen Hornby' };
    const authors = JSON.stringify([{ name: 'Shoghi Effendi', role: 'author', basis: 'trailer' }]);
    expect(coverageTier(lights, [{ authors }])).toBe(TIER_CODE.core);
    expect(coverageTier(lights, [])).toBe(0);
    expect(isCore(lights, [{ authors }])).toBe(true);
    expect(coverageTier({ ...bahai, collection: 'Pilgrim Notes', title: 'n', author: 'x' })).toBe(2);
  });
});

describe('doctrinalTier canon fixes (11-09, real titles from ops report 1392521)', () => {
  const D = (religion, title, author) => ({ religion, collection: 'Books', title, author });
  it('A: commentary on a scripture is not the scripture (author + form markers)', () => {
    for (const [t, a] of [['Abarbanel on Ezekiel', 'Sefaria Community Translation'], ['Haamek Davar on Exodus', 'Sefaria Community Translation'], ['Ibn Ezra on Genesis', "Ibn Ezra's commentary on the Pentateuch, tran. and annot. by H. Norman Strickman"]]) expect(T(D('Judaism', t, a))).toBe('supplemental');
    expect(T(D('Islam', 'al-Itqan fi Ulum al-Quran (Arabic)', 'Jalal al-Din al-Suyuti'))).toBe('supplemental');
    expect(T(D('Islam', 'al-Jami li-Ahkam al-Quran (Arabic)', 'al-Qurtubi'))).toBe('supplemental');
    expect(T(D('Christian', 'Epistle Sermons Vol. 3 - Trinity Sunday to Advent', 'Martin Luther'))).toBe('supplemental');
    expect(T(D('Christian', 'The Epistles of St. Peter and St. Jude', 'Martin Luther'))).toBe('supplemental');
    expect(T(D('Taoist', '太上道德經講義 (Taishang Daodejing Jiangyi)', '宋常星 (Song Changxing)'))).toBe('supplemental');
    expect(T(D('Taoist', '道德真經論 司馬光 (Sima Guang on Daodejing)', '司馬光 (Sima Guang)'))).toBe('supplemental');
    expect(T(D('Confucian', '通書 (Tongshu - Penetrating the Book of Changes)', '周敦頤 (Zhou Dunyi)'))).toBe('supplemental');
  });
  it('A: real scriptures stay core', () => {
    expect(T(D('Christian', '1 Corinthians', 'Paul'))).toBe('core');
    expect(T(D('Christian', 'Douay-Rheims Bible', 'Various'))).toBe('core');
    expect(T(D('Taoist', 'Tao Te Ching (tr. D.C. Lau)', 'Laozi, tr. D.C. Lau'))).toBe('core');
    expect(T(D('Confucian', 'The Analects of Confucius (tr. James Legge)', 'Confucius, tr. James Legge'))).toBe('core');
    expect(T(D('Hindu', 'The Upanishads', 'tr. Swami Paramananda'))).toBe('core');
    expect(T(D('Islam', 'Sura CX. Help', 'Muhammad'))).toBe('core');
    expect(T(D('Judaism', 'Genesis', 'Unknown'))).toBe('core');
  });
  it('B: missed scriptures are core', () => {
    expect(T(D('Jain', 'Akaranga Sutra (Book 1)', 'tr. Hermann Jacobi'))).toBe('core');
    expect(T(D('Jain', 'Akaranga Sutra (Book 2)', 'tr. Hermann Jacobi'))).toBe('core');
    expect(T(D('Jain', 'Uttaradhyayana - Harikesa (Lecture 12)', 'tr. Hermann Jacobi'))).toBe('core');
    for (const t of ['Afrinagan 2', 'Afrinagan 3', 'Afrinagan 4', 'Sirozah 1', 'Sirozah 2']) expect(T(D('Zoroastrian', t, 'tr. James Darmesteter'))).toBe('core');
    expect(T(D('Zoroastrian', 'Arda Wiraz Namag', 'Unknown'))).toBe('gray');
    for (const [t, a] of [['周易 (Zhouyi)', '孔子 (Confucius)'], ['尚書 (Shangshu)', 'Various'], ['詩經 (Shijing)', 'Various'], ['The Shih King (Book of Poetry)', 'tr. James Legge']]) expect(T(D('Confucian', t, a))).toBe('core');
  });
  it('C: scholarship introductions are not scripture', () => {
    expect(T(D('Jain', 'Jain Sutras - Introduction (SBE Vol. 22)', 'Hermann Jacobi'))).toBe('supplemental');
    expect(T(D('Jain', 'Jain Sutras - Introduction (SBE Vol. 45)', 'Hermann Jacobi'))).toBe('supplemental');
  });
});
