#!/usr/bin/env node
// PILOT (read-only on sifter.db; runs ON tower): read whole books with the attribution state machine
// (api/lib/authorship/reader.js) — evidence gathered here (OceanLibrary section headings + frontmatter author list,
// compilation trailers, source links, headings), then System-1 for what the evidence leaves open: open spans (one call per
// span, its own evidence only, bounded by its neighbours) and continuation checks after lead-ins (chained forward).
// Every System-1 call → api/lib/systemone.js, task 'paragraph-attribution' (logged: Laya's training data).
//   node scripts/authorship/read-book.mjs <out-dir> <docId> [<docId> …] [--no-jev]
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
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
const [OUTDIR, ...IDS] = args;
const NO_JEV = process.argv.includes('--no-jev');
const TASK = 'paragraph-attribution';
// Below these, System-1 does not decide: the paragraph is listed for review (and later escalated), never guessed.
const CONT_MIN = 0.8, SPAN_MIN = 0.6;
mkdirSync(OUTDIR, { recursive: true });
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
const docOfPara = new Map(), textOfPara = new Map(), docInfo = new Map(), ownerOf = new Map();
const allAssigned = new Map(), outputs = [];
const summary = [];
for (const docId of IDS.map(Number)) {
  const d = db.prepare(`SELECT id, title, author, file_path FROM docs WHERE id = ?`).get(docId);
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
    for (const s of res.open) {
      const i0 = byId.get(s.ids[0]), i1 = byId.get(s.ids[s.ids.length - 1]);
      const back = []; for (let i = i0 - 1; i >= Math.max(0, i0 - 3); i--) { if (paras[i].isHeading || paras[i].trailer || assigned.get(paras[i].id)?.[0]?.basis !== 'book' && assigned.get(paras[i].id)) break; back.unshift(paras[i].text.slice(0, 450)); }
      const fwd = []; for (let i = i1 + 1; i <= Math.min(paras.length - 1, i1 + 3); i++) { fwd.push(paras[i].text.slice(0, 450)); if (paras[i].isHeading || paras[i].trailer) break; }
      const first = paras[i0].text.slice(0, 900), last = paras[i1].text.slice(0, 900);
      const state = `BOOK: ${d.title} — catalogued author: ${d.author}${book.authors.length ? ` (authors: ${book.authors.join('; ')})` : ''}\nBEFORE:\n${back.join('\n')}\n\n>>> PASSAGE (${s.ids.length} paragraph${s.ids.length > 1 ? 's' : ''}):\n${first}${s.ids.length > 2 ? `\n[… ${s.ids.length - 2} more paragraphs of the same passage …]` : ''}${s.ids.length > 1 ? `\n${last}` : ''}\n<<<\n\nAFTER:\n${fwd.join('\n')}`;
      const r = await ask(TASK, state, { speaker: { type: 'choice', criteria: crit,
        instructions: 'Whose words are in the PASSAGE? Use an introduction just before it, or a reference / attribution line just after it, and the book’s own author list. In a compilation, the line after a passage names its writer.' } }, { ref: s.ids[0] });
      calls++; tokens += r.tokens;
      const a = r.answers.speaker; const name = a?.choice ?? a?.value;
      for (const id of s.ids) assigned.set(id, [{ name, role: 'author', basis: 'system1', confidence: +(a?.confidence ?? 0).toFixed(2) }]);
      if ((a?.confidence ?? 0) < SPAN_MIN) review.push({ id: s.ids[0], why: `span ${(a?.confidence ?? 0).toFixed(2)} → ${name}`, paragraphs: s.ids.length });
    }
    // continuation checks after lead-ins: chained forward until the author's prose resumes
    for (const c of res.checks) {
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
    }
  }
  const basis = {}; for (const [, a] of assigned) { const k = a ? a[0].basis : 'unassigned'; basis[k] = (basis[k] || 0) + 1; }
  const authorsCount = {}; for (const [, a] of assigned) for (const e of a || []) if (e.role === 'author') authorsCount[e.name] = (authorsCount[e.name] || 0) + 1;
  const quoted = [...assigned.values()].filter((a) => a?.some((e) => e.role === 'quoted')).length;
  const s = { id: docId, title: d.title, catalogued: d.author, compilation, book_authors: book.authors, paragraphs: paras.length,
    basis, by_author: authorsCount, with_inline_quotes: quoted, review: review.length, spans: res.spans.length, open_spans: res.open.length, checks: res.checks.length, calls, tokens };
  summary.push(s);
  if (!compilation && FIGURES.includes(d.author)) PRIMARY_DOCS.add(docId);
  docInfo.set(docId, { author: d.author, compilation });
  for (const p of paras) { docOfPara.set(p.id, docId); textOfPara.set(p.id, p.text); if (res.owner.has(p.id)) ownerOf.set(p.id, res.owner.get(p.id)); }
  for (const [id, a] of assigned) { allAssigned.set(id, a); if (a?.[0]?.role === 'author' && a[0].basis !== 'book') paraIndex.set(id, { name: a[0].name, on_behalf: !!a[0].on_behalf, basis: a[0].basis }); }
  if (compilation) COMPILATION_DOCS.add(docId);
  outputs.push({ docId, summary: s, review, paras });
  console.log(JSON.stringify({ id: docId, title: d.title.slice(0, 40), compilation, paras: paras.length, basis, open: res.open.length, checks: res.checks.length, calls, tokens, review: review.length }));
}
// PASS B — identical text: the same words have the same author, so the strongest attribution in each group of identical
// paragraphs (normalized_hash, ≥ 60 chars) replaces weaker ones — repairs damaged editions from clean ones.
const ids = [...allAssigned.keys()];
// key = the letters alone, lower-cased: page markers ("[pg 453]"), footnote marks, quotation marks and spacing differ
// between editions (the damaged Lights of Guidance) but the words do not
const keyOf = (t) => String(t).replace(/\[pg\.?\s*\d+\]|\[\^?\d+\]/gi, '').toLowerCase().replace(/[^\p{L}]/gu, '');
const hashOf = new Map();
for (const id of ids) { const k = keyOf(textOfPara.get(id) || ''); if (k.length >= 60) hashOf.set(id, k); }
const groups = new Map(); for (const [id, h] of hashOf) (groups.get(h) || groups.set(h, []).get(h)).push(id);
let propagated = 0;
for (const members of groups.values()) {
  if (members.length < 2) continue;
  const st = (id) => strength(allAssigned.get(id), docOfPara.get(id));
  const best = members.reduce((b, id) => (st(id) > st(b) ? id : b), members[0]);
  const win = allAssigned.get(best);
  if (st(best) < 2) continue;
  // only a paragraph read as someone's WORDS takes the stronger attribution — never a heading, meta line or reference
  for (const id of members) if (id !== best && allAssigned.get(id)?.[0]?.role === 'author' && st(id) < st(best) && allAssigned.get(id)?.[0]?.name !== win[0].name) {
    allAssigned.set(id, [{ ...win[0], basis: 'identical-text', from: best }]); propagated++;
  }
}
// MIXED paragraphs: in an ordinary book, prose that introduces a quotation ("Calling this the King of Days, Bahá’u’lláh
// appeals: “…”") is the book author's paragraph quoting someone — both authors, never the quoted person alone. Only where
// the evidence is paragraph-level (a reference / source link): after a lead-in the whole paragraph IS the quotation, and an
// inner “…” inside a block quotation must not turn it into the book author's prose.
let mixed = 0;
for (const [id, a] of allAssigned) {
  const info = docInfo.get(docOfPara.get(id));
  const own = ownerOf.get(id) || info?.author;
  if (!info || (info.compilation && a?.[0]?.basis !== 'reference') || a?.[0]?.role !== 'author' || !['reference', 'source_link', 'identical-text'].includes(a[0].basis) || !a[0].name || a[0].name === own || !mixedLead(textOfPara.get(id))) continue;
  allAssigned.set(id, [{ name: own, role: 'author', basis: own === info.author ? 'book' : 'byline' }, { ...a[0], role: 'quoted' }, ...a.slice(1).filter((x) => x.name !== a[0].name && x.name !== own)]);
  mixed++;
}
console.log(JSON.stringify({ mixed }));
for (const o of outputs) {
  const basis = {}; for (const p of o.paras) { const a = allAssigned.get(p.id); const k = a ? a[0].basis : 'unassigned'; basis[k] = (basis[k] || 0) + 1; }
  o.summary.basis_after_propagation = basis;
  writeFileSync(join(OUTDIR, `${o.docId}.json`), JSON.stringify({ summary: o.summary, review: o.review, paragraphs: o.paras.map((p) => ({ id: p.id, pidx: p.pidx, text: p.text.slice(0, 300), authors: allAssigned.get(p.id) || null })) }, null, 1));
}
console.log(JSON.stringify({ identical_text_groups: [...groups.values()].filter((g) => g.length > 1).length, propagated }));
writeFileSync(join(OUTDIR, 'summary.json'), JSON.stringify(summary, null, 1));
