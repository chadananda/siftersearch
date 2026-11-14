// What a card may show (Dawn-Breakers battery 11-14: `[pg 54]`/`[^71]` leaked into cards, a raw PDF page became a card, file names
// stood as titles). cleanCardText strips the library's page and footnote markers; isPdfDump spots a passage scraped from a PDF page
// (a running header or bare site address on its own line, justified double spacing, hard-wrapped lines) — never shown as a card;
// readableTitle turns a file-name title into the work's real title (the canon of works), else a plain one. Pure. Deps: tool-defs.
import { canonWork } from '../tool-defs.js';

/** `[pg 54]`, `[p. 12]`, `{pg 3}`, `[^71]`, `[^n]`, a bare `^71` after a word or quote mark → gone; spacing left whole. */
export const cleanCardText = (text) => String(text ?? '')
  .replace(/\s*[[{](?:pg?|page)\.?\s*\d+[a-z]?[\]}]\s*/gi, (m) => (/^\s|\s$/.test(m) ? ' ' : ''))
  .replace(/\[\^[\w-]{1,6}\]/g, '')
  .replace(/(?<=[\p{L}.,;:!?’”"')])\^\d{1,4}\b/gu, '')
  .replace(/[ \t]{2,}/g, ' ').replace(/ +([,.;:!?])/g, '$1').trim();

const BARE_ADDRESS = /^\s*(?:https?:\/\/|www\.)\S+\s*$/im;   // "www.oceanoflights.org" as a line: a PDF page's running header/footer
/** A passage that is a PDF page dump, not a paragraph. */
export const isPdfDump = (text) => {
  const t = String(text || '');
  if (BARE_ADDRESS.test(t)) return true;
  if ((t.match(/\S {2,}\S/g) || []).length >= 6) return true;   // justified text: "which  it  took  its  Author"
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  // hard-wrapped: most lines end mid-sentence (no closing punctuation) — a paragraph is one line, a poem's lines are short
  const cut = lines.filter((l) => l.length >= 55 && !/[.!?:;”"’)\]]$/.test(l));
  return lines.length >= 6 && cut.length >= 0.6 * lines.length;
};

/** A title that is a file name or address slug ("shoghi-effendi-trans-011-the-dawn-breakers_en", "bab-khutab-10-en-notes"). */
export const isFileTitle = (t) => { const s = String(t || '').trim(); return !!s && (/\.(?:pdf|docx?|html?|txt)$/i.test(s) || (!/\s/.test(s) && /[-_]/.test(s) && (/[_\d]/.test(s) || /^[a-z-]+$/.test(s)))); };   // "Lawḥ-i-Maqṣúd" is a title, not a slug
const WRITER_PREFIX = /^(?:shoghi[-_ ]effendi|bahaullah|baha[-_ ]u[-_ ]llah|abdul[-_ ]?baha|abdu[-_ ]l[-_ ]baha|the[-_ ]bab|bab|uhj|compilations?)(?:[-_ ]trans)?[-_ ]/i;
/** The work's real title for a file-name title; any other title as it is. null when nothing readable is left. */
export const readableTitle = (title) => {
  const t = String(title ?? '').trim();
  if (!isFileTitle(t)) return t || null;
  const words = t.replace(/\.[a-z]{2,4}$/i, '').replace(/[-_]+/g, ' ').trim();
  const canon = canonWork(words);
  if (canon) return canon.title;
  const rest = t.replace(/\.[a-z]{2,4}$/i, '').replace(WRITER_PREFIX, '').replace(/[-_](?:en|fa|ar)(?=$|[-_])/gi, '')
    .replace(/[-_]notes$/i, ' (notes)').replace(/^\d+[-_]/, '').replace(/[-_]+/g, ' ').trim();
  return rest && /\p{L}{3}/u.test(rest) ? rest.charAt(0).toUpperCase() + rest.slice(1) : null;
};

/** A site's bare root ("https://oceanoflights.org/") is no place in a work: never a citation's link (Íqán r6 t2/t4 Ẓuhúru'l-Ḥaqq). Pure. */
export const isSiteRoot = (u) => { try { const x = new URL(String(u)); return x.pathname.replace(/\/+$/, '') === '' && !x.search && !x.hash; } catch { return false; } };
