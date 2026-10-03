#!/usr/bin/env node
// Paragraph authorship (runs ON tower). PASS A per book: evidence (OceanLibrary section headings + frontmatter author list,
// compilation trailers, source links, headings) → the state machine (api/lib/authorship/reader.js) → System-1 for what the
// evidence leaves open (open spans, continuation chains), every call logged under task 'paragraph-attribution' (Laya's
// training data). Each book's result is saved to <out>/a/<id>.json, so a run RESUMES. PASS B across all books:
// identical-text propagation and mixed paragraphs → <out>/b/<id>.json, and with --write content.authors / docs.authors
// through the single writer (never synced/updated_at: no Meili resync).
//   node scripts/authorship/read-book.mjs <out-dir> (<docId> … | --all) [--write] [--no-jev] [--index=<trailers.json>]
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readBook, mixedLead, firstPerson } from '../../api/lib/authorship/reader.js';
import { isTrailer, isHeading, parseTrailer, isMeta, isNumberedHeading, bylineSpeaker } from '../../api/lib/authorship/trailers.js';
import { sectionMap, frontmatterAuthors } from '../../api/lib/authorship/sections.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets'), quiet: true });
const { ask } = await import('../../api/lib/systemone.js');
const LIB = '/home/chad/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [OUTDIR, ...IDARGS] = args;
const NO_JEV = process.argv.includes('--no-jev'), WRITE = process.argv.includes('--write'), ALL = process.argv.includes('--all');
const READER_VERSION = 'reader-v1-2026-10-03';
const DOCTRINAL = ['The Báb', 'Bahá’u’lláh', '‘Abdu’l-Bahá', 'Shoghi Effendi'];   // a compilation's display authors (Chad 10-03)
const TASK = 'paragraph-attribution';
// Below these, System-1 does not decide: the paragraph is listed for review (and later escalated), never guessed.
const CONT_MIN = 0.8, SPAN_MIN = 0.6;
mkdirSync(join(OUTDIR, 'a'), { recursive: true }); mkdirSync(join(OUTDIR, 'b'), { recursive: true });
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });
const strip = (t) => String(t || '').replace(/⁅\/?s\d+⁆/g, '').trim();
const FIGURES = ['Bahá’u’lláh', 'The Báb', '‘Abdu’l-Bahá', 'Shoghi Effendi', 'Universal House of Justice'];

function criteriaFor(book) {
  const c = {};
  for (const f of FIGURES) c[f] = `words of ${f}${/Shoghi|House/.test(f) ? ' (including letters written on behalf)' : ''}`;
  for (const a of book.authors) if (!c[a]) c[a] = `${a}`;
  c['the Qur’án'] = 'a verse of the Qur’án'; c['the Bible'] = 'a passage of the Bible';
  if (!c[book.author]) c[book.author] = `${book.author}, the author of this book, in their own voice`;
  c['another person'] = 'someone else not listed';
  return c;
}

