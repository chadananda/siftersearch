// Pre-OCR dedup for a donor PDF (Chad 11-01): BEFORE a scan or image-PDF is paid to SLP, the library is searched with what a worker's probe (intake_sample.py)
// read cheaply — ISBN, catalogue/metadata title+author, and the sampled pages' text through the holdings check. held → skip; probably_held → a person; clear → SLP.
// Pure helpers + preOcrCheck (deps injectable). Deps: dewey/holdings.js, dewey/identify.js. Also: SLP estimate and chapter-file detection.
import { checkHoldings, plausibleHolding } from '../dewey/holdings.js';
import { sampleLines, withText } from '../dewey/identify.js';

const isbn10ok = (d) => /^\d{9}[\dX]$/.test(d) && [...d].reduce((s, c, i) => s + (c === 'X' ? 10 : +c) * (10 - i), 0) % 11 === 0;
const isbn13ok = (d) => /^\d{13}$/.test(d) && [...d].reduce((s, c, i) => s + +c * (i % 2 ? 3 : 1), 0) % 10 === 0;
const to13 = (d10) => { const b = `978${d10.slice(0, 9)}`; return b + ((10 - [...b].reduce((s, c, i) => s + +c * (i % 2 ? 3 : 1), 0) % 10) % 10); };

/** Checksum-valid ISBNs printed with an ISBN label (or urn:isbn:) → every form to look up (ISBN-13, plus the 13 of each ISBN-10). Pure. */
export function isbnsIn(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/(?:ISBN(?:-?1[03])?|urn:isbn)\s*[:#]?\s*((?:97[89][- ]?)?\d[\d\- ]{7,15}[\dXx])/gi)) {
    const d = m[1].replace(/[^\dXx]/g, '').toUpperCase();
    if (isbn13ok(d)) out.add(d); else if (isbn10ok(d)) { out.add(d); out.add(to13(d)); }
  }
  return [...out];
}

/** The text of the title/copyright pages only (pages 1-4 of a probe's `[page N]` text) — an ISBN there is the book's own, not a cited one. Pure. */
export const frontText = (text) => String(text || '').split(/(?=\[page \d+\])/).filter((s) => { const n = +s.match(/^\[page (\d+)\]/)?.[1]; return !n || n <= 4; }).join('\n');

/** Title and author a probe's PDF metadata states (pdfinfo "Title:" / "Author:"), ignoring file-name-like and tool-made values. Pure. */
export function metaTitle(metaText) {
  const get = (k) => String(metaText || '').match(new RegExp(`^${k}:[ \\t]*(.+)$`, 'm'))?.[1]?.trim() || null;
  const good = (v) => (v && v.length >= 4 && !/\.(pdf|docx?|tiff?|jpe?g)$|^(untitled|microsoft word|scan|document|image)\b|^\d+$/i.test(v) ? v : null);
  return { title: good(get('Title')), author: good(get('Author')) };
}

/**
 * "Held by default" (Chad 11-01): the library holding a SUBSTANTIAL share of a file's text means the file is not new. By compare.js's relation:
 *   same / inside (the library has all of it, or it sits inside a larger work) and partial (the library copy is >= 45% of this one, in order) → always held;
 *   overlap (some passage in order, 12-45% shared) → held once max(ours_in_theirs, theirs_in_ours) >= SUBSTANTIAL, else probably held (a person looks);
 *   quotes (out-of-order fragments) and unrelated → new. SUBSTANTIAL = 0.25: a quarter of either text is a shared chapter, not a quotation —
 *   half way between compare's "some" (0.12) and "strong" (0.45) lines, so ordinary quoting (a few paragraphs of a book) stays under it.
 */
export const SUBSTANTIAL = 0.25;
const relOf = (c) => c?.relation?.relation || null;
const shareOf = (c) => (c?.relation ? Math.max(c.relation.ours_in_theirs || 0, c.relation.theirs_in_ours || 0) : 0);
const heldCandidate = (c) => ['same', 'inside', 'partial'].includes(relOf(c)) || (relOf(c) === 'overlap' && shareOf(c) >= SUBSTANTIAL);

/** The comparison numbers holdings.js computed for the top 3 candidates (relation null when only the title matched) — kept on the row as the evidence. Pure. */
export const evidenceOf = (r) => (r?.candidates || []).slice(0, 3).map((c) => ({ id: c.id, title: c.title, relation: relOf(c), ours_in_theirs: c.relation?.ours_in_theirs ?? null,
  theirs_in_ours: c.relation?.theirs_in_ours ?? null, length_ratio: c.relation?.length_ratio ?? null, ...(c.relation?.in_order != null ? { in_order: c.relation.in_order } : {}) }));

