// dewey-completeness ops report — is every document Dewey imported the WHOLE work? (Chad 10-18: "I see lots of books with
// just the first pages and we do not want to add a book if it is only a sample of the beginning"). For each imported PDF:
// its text (SLP's / vision's, or its own layer) against the PDF's own page count (completeness()), preview wording, and
// the published page count when research found one. Read-only: lists the suspects, worst first.
// params { since? (ISO date) }.
import { readFile } from 'fs/promises';
import { listItems } from '../repos/dewey-repo.js';
import { getParagraphs } from '../docs-repo.js';
import { readPdf } from '../dewey/convert.js';
import { cleanText } from '../dewey/clean.js';
import { slpToText, completeness } from '../dewey/searchlayer.js';
import { extractText } from '../dewey/intake.js';
import { previewSigns } from './dewey-intake-job.js';

export async function deweyCompletenessJob({ since = null } = {}, deps = {}) {
  const { items = async () => listItems({ state: 'ingested', limit: 5000 }), pdfPages = async (p) => (await readPdf({ path: p })).pages,
    docWords = async (id) => (await getParagraphs(id, { proseOnly: false })).reduce((n, p) => n + String(p.text || '').split(/\s+/).filter(Boolean).length, 0),
    textOf = async (i) => (i.identified?.slp?.path ? slpToText(String(await readFile(i.identified.slp.path))).text : cleanText((await extractText(null, 'pdf', i.original_path)).text)) } = deps;
  const suspects = [];
  let checked = 0;
  for (const i of await items()) {
    if (!i.doc_id || !/\.pdf$/i.test(String(i.original_path || '')) || (since && i.updated_at < since)) continue;
    const pages = await pdfPages(i.original_path).catch(() => null);
    if (!pages) continue;
    const text = await textOf(i).catch(() => null);
    if (text == null) continue;
    checked++;
    const c = completeness(text, { pdfPages: pages });
    const preview = previewSigns(text);
    const published = Number(i.research?.matched && i.research?.pages) || 0;
    // what REACHED the library: the document's words against its source text's (an import that kept only the start)
    const srcWords = text.replace(/<pb[^>]*\/>/g, ' ').split(/\s+/).filter(Boolean).length;
    const inLib = await docWords(i.doc_id).catch(() => null);
    const kept = inLib != null && srcWords > 300 ? inLib / srcWords : null;
    const why = [...c.why, ...(kept != null && kept < 0.8 ? [`the library document has ${Math.round(kept * 100)}% of its source's words (${inLib.toLocaleString('en-US')} of ${srcWords.toLocaleString('en-US')})`] : []), ...(preview ? [`preview wording: “${preview}”`] : []), ...(published >= 60 && pages < published * 0.5 ? [`PDF ${pages} pages vs published ~${published}`] : [])];
    if (why.length) suspects.push({ item: i.id, doc_id: i.doc_id, title: i.title, pages, last_page: c.lastPage, pages_with_text: c.pagesWithText, text_from: i.identified?.slp ? (i.identified.slp.engine || 'slp') : 'layer', src_words: srcWords, doc_words: inLib, why });
  }
  suspects.sort((a, b) => (a.last_page ?? a.pages) / a.pages - (b.last_page ?? b.pages) / b.pages);
  return { checked, suspects: suspects.length, list: suspects };
}
