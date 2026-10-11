// Language codes — the ONE normaliser (ISO 639-1, lowercase). The library carried en/En/Eng, fr/Fr/FR, de/De/Ger/ger…,
// so every language filter undercounted silently (CLAUDE.md trap). Ingest, sites-ingest and the DB backfill all use it.
const ALIASES = { eng: 'en', english: 'en', fre: 'fr', fra: 'fr', french: 'fr', ger: 'de', deu: 'de', german: 'de',
  spa: 'es', esp: 'es', spanish: 'es', ita: 'it', italian: 'it', heb: 'he', hebrew: 'he', per: 'fa', fas: 'fa', persian: 'fa',
  farsi: 'fa', ara: 'ar', arabic: 'ar', chi: 'zh', zho: 'zh', chinese: 'zh', nor: 'no', nob: 'no', norwegian: 'no',
  rus: 'ru', por: 'pt', jpn: 'ja', san: 'sa', pli: 'pi', urd: 'ur', tur: 'tr' };

/** → two-letter lowercase code; '' / null → 'und' (undetermined). Region tags drop: 'en-US' → 'en'. */
export function normLang(code) {
  const c = String(code || '').trim().toLowerCase().split(/[-_]/)[0];
  return c ? (ALIASES[c] || c.slice(0, 2)) : 'und';
}

/** Same, but keeps null for "not given" (frontmatter without a language stays unset rather than 'und'). */
export const normLangOrNull = (code) => (code == null || String(code).trim() === '' ? null : normLang(code));
