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