const sourceAuthor = db.prepare(`SELECT l.quote_id, l.source_id, l.source_doc, l.coverage, sd.author FROM content_source_links l JOIN docs sd ON sd.id = l.source_doc WHERE l.quote_doc = ?`);
// Paragraph-author INDEX (two-pass order): a source link resolves through the SOURCE PARAGRAPH's own attribution, never its
// book's catalogue author — compilations are filed under Bahá’u’lláh. Seeded from the compilation dry run (--index), grown
// by every book read earlier in this run (pass compilations and originals first). COMPILATION_DOCS: books whose catalogue
// author must not be used for a link when the source paragraph itself is unknown. Multi-author prayer books count too.
const paraIndex = new Map(); const COMPILATION_DOCS = new Set();
for (const f of process.argv.filter((a) => a.startsWith('--index=')).map((a) => a.split('=')[1])) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  for (const a of j.assignments || []) { if (a.name) paraIndex.set(a.content_id, { name: a.name, on_behalf: !!a.on_behalf, basis: 'trailer' }); COMPILATION_DOCS.add(a.doc_id); }
  for (const d of j.docs || []) if ((d.frontmatter_authors || []).length > 1) COMPILATION_DOCS.add(d.id);
}
// Research Department and other compilations are catalogued under one figure (often Bahá’u’lláh): a link into one says
// nothing about its writer unless that paragraph was itself attributed.
for (const r of db.prepare(`SELECT id FROM docs WHERE deleted_at IS NULL AND (file_path LIKE '%Compilation%' OR (title LIKE '%compil%' AND title NOT LIKE '%uncompil%') OR (title LIKE '%Prayers%' AND title NOT LIKE '%Prayers and Meditations%'))`).all()) COMPILATION_DOCS.add(r.id);
const STRENGTH = { trailer: 3, section: 3, reference: 3, 'trailer-prev': 3, 'lead-in': 3, source_link: 2, 'identical-text': 2, system1: 1, continuation: 1, book: 0 };
// A primary text read under its own author (Selections from ‘Abdu’l-Bahá, Gleanings) is as strong as a trailer: a compilation
// quoting the same words never relabels it. PRIMARY_DOCS = non-compilations catalogued under one of FIGURES.
const PRIMARY_DOCS = new Set();
const strength = (a, docId) => (!a || !a[0] || a[0].role !== 'author') ? -1
  : a[0].basis === 'book' && PRIMARY_DOCS.has(docId) ? 3
  : (STRENGTH[a[0].basis] ?? 0) + ((a[0].basis === 'system1' || a[0].basis === 'continuation') && (a[0].confidence ?? 0) >= 0.9 ? 1 : 0);
// --all: every live primary Bahá’í doc, compilations first, then the figures' own works, then the rest — so a source link is
// resolved through a paragraph already read wherever possible.
// System-1 calls of one book run CONC at a time (open spans are independent; each continuation chain is sequential).
const CONC = 8;
const pool = async (items, fn) => { let next = 0; await Promise.all(Array.from({ length: CONC }, async () => { while (next < items.length) { const it = items[next++]; try { await fn(it); } catch (e) { console.error(JSON.stringify({ jev_error: e.message?.slice(0, 200) })); } } })); };
const IDS = ALL ? db.prepare(`SELECT id FROM docs WHERE deleted_at IS NULL AND scope = 'primary' AND religion LIKE 'Bah%'
    ORDER BY CASE WHEN file_path LIKE '%Compilation%' OR (title LIKE '%compil%' AND title NOT LIKE '%uncompil%') THEN 0
      WHEN author IN ('Bahá’u’lláh', 'The Báb', '‘Abdu’l-Bahá', 'Shoghi Effendi', 'Universal House of Justice') THEN 1 ELSE 2 END, id`).all().map((r) => r.id)
  : IDARGS.map(Number);
