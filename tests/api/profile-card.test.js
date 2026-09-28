// profile-card — a person described by the MAJORITY of their facts, so a record still holding a minority of someone
// else's facts is not described by them.
import { describe, it, expect } from 'vitest';
import { factsFrom, renderCard } from '../../api/lib/profile-card.js';

const c = (relation, statement, extra = {}) => ({ relation, statement, ...extra });

describe('profile card', () => {
  const f = factsFrom({
    name: 'Mullá Ḥusayn', summary: 'The first Letter of the Living.', aliases: ["Bábu'l-Báb"],
    surfaces: [['Mullá Ḥusayn', 900], ['باب الباب', 40], ['he', 300], ['Bushrú’í', 12], ['Mullá Husain', 1]],
    claims: [
      c('son-of', "X — son-of Ḥájí 'Abdu'lláh", { tname: "Ḥájí Mullá 'Abdu'lláh-i-Ṣabbágh" }),
      c('son-of', "X — son-of Ḥájí 'Abdu'lláh", { tname: "Ḥájí Mullá 'Abdu'lláh-i-Ṣabbágh" }),
      c('son-of', 'X — son-of a Nayríz man', { tname: 'Ḥájí Muḥammad of Nayríz' }),   // a contaminating minority
      c('brother-of', 'X — brother-of M', { tname: 'Muḥammad-Ḥasan-i-Bushrú’í' }),
      c('participated-in', 'X — participated-in Ṭabarsí', { tname: 'Shaykh Ṭabarsí', ttype: 'place' }),
      c('characterized-as', 'X — characterized-as brave swordsman'), c('characterized-as', 'X — characterized-as brave swordsman'),
      c('characterized-as', 'X — characterized-as once only'),
      c('died', 'X — died', { tv: '1849', tb: 'stated' }), c('martyred', 'X — martyred', { tv: '1849', tb: 'pin' }), c('died', 'X — died', { tv: '1853', tb: 'estimate' }),
      c('met', 'X — met the Báb', { tv: '1844', tb: 'stated' }),
    ],
  });
  it('takes the names the texts use — titles and original script — but not pronouns or one-offs', () => {
    expect(f.names).toEqual(['باب الباب', 'Bushrú’í', "Bábu'l-Báb"]);
  });
  it('describes by the majority: the most-stated father first, roles that recur, a sure death year', () => {
    expect(f.kin[0]).toBe("son of Ḥájí Mullá 'Abdu'lláh-i-Ṣabbágh");
    expect(f.roles).toEqual(['brave swordsman']);
    expect(f.died).toBe(1849);
    expect(f.places).toEqual(['Shaykh Ṭabarsí']);
  });
  it('renders one compact line', () => {
    const card = renderCard(f);
    expect(card).toMatch(/^Mullá Ḥusayn \| also called: باب الباب/);
    expect(card).toMatch(/died 1849/);
    expect(card.length).toBeLessThan(700);
  });
});
