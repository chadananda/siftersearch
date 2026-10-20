// Phelps' provisional English renderings → library files (Chad 10-19: "for the tablets, extract the translations from
// phelps' and insert into DB so we can index that as well"; renderings PUBLIC DOMAIN, Chad 09-29). One Markdown file per
// PIN under "Baha'i/Tablet Translations/Stephen Phelps (provisional)/<author>/", labelled provisional, credited to the
// tablet's author, translator Stephen Phelps, linked to the original by PIN (the originals are Core Tablets/Partial
// Inventory/<author>/<PIN>.md). Skipped: PINs whose English is an official bahai.org translation (the library holds it),
// and any text with a paragraph over 8,000 characters (unsegmented — never ingested, Chad 10-19). Writes FILES only; the
// ingest-files ops job ingests them. Usage: node scripts/library/phelps-renderings.mjs [--pi <dir>] [--out <libraryBase>] [--list <file>]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const PI = arg('--pi', 'planning/merge-review/pi');
const BASE = arg('--out', `${process.env.HOME}/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library`);
export const DIR = "Baha'i/Tablet Translations/Stephen Phelps (provisional)";
const AUTHOR = { BH: ["Bahá'u'lláh", "Baha'u'llah"], AB: ["'Abdu'l-Bahá", "Abdu'l-Baha"], BB: ['The Báb', 'The Bab'] };
const MAX_PARA = 8000;

/** Minimal RFC-4180 CSV parser (quoted fields, embedded commas/newlines). */
export function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...rest] = rows;
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const yq = (s) => `"${String(s).replace(/\\/g, '').replace(/"/g, "'").replace(/\s+/g, ' ').trim()}"`;
const clip = (s, n) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s);

/** One PI row + its English text → { rel, body } or { skip }. Pure. */
export function renderingFile(row, english) {
  const pin = row.PIN;
  const who = AUTHOR[pin.slice(0, 2)];
  if (!who) return { skip: 'not a Bahá’í author prefix' };
  if (/bahai\.org\/r\//.test(row.Translations || '')) return { skip: 'official translation held' };
  const paras = String(english).replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
    .map((p) => p.replace(/([a-z\u00C0-\u024F’'][!?.])([A-Z][a-z])/g, '$1 $2'));   // the source glues sentences: "God!Some"
  // the opening invocation ("He is God, exalted be His glory, the Mighty!") is its own line in the original, glued here
  const inv = paras[0]?.match(/^(.{4,140}?[!.])\s(?=[A-Z])/);
  if (inv && /\b(God|He is|In the Name|In His Name|Glorified|Exalted)\b/.test(inv[1]) && paras[0].length > inv[1].length + 40) paras.splice(0, 1, inv[1], paras[0].slice(inv[0].length));
  if (!paras.length) return { skip: 'empty' };
  if (paras.some((p) => p.length > MAX_PARA)) return { skip: 'unsegmented' };
  const title = (row.Title || '').trim() || clip((row['First line (translated)'] || paras[0]).replace(/\s*\[[^\]]*\]\s*$/, ''), 90);
  const fm = ['---', `title: ${yq(`${title} (provisional translation)`)}`, `author: ${yq(who[0])}`, 'translator: "Stephen Phelps"',
    'translation_authority: "provisional-phelps"', `pin: "${pin}"`, `catalog_ref: "${pin}"`, 'language: "en"', 'needs_segmentation: false',
    `original_file: ${yq(`Baha'i/Core Tablets/Partial Inventory/${who[0]}/${pin}.md`)}`,
    'source: "Partial Inventory (Stephen Phelps) — provisional rendering, not an authorized translation"',
    `source_url: "https://portlandiator.github.io/PI_browser/?id=${pin}"`,
    ...(row.Language ? [`original_language: ${yq(row.Language)}`] : []), ...(row.Recipient ? [`recipient: ${yq(clip(row.Recipient, 200))}`] : []),
    ...(row.Period ? [`period: ${yq(row.Period)}`] : []), '---', ''];
  const body = paras.map((p, k) => `${p}\n{id="para_${k + 1}" pn="${k + 1}"}`).join('\n\n');
  return { rel: join(DIR, who[1], `${pin}.md`), body: `${fm.join('\n')}\n${body}\n`, paras: paras.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = parseCsv(readFileSync(join(PI, 'metadata - copy', 'Partial Inventory v6.01.csv'), 'utf8'));
  const stats = { written: 0, paras: 0, skipped: {} }; const list = [];
  for (const row of rows) {
    const f = join(PI, 'translated_texts - copy', `${row.PIN}.txt`);
    if (!row.PIN || !existsSync(f)) continue;
    const r = renderingFile(row, readFileSync(f, 'utf8'));
    if (r.skip) { stats.skipped[r.skip] = (stats.skipped[r.skip] || 0) + 1; continue; }
    mkdirSync(join(BASE, r.rel, '..'), { recursive: true });
    writeFileSync(join(BASE, r.rel), r.body);
    stats.written++; stats.paras += r.paras; list.push(r.rel);
  }
  // Báb and Bahá'u'lláh first (the ingest order), then 'Abdu'l-Bahá
  const rank = (p) => (p.includes('/The Bab/') ? 0 : p.includes("/Baha'u'llah/") ? 1 : 2);
  list.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  writeFileSync(arg('--list', 'tmp/phelps-renderings-list.json'), JSON.stringify(list));
  console.log(JSON.stringify(stats));
}
