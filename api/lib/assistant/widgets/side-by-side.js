// Display widget `side_by_side` (original ↔ translation): data built by CODE from aligned passages (editions.js rows via edition_lookup), every cell
// verbatim — the writer only frames it. Renderers: markdown (fallback everywhere), HTML (chat|embed|email|print), studyRows (sentence layout). Pure, no imports.
import { APPROX_NOTE } from './segments.js';

const RTL = new Set(['ar', 'fa', 'he', 'ur', 'ps', 'yi', 'ckb', 'ug']);
const NAMES = { ar: 'Arabic', fa: 'Persian', he: 'Hebrew', ur: 'Urdu', grc: 'Greek', el: 'Greek', sa: 'Sanskrit', pi: 'Pali', zh: 'Chinese', pa: 'Punjabi', en: 'English', fr: 'French', de: 'German', es: 'Spanish', tr: 'Turkish', ru: 'Russian' };
const code = (l) => { const s = String(l || '').trim().toLowerCase(); return NAMES[s] ? s : Object.entries(NAMES).find(([, n]) => n.toLowerCase() === s)?.[0] ?? (s || null); };
const clean = (t) => String(t || '').replace(/⁅\/?s\d+⁆/g, '').replace(/\s+/g, ' ').trim();
const hash = (s) => { let h = 5381; for (const c of s) h = ((h * 33) ^ c.codePointAt(0)) >>> 0; return h.toString(36); };
const keys = (p) => new Set([p.id, ...[p.aligned_to].flat().filter((x) => x != null)]);
const meets = (a, b) => [...a].some((x) => b.has(x));
// the script decides when the label is wrong (11-12: the Kawthar's Arabic is catalogued 'en', so no passage came back as role 'original')
const scriptLang = (p) => { const t = clean(p.text), l = code(p.language); if (/[\u0600-\u06ff]/.test(t)) return l === 'fa' || l === 'ur' ? l : 'ar'; if (/[\u0590-\u05ff]/.test(t)) return 'he'; return l; };
const isOriginal = (p) => p.role === 'original' || (!p.role && RTL.has(scriptLang(p)));

/** Aligned passages [{id, text, role, language, document_id, paragraph_index, aligned_to[], aligned_by, exact, title, translator, source_url}] → widget data, or null
 *  (no original). opts: link(p) → url, layout 'tight'|'study', workUrl. One row per original paragraph; a translation passage covering several originals is ONE
 *  cell with `span` (continuation rows hold null); a verse nothing covers gets an empty cell. */
export function buildSideBySide(passages, { link = (p) => p.source_url ?? p.citation_url ?? null, layout = 'tight', workUrl = null } = {}) {
  const list = (passages || []).filter((p) => p && p.id != null && clean(p.text));
  const first = list.find((p) => p.role === 'original') ?? list.find(isOriginal);
  if (!first) return null;
  const lang = scriptLang(first), anchorIds = new Set(list.flatMap((p) => [p.aligned_to].flat()).filter((x) => x != null));
  const seen = new Set();
  const origs = list.filter((p) => isOriginal(p) && p.document_id === first.document_id && !seen.has(p.id) && seen.add(p.id))
    .map((p, i) => ({ p, i })).sort((a, b) => (a.p.paragraph_index ?? 1e9) - (b.p.paragraph_index ?? 1e9) || a.i - b.i).map((x) => x.p);
  // translations: the editions found (role translation) and the anchor passage itself (no role) — one column per document
  const trs = list.filter((p) => p.role === 'translation' || (!p.role && anchorIds.has(p.id) && scriptLang(p) !== lang));
  const docs = [...new Map(trs.map((p) => [p.document_id ?? p.title, p])).keys()].slice(0, 3);
  const cols = docs.map((d) => trs.filter((p) => (p.document_id ?? p.title) === d).sort((a, b) => (a.paragraph_index ?? 0) - (b.paragraph_index ?? 0)));
  const oKeys = origs.map(keys);
  const cells = cols.map((col) => {
    const hit = oKeys.map((k) => col.find((p) => meets(keys(p), k)) ?? null);
    // nothing aligned by id (older rows): one passage spans everything; as many passages as originals pair in order
    if (!hit.some(Boolean)) return origs.map((_, i) => (col.length === origs.length ? col[i] : col.length === 1 ? col[0] : null));
    return hit;
  });
  const rows = origs.map((o, i) => ({ original: { text: clean(o.text), url: link(o) ?? null, paragraph_id: o.id },
    translations: cols.map((_, c) => {
      const p = cells[c][i];
      if (!p) return { text: '', url: null, span: 1 };
      if (i > 0 && cells[c][i - 1] === p) return null;
      let span = 1; while (cells[c][i + span] === p) span++;
      return { text: clean(p.text), url: link(p) ?? null, span, paragraph_id: p.id };
    }) }));
  const all = [...origs, ...cols.flat()];
  return { kind: 'side_by_side', id: `sbs-${hash(origs.map((o) => o.id).join(','))}`, layout,
    work: { title: first.title ?? null, url: workUrl ?? null, language: lang, document_id: first.document_id ?? null },
    original: { lang, dir: RTL.has(lang) ? 'rtl' : 'ltr', label: NAMES[lang] ?? lang },
    translations: cols.map((col) => ({ translator: col[0].translator ?? null, title: col[0].title ?? null, language: code(col[0].language), label: col[0].translator || col[0].title || 'Translation' })),
    rows, approximate: all.some((p) => p.exact === false) };
}

