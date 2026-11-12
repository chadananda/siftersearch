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
// a column whose whole text is a few words beside a long original is a byline or a heading ("by the Bab", 11-12), never a translation
const chars = (ps) => ps.reduce((n, p) => n + clean(p.text).length, 0);
// each column's source, named by its site, shown once under the column — never the cell text as a link (Chad 11-12). Our own reader is the last-chance
// fallback (not promoted); Phelps' inventory only when no column has a real source page
const SITES = [[/oceanoflights\.org/, 'Ocean of Lights'], [/oceanlibrary\.com/, 'Ocean Library'], [/bahai\.org/, 'Bahá’í Reference Library'], [/bahai-library\.com/, 'Bahá’í Library Online'],
  [/portlandiator\.github\.io/, 'Phelps Inventory'], [/siftersearch\.com/, 'Library']];
const FALLBACK = /siftersearch\.com|portlandiator\.github\.io/;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
const sourceOf = (url) => (url ? { name: SITES.find(([re]) => re.test(url))?.[1] ?? host(url) ?? 'Source', url } : null);
/** "Main (Sub) (provisional translation)" → { main, sub, provisional } */
export function titleParts(t) {
  const s = String(t || '').replace(/\s+/g, ' ').trim(), provisional = /\(\s*provisional(?: translation)?\s*\)/i.test(s);
  const rest = s.replace(/\s*\(\s*provisional(?: translation)?\s*\)\s*/i, ' ').trim(), m = rest.match(/^(.+?)\s*\((.+)\)$/);
  return { main: m ? m[1] : rest || null, sub: m ? m[2] : null, provisional };
}

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
  const trs = list.filter((p) => (p.role === 'translation' || (!p.role && anchorIds.has(p.id) && scriptLang(p) !== lang)));
  const docs = [...new Map(trs.map((p) => [p.document_id ?? p.title, p])).keys()].slice(0, 3);
  const cols = docs.map((d) => trs.filter((p) => (p.document_id ?? p.title) === d).sort((a, b) => (a.paragraph_index ?? 0) - (b.paragraph_index ?? 0)))
    .filter((col) => !(chars(col) < 40 && chars(origs) > 200));
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
  const srcs = [origs, ...cols].map((col) => sourceOf(col.map((p) => link(p)).find(Boolean) ?? null));
  const real = srcs.some((x) => x && !FALLBACK.test(x.url));
  const [oSrc, ...tSrc] = srcs.map((x) => (x && real && /portlandiator/.test(x.url) ? null : x));
  return { kind: 'side_by_side', id: `sbs-${hash(origs.map((o) => o.id).join(','))}`, layout,
    work: { title: first.title ?? null, url: workUrl ?? (oSrc && !FALLBACK.test(oSrc.url) ? oSrc.url.replace(/#.*$/, '') : null), language: lang, document_id: first.document_id ?? null },
    original: { lang, dir: RTL.has(lang) ? 'rtl' : 'ltr', label: NAMES[lang] ?? lang, title: titleParts(first.title), source: oSrc },
    translations: cols.map((col, i) => ({ translator: col[0].translator ?? null, title: col[0].title ?? null, language: code(col[0].language), label: col[0].translator || col[0].title || 'Translation',
      language_label: NAMES[code(col[0].language)] ?? code(col[0].language) ?? null, title_parts: titleParts(col[0].title), source: tSrc[i] ?? null })),
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
const mdCell = (c) => (!c?.text ? '' : md(c.text));
/** column heading pieces: kicker ("Arabic · original", "English · provisional translation") + the work title */
export function heads(data) {
  const o = data.original;
  return [{ kicker: `${o.label} · original`, title: o.title ?? titleParts(data.work?.title), source: o.source ?? null, dir: o.dir },
    ...data.translations.map((t) => { const tp = t.title_parts ?? titleParts(t.title);
      return { kicker: [t.language_label, t.translator ? `tr. ${t.translator}` : tp.provisional ? 'provisional translation' : 'translation'].filter(Boolean).join(' · '), title: tp, source: t.source ?? null, dir: 'ltr' }; })];
}
const mdHead = (h) => [h.title?.main ? `*${md(h.title.main)}*` : '', md(h.kicker)].filter(Boolean).join(' — ');
export function toMarkdown(data) {
  const hs = heads(data), head = hs.map(mdHead);
  const body = data.rows.map((r) => [mdCell(r.original), ...r.translations.map(mdCell)]);
  const src = hs.some((h) => h.source) ? [`| ${hs.map((h) => (h.source ? `[${md(h.source.name)}](${h.source.url})` : '')).join(' | ')} |`] : [];
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...body.map((r) => `| ${r.join(' | ')} |`), ...src, ...(data.approximate ? ['', APPROX_NOTE] : [])].join('\n');
}

// ── HTML: chat | embed (class names, stacked under 640 px) · email | print (inline styles, mail-safe) ────────────────────────
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = "'Amiri','Noto Naskh Arabic','Scheherazade New','Traditional Arabic','Geeza Pro',serif";
const css = `.sbs{width:100%;border-collapse:collapse;font-size:.95em}.sbs th{text-align:start;font-weight:400;padding:.2em .9em .7em;vertical-align:bottom;border-bottom:1px solid rgba(128,128,128,.4)}.sbs .k{display:block;font-size:.72em;letter-spacing:.08em;text-transform:uppercase;opacity:.65}.sbs .t{display:block;font-style:italic;font-size:1.08em;font-weight:600}.sbs .s{display:block;font-size:.85em;opacity:.75}.sbs td{vertical-align:top;padding:.7em .9em;line-height:1.6}.sbs td+td,.sbs th+th{border-left:1px solid rgba(128,128,128,.25)}.sbs.tight tbody td{border-bottom:1px solid rgba(128,128,128,.15)}.sbs td[dir=rtl]{font-family:${FONT};font-size:1.25em;line-height:1.9;text-align:right}.sbs th[dir=rtl]{text-align:right}.sbs tfoot td{font-size:.8em;padding-top:.5em;border:0}.sbs tfoot a{color:inherit;opacity:.7}@media (max-width:640px){.sbs,.sbs thead,.sbs tbody,.sbs tfoot,.sbs tr,.sbs td{display:block;width:auto}.sbs thead{display:none}.sbs td+td{border-left:0}}`;
export function toHtml(data, { mode = 'chat', layout = data.layout ?? 'tight' } = {}) {
  const inline = mode === 'email' || mode === 'print', study = layout === 'study';
  const rows = study ? studyRows(data) : data.rows, o = data.original, hs = heads(data);
  const st = (x) => (inline ? ` style="${x}"` : '');
  const td = (c, extra = '', dir = '') => (c === null ? '' : `<td${dir}${c?.span > 1 ? ` rowspan="${c.span}"` : ''}${st(`vertical-align:top;padding:8px 10px;line-height:1.6;${study ? '' : 'border-bottom:1px solid #e3e8ea;'}${extra}`)}>${esc(c?.text || '')}</td>`);
  const rtl = ` dir="${o.dir}" lang="${esc(o.lang)}"`, oStyle = o.dir === 'rtl' ? `font-family:${FONT};font-size:19px;line-height:1.9;text-align:right;` : '';
  const th = (h) => `<th${h.dir === 'rtl' ? ' dir="rtl"' : ''}${st(`text-align:${h.dir === 'rtl' ? 'right' : 'left'};font-weight:400;padding:4px 10px 10px;vertical-align:bottom;border-bottom:1px solid #b9c4c8;`)}><span class="k"${st('display:block;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#7a8890')}>${esc(h.kicker)}</span>${h.title?.main ? `<span class="t"${st('display:block;font-style:italic;font-weight:600;font-size:15px')}>${esc(h.title.main)}</span>` : ''}${h.title?.sub ? `<span class="s"${st('display:block;font-size:12px;color:#5b6a70')}>${esc(h.title.sub)}</span>` : ''}</th>`;
  const head = `<thead><tr>${hs.map(th).join('')}</tr></thead>`;
  const body = rows.map((r) => `<tr>${td(r.original, oStyle, rtl)}${r.translations.map((c) => td(c)).join('')}</tr>`).join('');
  const foot = hs.some((h) => h.source) ? `<tfoot><tr>${hs.map((h) => `<td${h.dir === 'rtl' ? ' dir="rtl"' : ''}${st(`font-size:12px;padding:6px 10px;text-align:${h.dir === 'rtl' ? 'right' : 'left'}`)}>${h.source ? `<a href="${esc(h.source.url)}"${st('color:#5b6a70')}>${esc(h.source.name)} ↗</a>` : ''}</td>`).join('')}</tr></tfoot>` : '';
  const note = data.approximate ? `<p class="sbs-note"${st('font-size:13px;font-style:italic;color:#7a8890')}>${esc(APPROX_NOTE.replace(/\*/g, ''))}</p>` : '';
  return `${inline ? '' : `<style>${css}</style>`}<table class="sbs ${study ? 'study' : 'tight'}"${inline ? ' cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:12px 0"' : ''}>${head}<tbody>${body}</tbody>${foot}</table>${note}`;
}
