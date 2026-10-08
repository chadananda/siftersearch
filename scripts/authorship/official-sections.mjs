#!/usr/bin/env node
// Extract-level authors for compilations whose section headings were lost on export (runs ON tower). OceanLibrary's
// export kept a compilation's headings as bare "##", so "From the Writings of Bahá’u’lláh / of ‘Abdu’l-Bahá / …" vanished
// and the 10-03 reader fell back to the book author (then "Bahá’u’lláh") or a System-1 guess (Obligatory Prayer and
// Fasting: every extract "The Báb"). The official bahai.org edition keeps the labels: fetch its XHTML, walk it (section
// label → author of the extracts under it; an attribution trailer → author of the extracts above it), match our
// paragraphs to the official ones BY TEXT, and replace only WEAK assignments (basis book / system1). An extract's own
// attribution line (trailer), identical-text evidence, headings and reference lines are never touched. Prefatory text
// before the first label is the compiler's. Dry run by default.
//   node scripts/authorship/official-sections.mjs [--docs 20866,20821] [--apply]   (apply needs SIFTER_WRITER_URL)
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { isTrailer, parseTrailer } from '../../api/lib/authorship/trailers.js';
import { getDoc } from '../../api/lib/docs-repo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
const APPLY = process.argv.includes('--apply');
const ONLY = process.argv.includes('--docs') ? new Set(process.argv[process.argv.indexOf('--docs') + 1].split(',').map(Number)) : null;
const MODEL = 'official-sections-2026-10-08';
const BASE = 'https://www.bahai.org/library/authoritative-texts/compilations';

// our OceanLibrary compilation → the official edition's slug (bahai.org compilations index, 2026-10-08)
export const OFFICIAL = {
  20815: 'codification-law-huququllah', 20818: 'bahai-meetings', 20865: 'covenant', 20821: 'fire-and-light',
  20877: 'huququllah-right-god', 20867: 'importance-art', 20866: 'importance-obligatory-prayer-fasting',
  20868: 'institution-mashriqul-adhkar', 20822: 'issues-related-study-bahai-faith', 20823: 'peace',
  20824: 'prayer-devotional-life', 20869: 'significance-formative-age-our-faith', 20827: 'social-action',
  20871: 'set-world-order', 20872: 'trustworthiness', 20870: 'universal-house-of-justice-compilation', 20874: 'women',
};

const WHO = [
  [/bah[aá][’'‘]u[’'‘]ll[aá]h/i, 'Bahá’u’lláh'], [/\b(the )?b[aá]b\b/i, 'The Báb'], [/[’'‘]?abdu[’'‘]l-bah[aá]/i, '‘Abdu’l-Bahá'],
  [/shoghi effendi|the guardian/i, 'Shoghi Effendi'], [/universal house of justice/i, 'Universal House of Justice'],
];
/** A section label ("1. From the Writings of Bahá’u’lláh", "Extracts from Letters Written on Behalf of Shoghi Effendi")
 *  → { name, on_behalf } or null. Short lines only: a sentence that merely mentions a writer is not a label. */
export function sectionLabel(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length > 140 || !/^(?:[0-9IVX]+[.)]\s*)?(?:extracts?\s+)?from\b|^(?:[0-9IVX]+[.)]\s*)?(?:the )?(?:writings|letters|messages|talks|tablets|prayers)\s+(?:of|by)\b/i.test(t)) return null;
  const onBehalf = /on behalf of/i.test(t);
  const subject = onBehalf ? t.split(/on behalf of/i)[1] : t;
  for (const [re, name] of WHO) if (re.test(subject)) return { name, on_behalf: onBehalf || undefined };
  return null;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…' };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e] ?? m)));