const keyOf = (t) => String(t).replace(/\[pg\.?\s*\d+\]|\[\^?\d+\]/gi, '').toLowerCase().replace(/[^\p{L}]/gu, '');
const fileA = (id) => join(OUTDIR, 'a', `${id}.json`);
const remember = (a) => {           // a pass-A result feeds the paragraph index and the compilation/primary sets
  if (a.compilation) COMPILATION_DOCS.add(a.docId);
  if (a.primary) PRIMARY_DOCS.add(a.docId);
  for (const p of a.paras) if (p.authors?.[0]?.role === 'author' && p.authors[0].basis !== 'book') paraIndex.set(p.id, { name: p.authors[0].name, on_behalf: !!p.authors[0].on_behalf, basis: p.authors[0].basis });
};
let resumed = 0;
for (const id of IDS) if (existsSync(fileA(id))) { remember(JSON.parse(readFileSync(fileA(id), 'utf8'))); resumed++; }
if (resumed) console.log(JSON.stringify({ resumed, of: IDS.length }));
let done = 0, totalCalls = 0, totalTokens = 0;
for (const docId of IDS) {
  if (existsSync(fileA(docId))) continue;
  const d = db.prepare(`SELECT id, title, author, file_path FROM docs WHERE id = ?`).get(docId);
  if (!d) continue;
  const rows = db.prepare(`SELECT id, paragraph_index pidx, text, blocktype, external_para_id ext FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index`).all(docId)
    .map((r) => ({ ...r, text: strip(r.text) }));
  // evidence: OceanLibrary file → section authors + frontmatter author list
  let secMap = null, fmAuthors = [];
  const path = d.file_path?.startsWith('-sites/oceanlibrary.com/') ? join(LIB, d.file_path) : null;
  if (path && existsSync(path)) { const txt = readFileSync(path, 'utf8'); secMap = sectionMap(txt); fmAuthors = frontmatterAuthors(txt); }
  const src = new Map();
  for (const l of sourceAuthor.all(docId)) {
    const known = paraIndex.get(l.source_id);
    if (!known && COMPILATION_DOCS.has(l.source_doc)) continue;          // source paragraph unknown inside a compilation → no link
    // a catalogue author is often a translator, recorder or a stray id ("Aminu'llah Farid", "7326"): only a NAMED writer counts
    const author = known ? known.name : FIGURES.find((f) => f === l.author) || firstPerson(l.author);
    if (!author) continue;
    if (!src.has(l.quote_id) || src.get(l.quote_id).coverage < l.coverage) src.set(l.quote_id, { author, coverage: l.coverage, via: known ? 'paragraph' : 'book' });
  }
  let lastTrailer = null;
  const paras = rows.map((r) => {
    const sm = r.ext && secMap ? secMap.get(r.ext) : null;
    let trailer = null;
    // a file `.reference` line is a trailer only if it is not a bare citation ("Corinne True: Faithful Handmaid of ‘Abdu’l-Bahá, p200")
    if (isTrailer(r.text) || (sm?.reference && !isMeta(r.text))) {
      const t = parseTrailer(r.text);
      if (t.ibid) trailer = lastTrailer ? { ...lastTrailer, date: t.date, ibid: true } : { name: null };   // "(Ibid., …)" = same source
      else trailer = t.name ? t : { name: null, kind: t.kind };
      if (trailer.name) lastTrailer = trailer;
    }
    return { id: r.id, pidx: r.pidx, text: r.text, isHeading: isHeading(r, r.text) || isNumberedHeading(r.text) || !!sm?.heading, byline: bylineSpeaker(r.text), isMeta: !trailer && isMeta(r.text), trailer,
      section: sm?.section || null, source: src.get(r.id) || null };
  });
  const named = paras.filter((p) => p.trailer?.name);
  const trailerNames = new Set(named.map((p) => p.trailer.name));
  // A compilation is MOSTLY extracts each followed by its attribution: frontmatter author list, "compilation" in the
  // catalogue, or trailers naming ≥2 writers at ≥1 per 10 paragraphs. (A book like Ives' that ends some block quotations
  // with a reference is not one — its own prose must never inherit a trailer.)
  const compilation = fmAuthors.length > 1 || /(?<!un)compil/i.test(`${d.title} ${d.author}`) || (trailerNames.size >= 2 && named.length * 10 >= paras.length);
  const book = { author: d.author, authors: [...new Set([...fmAuthors, ...trailerNames])], compilation, title: d.title };
  const res = readBook(book, paras);
  const byId = new Map(paras.map((p, i) => [p.id, i]));
  const assigned = new Map(res.paragraphs.map((p) => [p.id, p.authors]));
  let calls = 0, tokens = 0; const review = [];

  if (!NO_JEV) {
    const crit = criteriaFor(book);
    // open spans: the span's own evidence — up to 3 paragraphs before (stopping at the previous span/heading) and after
    await pool(res.open, async (s) => {
      const i0 = byId.get(s.ids[0]), i1 = byId.get(s.ids[s.ids.length - 1]);
      const back = []; for (let i = i0 - 1; i >= Math.max(0, i0 - 3); i--) { if (paras[i].isHeading || paras[i].trailer || assigned.get(paras[i].id)?.[0]?.basis !== 'book' && assigned.get(paras[i].id)) break; back.unshift(paras[i].text.slice(0, 450)); }
      const fwd = []; for (let i = i1 + 1; i <= Math.min(paras.length - 1, i1 + 3); i++) { fwd.push(paras[i].text.slice(0, 450)); if (paras[i].isHeading || paras[i].trailer) break; }
      const first = paras[i0].text.slice(0, 900), last = paras[i1].text.slice(0, 900);
      const state = `BOOK: ${d.title} — catalogued author: ${d.author}${book.authors.length ? ` (authors: ${book.authors.join('; ')})` : ''}\nBEFORE:\n${back.join('\n')}\n\n>>> PASSAGE (${s.ids.length} paragraph${s.ids.length > 1 ? 's' : ''}):\n${first}${s.ids.length > 2 ? `\n[… ${s.ids.length - 2} more paragraphs of the same passage …]` : ''}${s.ids.length > 1 ? `\n${last}` : ''}\n<<<\n\nAFTER:\n${fwd.join('\n')}`;
      const r = await ask(TASK, state, { speaker: { type: 'choice', criteria: crit,
        instructions: 'Whose words are in the PASSAGE? Use an introduction just before it, or a reference / attribution line just after it, and the book’s own author list. In a compilation, the line after a passage names its writer.' } }, { ref: s.ids[0] });
      calls++; tokens += r.tokens;
      const a = r.answers.speaker; const choice = a?.choice ?? a?.value, conf = +(a?.confidence ?? 0).toFixed(2);
      // below SPAN_MIN System-1 does not decide: the span keeps the book's author, marked unresolved, and is listed for review
      if (conf < SPAN_MIN) {
        for (const id of s.ids) assigned.set(id, [{ name: d.author, role: 'author', basis: 'book', unresolved: true }]);
        review.push({ id: s.ids[0], why: `span ${conf.toFixed(2)} → ${choice}`, paragraphs: s.ids.length });
        return;
      }
      // "another person" is not a name: someone other than the listed writers — stored without a name, never as one
      const who = choice === 'another person' ? { name: null, other: true } : { name: choice };
      for (const id of s.ids) assigned.set(id, [{ ...who, role: 'author', basis: 'system1', confidence: conf }]);
    });
    // continuation checks after lead-ins: chained forward until the author's prose resumes
    await pool(res.checks, async (c) => {
      let i = byId.get(c.id); const leadInText = paras[byId.get(c.span_start) - 1]?.text.slice(0, 450) || '';
      for (let hop = 0; hop < 30 && i < paras.length; hop++, i++) {
        const p = paras[i]; if (p.isHeading || p.trailer || p.source) break;
        const state = `BOOK: ${d.title} — by ${d.author}\nINTRODUCTION:\n${leadInText}\n\nQUOTATION SO FAR (begins):\n${paras[byId.get(c.span_start)].text.slice(0, 600)}\n\nPREVIOUS PARAGRAPH:\n${paras[i - 1].text.slice(0, 600)}\n\n>>> THIS PARAGRAPH:\n${p.text.slice(0, 1200)}\n<<<`;
        const r = await ask(TASK, state, { role: { type: 'choice', criteria: {
          continues: 'continues the same quotation (more of the quoted person’s words)',
          prose: `the book’s author (${d.author}) writing again in their own voice — the quotation has ended`,
          new_quote: 'a different quotation begins', reference: 'a reference or citation line' },
          instructions: 'What is THIS PARAGRAPH, given the introduction and the quotation before it?' } }, { ref: p.id });
        calls++; tokens += r.tokens;
        const role = r.answers.role?.choice ?? r.answers.role?.value, conf = r.answers.role?.confidence ?? 0;
        if (role !== 'continues') break;
        // the speaker is the span's RESOLVED speaker (a pronoun lead-in is resolved by the open-span pass above)
        const speaker = assigned.get(c.span_start)?.[0]?.name || c.speaker || null;
        if (conf < CONT_MIN || !speaker) { review.push({ id: p.id, why: conf < CONT_MIN ? `continuation ${conf.toFixed(2)}` : 'speaker unresolved' }); break; }
        assigned.set(p.id, [{ name: speaker, role: 'author', basis: 'continuation', confidence: +conf.toFixed(2) }]);
      }
    });
  }
  const basis = {}; for (const [, a] of assigned) { const k = a ? a[0].basis : 'unassigned'; basis[k] = (basis[k] || 0) + 1; }
  const summary = { id: docId, title: d.title, catalogued: d.author, compilation, book_authors: book.authors, paragraphs: paras.length,
    basis, review: review.length, spans: res.spans.length, open_spans: res.open.length, checks: res.checks.length, calls, tokens };
  const a = { docId, title: d.title, author: d.author, compilation, primary: !compilation && FIGURES.includes(d.author), summary, review,
    paras: paras.map((p) => {
      const k = keyOf(p.text);
      return { id: p.id, pidx: p.pidx, authors: assigned.get(p.id) || null, owner: res.owner.get(p.id) || d.author,
        key: k.length >= 60 ? createHash('sha1').update(k).digest('base64').slice(0, 20) : null, mixed: mixedLead(p.text) || undefined,
        text: ALL ? undefined : p.text.slice(0, 300) };
    }) };
  writeFileSync(fileA(docId), JSON.stringify(a));
  remember(a);
  done++; totalCalls += calls; totalTokens += tokens;
  if (!ALL || done % 200 === 0 || calls > 50) console.log(JSON.stringify({ done, of: IDS.length - resumed, id: docId, title: d.title.slice(0, 40), compilation, paras: paras.length, calls, totalCalls, totalTokens, usd: +(totalTokens * 0.042 / 1e6).toFixed(3) }));
}

