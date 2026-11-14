// Reader preferences kept on this device (Chad 11-14): theme (system | light | dark, applied before first paint by the app
// shell's prep script, which reads THEME_KEY itself) and the "what Anís knows about me" list from GET /api/chat/bio.
export const THEME_KEY = 'anis-theme';
export const THEMES = ['system', 'light', 'dark'];

export function loadTheme(storage) {
  try { const t = storage.getItem(THEME_KEY); return THEMES.includes(t) ? t : 'system'; } catch { return 'system'; }
}
export function saveTheme(storage, theme) {
  try { if (theme === 'system') storage.removeItem(THEME_KEY); else storage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
}
export const nextTheme = (t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];   // toolbar cycle: system → light → dark → system
export const isDark = (theme, systemDark) => theme === 'dark' || (theme === 'system' && !!systemDark);

const KIND = { tradition: 'Tradition', level: 'Level', interest: 'Interest', language: 'Language', role: 'Role', work: 'Work or person' };   // = indications.js KINDS
// the bio response → rows to show: label, value, the reader's own words; anything malformed is dropped, never thrown
export function bioRows(json) {
  const list = Array.isArray(json?.indications) ? json.indications : [];
  return list.filter((i) => i && typeof i.value === 'string' && i.value.trim())
    .map((i) => ({ label: KIND[i.kind] || 'Noted', value: i.value.trim(), evidence: typeof i.evidence === 'string' ? i.evidence.trim() : '' }));
}