// ── study layout: sentence rows ─────────────────────────────────────────────────────────────────────────────────────────
// Split after . ? ! ۔ ؟ (+ closing quotes), ; (Latin text only), an Arabic verse mark ﴾ or ۝ + its number; never inside a sentence, nothing dropped.
export function sentences(text) {
  const t = clean(text); if (!t) return [];
  const arabic = /[؀-ۿ]/.test(t);
  const end = arabic ? '[.!?۔؟]+' : '[.!?;]+';
  return t.replace(new RegExp(`(${end}["”’')\\]]*|﴾|۝\\s*[\\d\\u0660-\\u0669\\u06F0-\\u06F9]*)\\s+`, 'gu'), '$1\u0001').split('\u0001').map((s) => s.trim()).filter(Boolean);
}
const fit = (list, n) => (list.length > n ? [...list.slice(0, n - 1), { text: list.slice(n - 1).map((s) => s.text).join(' '), url: list[n - 1].url }] : list);
const sents = (cells) => cells.flatMap((c) => sentences(c.text).map((text, i) => ({ text, url: i === 0 ? c.url : null })));
/** data → sentence rows [{ original: {text,url}, translations: [{text,url}] }]. Each unit (tight rows tied by spans) is split into sentences; the original and each
 *  translation pair in order; when counts differ the surplus sentences share the last row with the nearest one (rows = the smallest non-empty count). */
export function studyRows(data) {
  const out = [], rows = data.rows, nT = data.translations.length;
  for (let i = 0; i < rows.length;) {
    let j = i + 1;
    for (let k = i; k < j; k++) for (const c of rows[k].translations) if (c?.span > 1) j = Math.max(j, k + c.span);
    j = Math.min(j, rows.length);
    const unit = rows.slice(i, j), o = sents(unit.map((r) => r.original));
    const t = Array.from({ length: nT }, (_, c) => sents(unit.map((r) => r.translations[c]).filter(Boolean)));
    const R = Math.max(1, Math.min(o.length || Infinity, ...t.filter((x) => x.length).map((x) => x.length)));
    const O = fit(o, R), T = t.map((x) => fit(x, R));
    const cell = (l, r) => l[r] ?? { text: '', url: null };
    for (let r = 0; r < R; r++) out.push({ original: cell(O, r), translations: T.map((l) => cell(l, r)) });
    i = j;
  }
  return out;
}

// ── markdown (the fallback everywhere; study falls back to tight) ───────────────────────────────────────────────────────
const md = (s) => String(s).replace(/\|/g, '\\|').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
const mdCell = (c) => (!c?.text ? '' : c.url ? `[${md(c.text)}](${c.url})` : md(c.text));
export function toMarkdown(data) {
  const head = [`${data.original.label} (original)`, ...data.translations.map((t) => md(t.label))];
  const body = data.rows.map((r) => [mdCell(r.original), ...r.translations.map(mdCell)]);
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...body.map((r) => `| ${r.join(' | ')} |`), ...(data.approximate ? ['', APPROX_NOTE] : [])].join('\n');
}

// ── HTML: chat | embed (class names, stacked under 640 px) · email | print (inline styles, mail-safe) ────────────────────────
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = "'Amiri','Noto Naskh Arabic','Scheherazade New','Traditional Arabic','Geeza Pro',serif";
const css = `.sbs{width:100%;border-collapse:collapse;font-size:.95em}.sbs th{text-align:start;font-weight:600;padding:.4em .6em;border-bottom:2px solid currentColor}.sbs td{vertical-align:top;padding:.5em .6em}.sbs.tight td{border-bottom:1px solid rgba(128,128,128,.35)}.sbs td[dir=rtl]{font-family:${FONT};font-size:1.25em;line-height:1.9}.sbs a{color:inherit;text-decoration:underline dotted}@media (max-width:640px){.sbs,.sbs thead,.sbs tbody,.sbs tr,.sbs td{display:block;width:auto}.sbs thead{display:none}.sbs tr{padding:.4em 0}}`;
export function toHtml(data, { mode = 'chat', layout = data.layout ?? 'tight' } = {}) {
  const inline = mode === 'email' || mode === 'print', study = layout === 'study';
  const rows = study ? studyRows(data) : data.rows, o = data.original;
  const td = (c, extra = '', dir = '') => (c === null ? '' : `<td${dir}${c?.span > 1 ? ` rowspan="${c.span}"` : ''}${inline ? ` style="vertical-align:top;padding:6px 8px;${study ? '' : 'border-bottom:1px solid #d6dde0;'}${extra}"` : ''}>${!c?.text ? '' : c.url ? `<a href="${esc(c.url)}">${esc(c.text)}</a>` : esc(c.text)}</td>`);
  const rtl = ` dir="${o.dir}" lang="${esc(o.lang)}"`, oStyle = o.dir === 'rtl' ? `font-family:${FONT};font-size:19px;line-height:1.9;text-align:right;` : '';
  const th = (t, a = '') => `<th${inline ? ` style="text-align:left;padding:6px 8px;border-bottom:2px solid #1f6f8b;${a}"` : ''}>${t}</th>`;
  const head = `<thead><tr>${th(esc(`${o.label} (original)`), o.dir === 'rtl' ? 'text-align:right;' : '')}${data.translations.map((t) => th(esc(t.label))).join('')}</tr></thead>`;
  const body = rows.map((r) => `<tr>${td(r.original, oStyle, rtl)}${r.translations.map((c) => td(c)).join('')}</tr>`).join('');
  const note = data.approximate ? `<p class="sbs-note"${inline ? ' style="font-size:13px;font-style:italic;color:#7a8890"' : ''}>${esc(APPROX_NOTE.replace(/\*/g, ''))}</p>` : '';
  return `${inline ? '' : `<style>${css}</style>`}<table class="sbs ${study ? 'study' : 'tight'}"${inline ? ' cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:12px 0"' : ''}>${head}<tbody>${body}</tbody></table>${note}`;
}