/** A holdings result → { verdict: 'held' | 'probably_held' | 'clear', candidate, evidence } by the rule above. Pure. */
export function verdictOf(r) {
  const cands = r?.candidates || [], evidence = evidenceOf(r), text = cands.some((c) => c.relation);
  const strong = cands.find(heldCandidate);
  if (r?.verdict === 'held' || strong) return { verdict: 'held', candidate: strong || cands[0] || null, evidence };
  if (text) {   // numbers in hand: only a weak overlap (below SUBSTANTIAL) or an empty library copy under a matching title still needs a person
    const weak = cands.find((c) => ['overlap', 'too-short'].includes(relOf(c)));
    return weak ? { verdict: 'probably_held', candidate: weak, evidence } : { verdict: 'clear', candidate: null, evidence };
  }
  if (r?.verdict === 'partly-held' || r?.verdict === 'possible') return { verdict: 'probably_held', candidate: cands[0] || null, evidence };
  return { verdict: 'clear', candidate: null, evidence };
}
const label = (c) => (c ? `#${c.id} ${c.title}` : null);

/**
 * The pre-OCR check of one probed PDF → { verdict, by: 'isbn'|'text'|'title'|null, candidate, evidence, isbn? }.
 * probe = item.metadata.probe; cat = { title, author } (operator's catalogue, else the sampler's recommendation); name = the file name.
 * Order = cheapest and surest first: ISBN (held), the sampled pages' text (the same holdings check a text-layer file gets), then title+author (probably held).
 */
export async function preOcrCheck({ probe, cat = {}, name = '' }, { check = checkHoldings, byIsbn = null } = {}) {
  const isbns = isbnsIn(`${probe.meta_text || ''}\n${frontText(probe.text)}`);
  if (isbns.length && byIsbn) {
    const hit = (await byIsbn(isbns).catch(() => []))?.find((d) => (d.paragraph_count ?? 20) >= 20);
    if (hit) return { verdict: 'held', by: 'isbn', candidate: label(hit), isbn: isbns[0], evidence: [{ id: hit.id, title: hit.title, relation: 'isbn', ours_in_theirs: null, theirs_in_ours: null, length_ratio: null }] };
  }
  const meta = metaTitle(probe.meta_text), title = cat.title || meta.title || null, author = cat.author || meta.author || null;
  const text = String(probe.text || ''), words = text.replace(/\[page \d+\]/g, '').split(/\s+/).filter(Boolean).length;
  let best = { verdict: 'clear', by: null, candidate: null, evidence: [], ...(isbns.length ? { isbn: isbns[0] } : {}) };
  if (words >= 60) {
    const id = withText({ title, author, file_name: name, printed_lines: sampleLines(text), sample: { sampled: probe.sampled || [], of: probe.pages || null, engine: probe.ocr ? 'tesseract' : 'text-layer' } }, text);
    const v = verdictOf(await check(id).catch(() => null));
    best = { ...best, evidence: v.evidence };
    if (v.verdict !== 'clear') best = { ...best, verdict: v.verdict, by: 'text', candidate: label(v.candidate) };
    if (v.verdict === 'held') return best;
  }
  if (title || name) {
    const asked = { title, author, file_name: name };
    const res = await check(title ? asked : { file_name: name }).catch(() => null), near = plausibleHolding(asked, res);
    if (near && best.verdict === 'clear') best = { ...best, verdict: 'probably_held', by: 'title', candidate: label(near), evidence: best.evidence.length ? best.evidence : evidenceOf(res) };
  }
  return best;
}

/** A PDF's class for routing: scans and image PDFs (a hidden OCR layer over page images) go to SLP; born-digital PDFs and every non-PDF read directly. */
export const slpBound = (cls) => cls === 'image_pdf' || cls === 'scan';

/** SLP's cents a page: measured from earlier OCR'd items (identified.slp.cost_cents / pages), else DEWEY_SLP_CENTS_PER_PAGE, else the planning doc's top figure. */
export function slpRate(items = [], env = process.env) {
  let cents = 0, pages = 0, n = 0;
  for (const i of items) { const s = i?.identified?.slp; if (Number(s?.cost_cents) > 0 && Number(s?.pages) > 0) { cents += Number(s.cost_cents); pages += Number(s.pages); n++; } }
  if (n >= 3) return { cents_per_page: +(cents / pages).toFixed(4), source: `measured: ${n} earlier SLP jobs, ${pages} pages, $${(cents / 100).toFixed(2)}` };
  if (Number(env.DEWEY_SLP_CENTS_PER_PAGE) > 0) return { cents_per_page: Number(env.DEWEY_SLP_CENTS_PER_PAGE), source: 'DEWEY_SLP_CENTS_PER_PAGE' };
  return { cents_per_page: 0.5, source: 'planning doc estimate ($0.50-1.50 per 300 pages, top figure) — no measured jobs on file' };
}

/** A file that is one chapter of a book ("27 William Henry Randall chap 26.pdf", "Part 3.pdf") → { set } (its folder + the name with numbers removed), else null. Pure. */
export function chapterFile(rel) {
  const parts = String(rel || '').split('/'), file = parts.pop().replace(/\.[^.]+$/, '');
  if (!/(?:^|[\s._()-])(?:chap(?:ter)?|ch|part|pt|section|sec)\.?[\s._-]*\d+/i.test(file)) return null;
  return { set: `${parts.join('/')}/${file.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase()}` };
}
