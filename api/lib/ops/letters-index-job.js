// LETTERS INDEX — find every letter of an author in their shelf's books (api/lib/letters/letters.js) and store them for the
// letter lookup (Chad 10-21). Runs in the reports service; reads each book's sections and paragraphs through the repos.
// params { author = 'Shoghi Effendi', collection = 'Shoghi Effendi', religion = "Baha'i", write = true }.
import { listDocs, getParagraphs } from '../docs-repo.js';
import { sectionsOfDoc } from '../repos/sections-repo.js';
import { replaceLetters } from '../repos/letters-repo.js';
import { buildLetters } from '../letters/letters.js';

export async function lettersIndexJob({ author = 'Shoghi Effendi', collection = 'Shoghi Effendi', religion = "Baha'i", write = true } = {}, deps = {}) {
  const { docs = listDocs, sections = sectionsOfDoc, paragraphs = getParagraphs, save = replaceLetters } = deps;
  const books = (await docs({ scope: 'canonical', religion, collection, fields: ['id', 'title'], limit: 1000, count: false })).docs || [];
  const rows = [], per = {};
  for (const b of books) {
    const paras = (await paragraphs(b.id, { proseOnly: false })).map((p) => ({ paragraph_index: p.paragraph_index, text: p.text, heading: p.heading }));
    const letters = buildLetters(b, await sections(b.id), paras);
    rows.push(...letters);
    per[b.title] = letters.length;
    await new Promise((r) => setImmediate(r));
  }
  if (write) await save(author, rows);
  return { author, books: books.length, letters: rows.length, per_book: per, written: write ? rows.length : 0 };
}
