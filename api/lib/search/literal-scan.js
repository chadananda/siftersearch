// The literal scan of named works (quote_search's "find X in <work>"): every paragraph of the works, the ones holding the words.
// Seconds of CPU on Star of the West (~400 issues), so it runs in the read pool; search-side (no Anís module) so the read pool that runs it keeps the indexer's import graph free of assistant code. Deps: paragraphs-repo (lazy).
/** Fold for matching: accents off, curly/odd apostrophes → ', lower case, every other non-letter → one space. Pure. */
export const foldText = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`ʻʼ]/g, "'").toLowerCase()
  .replace(/[^\p{L}\p{N}']+/gu, ' ').replace(/(^|\s)'+|'+(?=\s|$)/g, '$1').replace(/\s+/g, ' ').trim();
/** Does the text hold the words, as words, in that order? Pure. */
export const holdsWords = (text, words) => { const w = foldText(words); return !!w && ` ${foldText(text)} `.includes(` ${w} `); };
const isHeading = (r) => /^heading/.test(r?.blocktype || '');
/** ids, {from, to}, phrase → the paragraphs holding the phrase, each with __doc (its work). Runs on a read-pool thread. */
export async function literalScanRows(ids, range, phrase) { const { paragraphTexts } = await import('../paragraphs-repo.js'); const hits = []; for (const id of ids) for (const r of (await paragraphTexts(id, range)) || []) if (!isHeading(r) && holdsWords(r.text, phrase)) hits.push({ ...r, __doc: id }); return hits; }