/** XHTML → ordered text blocks (paragraphs, headings, list items). */
export function blocks(xhtml) {
  return [...String(xhtml).replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, '').matchAll(/<(p|h[1-6]|li)\b[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((m) => decode(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
      .replace(/(?:\s*\[\d+\])+$/, '')).filter(Boolean);   // "(Bahá’u’lláh, from a Tablet) [1]": the note number hid the trailer
}
/** The key two copies of one paragraph share: its first letters, case- and punctuation-free. */
export const textKey = (t) => String(t || '').replace(/⁅\/?s\d+⁆|\[\^\d+\]|\(\d+(?:, ?\d+)*\)/g, '').normalize('NFC').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 70);

// A citation that names only a WORK ("(The Kitáb-i-Aqdas, par. 42)") still closes the extracts above it; the work names
// its writer. Unlisted works fall back to the section heading. Order matters: specific titles first.
export const WORKS = [
  [/selections from the writings of the b[aá]b|persian bay[aá]n|qayy[uú]mu[’']l-asm[aá]/i, 'The Báb'],
  [/selections from the writings of [’'‘]?abdu|some answered questions|paris talks|promulgation of universal peace|secret of divine civilization|tablets of the divine plan|will and testament|memorials of the faithful|tablet to (the )?hague|travell?er[’']s narrative/i, '‘Abdu’l-Bahá'],
  [/kit[aá]b-i-aqdas|kit[aá]b-i-[ií]q[aá]n|gleanings|epistle to the son of the wolf|prayers and meditations|hidden words|seven valleys|tablets of bah[aá]|summons of the lord|gems of divine|tabernacle of unity|days of remembrance|call of the divine beloved|kit[aá]b-i-[’']?ahd/i, 'Bahá’u’lláh'],
  [/world order of bah|advent of divine justice|god passes by|promised day is come|dispensation of bah|citadel of faith|messages to america|messages to the bah[aá][’']í world|bah[aá][’']í administration|unfolding destiny|dawn of a new day|arohanui|high endeavours|directives from the guardian|letters from the guardian/i, 'Shoghi Effendi'],
  [/universal house of justice|ri[dḍ]v[aá]n (\d{4} )?message|messages (from|of) the universal house/i, 'Universal House of Justice'],
];
// "(Bahá’u’lláh, quoted in The Advent of Divine Justice)" — the quoting work is not the writer
export const workAuthor = (t) => (/\b(quoted|cited) (in|by)\b/i.test(t) ? null : (WORKS.find(([re]) => re.test(t)) || [])[1] || null);
/** A short line in parentheses: a citation, whether or not it names a person. */
export const isCitation = (t) => /^\(.{3,300}\)\.?$/.test(String(t).trim());

/** Official blocks → Map(textKey → { name, on_behalf, basis }). Labels open sections; a citation claims the extracts above. */
export function officialAuthors(bl) {
  const out = new Map(); let section = null; let since = [];
  for (const b of bl) {
    const label = sectionLabel(b);
    if (label) { section = label; since = []; continue; }
    if (isTrailer(b) || isCitation(b)) {
      const p = isTrailer(b) ? parseTrailer(b) : {};
      const name = p.name || workAuthor(b);
      const who = name ? { name, on_behalf: p.on_behalf || undefined, basis: p.name ? 'official-trailer' : 'official-work' }
        : section ? { ...section, basis: 'official-section' } : null;
      if (who) for (const k of since) out.set(k, who);
      since = []; continue;
    }
    const k = textKey(b);
    if (k.length < 30) continue;
    out.set(k, section ? { ...section, basis: 'official-section' } : { name: null, basis: 'official-preface' });
    since.push(k);
  }
  return out;
}

const WEAK = new Set(['book', 'system1']);
// Books whose OWN attribution lines are known wrong (lost headings + book-only citations: the 10-03 reader carried a later
// ‘Abdu’l-Bahá line back over Bahá’u’lláh's extracts — 46% agreement with the official edition, 2026-10-08). Here the
// official section/work attribution also replaces a 'trailer' or 'section' basis. Quotation-heavy books are NOT listed:
// there the official parse credits the quoting letter, and our copy (crediting the quoted writer) is the better one.
export const OVERRIDE_STRONG = new Set([20877]);
const DOCTRINAL = ['The Báb', 'Bahá’u’lláh', '‘Abdu’l-Bahá', 'Shoghi Effendi', 'Universal House of Justice'];
async function fetchText(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (SifterSearch authorship check)' }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.text();
}

async function main() {
  const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });
  const docs = Object.entries(OFFICIAL).map(([id, slug]) => ({ id: Number(id), slug })).filter((d) => !ONLY || ONLY.has(d.id));
  const report = { at: new Date().toISOString(), apply: APPLY, docs: [] };
  const writes = [];
  for (const d of docs) {
    const doc = await getDoc(d.id, { follow: false });     // through the docs repository (never raw doc SQL)
    const landing = await fetchText(`${BASE}/${d.slug}/`);
    const x = landing.match(new RegExp(`/library/authoritative-texts/compilations/${d.slug}/[^"']+\\.xhtml[^"']*`));
    if (!x) { report.docs.push({ id: d.id, title: doc.title, error: 'no xhtml link' }); continue; }
    const official = officialAuthors(blocks(await fetchText(`https://www.bahai.org${x[0]}`)));
    const rows = db.prepare('SELECT id, paragraph_index pidx, text, authors FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index').all(d.id);
    const r = { id: d.id, title: doc.title, official_extracts: official.size, ours: rows.length, matched: 0, weak: 0, changed: 0, kept_strong: 0, unmatched_weak: 0, by: {}, conflicts_with_strong: [], samples: [] };
    for (const row of rows) {
      const cur = JSON.parse(row.authors || '[]');
      const own = cur.find((e) => e.role === 'author');
      const hit = official.get(textKey(row.text));
      if (hit) r.matched++;
      const overridable = OVERRIDE_STRONG.has(d.id) && own && ['trailer', 'section'].includes(own.basis) && hit && ['official-section', 'official-work'].includes(hit.basis);
      if ((!own || !WEAK.has(own.basis)) && !overridable) {
        if (hit?.name && own?.name && own.name !== hit.name && r.conflicts_with_strong.length < 8) r.conflicts_with_strong.push({ pidx: row.pidx, ours: `${own.name}/${own.basis}`, official: hit.name, text: row.text.slice(0, 90) });
        if (own) r.kept_strong++;
        continue;
      }
      r.weak++;
      if (!hit) { r.unmatched_weak++; continue; }
      const name = hit.name || doc.author;   // preface → the compiler
      const entry = { name, role: 'author', basis: hit.name ? hit.basis : 'book', source: 'bahai.org', ...(hit.on_behalf ? { on_behalf: true } : {}) };
      if (own.name === name && own.basis === entry.basis) continue;
      r.changed++; r.by[name] = (r.by[name] || 0) + 1;
      if (r.samples.length < 5) r.samples.push({ pidx: row.pidx, was: `${own.name}/${own.basis}`, now: `${name}/${entry.basis}`, text: row.text.slice(0, 90) });
      // synced = 0: the index re-reads this paragraph's author (a few hundred per book, not a mass resync)
      writes.push({ sql: 'UPDATE content SET authors = ?, authors_model = ?, synced = 0 WHERE id = ?',
        args: [JSON.stringify([entry, ...cur.filter((e) => e.role !== 'author')]), MODEL, row.id] });
    }
    // the book's list of everyone cited, as the reader keeps it: the doctrinal authors present, in order
    const after = new Map(writes.filter((w) => rows.some((x) => x.id === w.args[2])).map((w) => [w.args[2], w.args[0]]));
    const present = new Set(rows.flatMap((x) => JSON.parse(after.get(x.id) || x.authors || '[]')).filter((e) => e.role === 'author').map((e) => e.name));
    r.doc_authors = DOCTRINAL.filter((n) => present.has(n));
    if (r.changed) writes.push({ sql: 'UPDATE docs SET authors = ? WHERE id = ?', args: [JSON.stringify(r.doc_authors), d.id], doc: true });
    report.docs.push(r);
    console.log(JSON.stringify({ id: r.id, title: r.title.slice(0, 40), official: r.official_extracts, ours: r.ours, matched: r.matched, weak: r.weak, changed: r.changed, unmatched_weak: r.unmatched_weak, by: r.by }));
  }
  mkdirSync(join(ROOT, 'tmp'), { recursive: true });
  const out = join(ROOT, 'tmp', `official-sections-${APPLY ? 'apply' : 'dry'}.json`);
  writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ total_changes: writes.filter((w) => !w.doc).length, report: out }));
  if (!APPLY || !writes.length) return;
  if (!process.env.SIFTER_WRITER_URL) throw new Error('SIFTER_WRITER_URL is required to write (tower scripts go through the single writer)');
  const { transaction } = await import('../../api/lib/db.js');
  const stmts = writes.map(({ sql, args }) => ({ sql, args }));
  for (let i = 0; i < stmts.length; i += 500) await transaction(stmts.slice(i, i + 500), 'authorship:official-sections');
  console.log(JSON.stringify({ written: stmts.length }));
}

if (import.meta.url === `file://${process.argv[1]}`) main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