// PASS B — load every book's pass-A result.
const allAssigned = new Map(), docOfPara = new Map(), keyOfPara = new Map(), mixedOf = new Set(), ownerOf = new Map(), docInfo = new Map();
const books = [];
for (const id of IDS) {
  if (!existsSync(fileA(id))) continue;
  const a = JSON.parse(readFileSync(fileA(id), 'utf8'));
  docInfo.set(id, { author: a.author, compilation: a.compilation, title: a.title, summary: a.summary, review: a.review });
  for (const p of a.paras) {
    allAssigned.set(p.id, p.authors); docOfPara.set(p.id, id); ownerOf.set(p.id, p.owner);
    if (p.key) keyOfPara.set(p.id, p.key);
    if (p.mixed) mixedOf.add(p.id);
  }
  books.push({ id, paras: a.paras.map((p) => ({ id: p.id, pidx: p.pidx, text: p.text })) });
}
// SOURCE LINKS, re-resolved now that every book has been read: a paragraph credited through a link takes the FINAL
// attribution of the paragraph it quotes when that one was decided by evidence; a link into a compilation whose source
// paragraph has only the catalogue default says nothing, so the paragraph returns to its own book's prose owner.
let relinked = 0, unlinked = 0;
{
  const linked = [...allAssigned].filter(([, a]) => a?.some((e) => e.basis === 'source_link')).map(([id]) => id);
  const best = new Map();
  for (let i = 0; i < linked.length; i += 900) {
    const chunk = linked.slice(i, i + 900);
    for (const r of db.prepare(`SELECT quote_id, source_id, source_doc, coverage FROM content_source_links WHERE quote_id IN (${chunk.map(() => '?').join(',')})`).all(...chunk))
      if (!best.has(r.quote_id) || best.get(r.quote_id).coverage < r.coverage) best.set(r.quote_id, r);
  }
  for (const id of linked) {
    const l = best.get(id); if (!l) continue;
    const srcA = allAssigned.get(l.source_id)?.find((e) => e.role === 'author');
    const a = allAssigned.get(id);
    const k = a.findIndex((e) => e.basis === 'source_link');
    if (srcA && srcA.basis !== 'book' && srcA.name && srcA.name !== a[k].name) { a[k] = { ...a[k], name: srcA.name, on_behalf: srcA.on_behalf || undefined, via: 'paragraph' }; relinked++; }
    else if ((!srcA || srcA.basis === 'book') && COMPILATION_DOCS.has(l.source_doc)) {
      if (k === 0) a[0] = { name: ownerOf.get(id), role: 'author', basis: 'book' }; else a.splice(k, 1);
      unlinked++;
    }
  }
}
// identical text: the same words have the same author, so the strongest attribution in each group of identical paragraphs
// (letters-only key ≥ 60 letters: page markers, footnote marks and quotation marks differ between editions) replaces
// weaker ones — repairs damaged editions from clean ones. Only paragraphs read as someone's WORDS take it.
const groups = new Map(); for (const [id, h] of keyOfPara) (groups.get(h) || groups.set(h, []).get(h)).push(id);
let propagated = 0;
const st = (id) => strength(allAssigned.get(id), docOfPara.get(id));
for (const members of groups.values()) {
  if (members.length < 2) continue;
  const best = members.reduce((b, id) => (st(id) > st(b) ? id : b), members[0]);
  const win = allAssigned.get(best);
  if (st(best) < 2) continue;
  for (const id of members) if (id !== best && allAssigned.get(id)?.[0]?.role === 'author' && st(id) < st(best) && allAssigned.get(id)?.[0]?.name !== win[0].name) {
    allAssigned.set(id, [{ ...win[0], basis: 'identical-text', from: best }]); propagated++;
  }
}
// MIXED paragraphs: prose that introduces a quotation ("Calling this the King of Days, Bahá’u’lláh appeals: “…”") is the
// prose owner's paragraph quoting someone — both authors, never the quoted person alone. Only where the evidence is
// paragraph-level (a reference / source link / identical text): after a lead-in the whole paragraph IS the quotation, and an
// inner “…” inside a block quotation must not turn it into the book author's prose.
let mixed = 0;
for (const id of mixedOf) {
  const a = allAssigned.get(id), info = docInfo.get(docOfPara.get(id)), own = ownerOf.get(id) || info?.author;
  if (!info || (info.compilation && a?.[0]?.basis !== 'reference') || a?.[0]?.role !== 'author' || !['reference', 'source_link', 'identical-text'].includes(a[0].basis) || !a[0].name || a[0].name === own) continue;
  allAssigned.set(id, [{ name: own, role: 'author', basis: own === info.author ? 'book' : 'byline' }, { ...a[0], role: 'quoted' }, ...a.slice(1).filter((x) => x.name !== a[0].name && x.name !== own)]);
  mixed++;
}
console.log(JSON.stringify({ relinked, unlinked, books: books.length, identical_text_groups: [...groups.values()].filter((g) => g.length > 1).length, propagated, mixed }));

