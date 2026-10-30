// Authors who broke the Covenant + the year (approximate — Chad to confirm) → donor-intake section 'covenant-breaker', kept apart; works written BEFORE the break may be imported (Chad 10-30).
// Patterns are deliberately narrow (full names, distinctive surnames): a bare "Sohrab" is the poet Sepehri as often as Ahmad Sohrab. Pure.
export const COVENANT_BREAKERS = [
  { name: 'Mírzá Yaḥyá (Ṣubḥ-i-Azal)', broke: 1866, re: /\bsubh[- ]?i[- ]?azal\b|\bmirza[ _-]yahya\b/i, note: 'Azalí split' },
  { name: 'Mírzá Muḥammad-‘Alí', broke: 1892, re: /\bghusn[- ]?i[- ]?akbar\b|\bmuhammad[- ]?'?ali effendi\b/i },
  { name: 'Mírzá Badí‘u’lláh', broke: 1892, re: /\bbadi'?[ -]?u'?l?[ -]?llah\b/i },
  { name: 'Mírzá Javád-i-Qazvíní', broke: 1892, re: /\bjavad[- ]?(?:i[- ])?qazvini\b/i },
  { name: 'Shu‘á‘u’lláh Behai', broke: 1892, re: /\bshu'?a'?[ -]?u?'?l?[ -]?llah\b|\bshua ullah\b/i },
  { name: 'Ibrahim George Kheiralla', broke: 1900, re: /\bkheir?alla\b|\bkhayru'?llah\b/i },
  { name: '‘Abdu’l-Ḥusayn Ávárih (Áyatí)', broke: 1925, re: /\bavarih\b|\babdu'?l[- ]?husayn[- ]ayati\b/i },
  { name: 'Ruth White', broke: 1926, re: /\bruth[ _-]white\b/i },
  { name: 'Ahmad Sohrab', broke: 1929, re: /\bahmad[ _-]sohrab\b|\bsohrab,? ahmad\b|\bnew history society\b|\bcaravan of east and west\b/i },
  { name: 'Ruhi Afnan', broke: 1941, re: /\bruhi[ _-]afnan\b|\bafnan,? ruhi\b/i },
  { name: 'Charles Mason Remey', broke: 1960, re: /\bremey\b/i },
  { name: 'Joel Bray Marangella', broke: 1960, re: /\bmarangella\b/i },
  { name: 'Leland Jensen', broke: 1960, re: /\bleland[ _-]jensen\b/i },
];

/** Any text (creator, title, path) → { name, broke, before } or null. before: true/false when the item's year is known, else null. */
export function covenantBreaker(year, ...texts) {
  const t = texts.filter(Boolean).join(' / ').replace(/[’‘`]/g, "'").normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hit = COVENANT_BREAKERS.find((c) => c.re.test(t));
  return hit ? { name: hit.name, broke: hit.broke, before: year ? year < hit.broke : null } : null;
}