// docs.authors: a compilation shows the doctrinal authors it cites (canonical order); any other book its catalogue author.
const docAuthors = (id, paras) => {
  const info = docInfo.get(id);
  if (!info.compilation) return [info.author];
  const seen = new Set(); for (const p of paras) for (const e of allAssigned.get(p.id) || []) if (e.role === 'author' && DOCTRINAL.includes(e.name)) seen.add(e.name);
  return DOCTRINAL.filter((n) => seen.has(n));
};
let wrote = 0;
const { transaction } = WRITE ? await import('../../api/lib/db.js') : {};
for (const b of books) {
  const info = docInfo.get(b.id);
  const basis = {}; for (const p of b.paras) { const a = allAssigned.get(p.id); const k = a ? a[0].basis : 'unassigned'; basis[k] = (basis[k] || 0) + 1; }
  writeFileSync(join(OUTDIR, 'b', `${b.id}.json`), JSON.stringify({ summary: { ...info.summary, basis_after_propagation: basis, display_authors: docAuthors(b.id, b.paras) },
    review: info.review, paragraphs: b.paras.map((p) => ({ id: p.id, pidx: p.pidx, text: p.text, authors: allAssigned.get(p.id) || null })) }));
  if (!WRITE) continue;
  const stmts = b.paras.filter((p) => allAssigned.get(p.id)).map((p) => ({ sql: 'UPDATE content SET authors = ?, authors_model = ? WHERE id = ?', args: [JSON.stringify(allAssigned.get(p.id)), READER_VERSION, p.id] }));
  for (let i = 0; i < stmts.length; i += 500) await transaction(stmts.slice(i, i + 500), 'authorship:content');
  await transaction([{ sql: 'UPDATE docs SET authors = ? WHERE id = ?', args: [JSON.stringify(docAuthors(b.id, b.paras)), b.id] }], 'authorship:docs');
  wrote += stmts.length;
  if (wrote && books.indexOf(b) % 500 === 0) console.log(JSON.stringify({ writing: books.indexOf(b), of: books.length, paragraphs: wrote }));
}
console.log(JSON.stringify({ done: true, books: books.length, written: wrote }));
process.exit(0);
