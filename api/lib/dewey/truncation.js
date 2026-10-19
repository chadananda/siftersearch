// TRUNCATED BOOKS (Chad 10-19, relayed by the SearchLayerPDF session: "be on the lookout for truncated books (length does
// not comport to the TOC) so we do not accidentally think we have a book when we do not … Dewey should ensure library
// quality"). Ported from SearchLayerPDF apps/orchestrator/src/pipeline/completeness.js (same tests). Plus the readers that feed it:
// a text-layer PDF's first and last 20 pages (pdftotext), and SLP Markdown (its <!-- pdf:N, pg:LABEL --> markers).

const SLACK_PAGES = 30;      // front matter (roman pages), plates, blank leaves: printed p.N ≈ PDF page N + offset
const SLACK_RATIO = 1.1;

// TOC: lines that END in a page number (optionally after dot leaders), several of them, mostly ascending.
function tocMax(text) {
  const nums = [];
  for (const line of text.split('\n')) {
    const m = /^(.{3,}?)[\s.·…_-]*\s(\d{1,4})\s*$/.exec(line.trim());
    if (m && /\p{L}/u.test(m[1])) nums.push(+m[2]);
  }
  if (nums.length < 5) return null;
  let asc = 0;
  for (let i = 1; i < nums.length; i++) if (nums[i] >= nums[i - 1]) asc++;
  return asc / (nums.length - 1) >= 0.7 ? Math.max(...nums) : null;
}

// Index: lines like "Term, 12, 45, 233–6" — a word followed by a comma-separated run of page numbers/ranges.
function indexMax(text) {
  const nums = [];
  let entries = 0;
  for (const line of text.split('\n')) {
    const m = /^\s*\p{L}[^,\d]{1,80},((?:\s*\d{1,4}(?:\s*[–-]\s*\d{1,4})?\s*,?)+)\s*$/u.exec(line);
    if (!m) continue;
    entries++;
    for (const r of m[1].matchAll(/(\d{1,4})(?:\s*[–-]\s*(\d{1,4}))?/g)) {
      const a = +r[1];
      let b = r[2] ? +r[2] : a;
      if (r[2] && b < a) b = +String(a).slice(0, String(a).length - r[2].length) * 10 ** r[2].length + b;   // 233–6 → 236
      nums.push(Math.max(a, b));
    }
  }
  return entries >= 3 && nums.length ? Math.max(...nums) : null;
}

// pages: per-page text (any subset — the first/last ~15 pages are where contents and index live). pageLabels: printed
// page numbers detected on pages (arabic only count). → { suspect, expected_pages, pdf_pages, evidence[] }.
export function assessCompleteness({ pages = [], pdfPages = 0, pageLabels = [] } = {}) {
  const evidence = [];
  let expected = 0;
  const head = pages.slice(0, 20).join('\n'), tail = pages.slice(-20).join('\n');
  const t = tocMax(head);
  if (t) { expected = Math.max(expected, t); evidence.push(`contents point to page ${t}`); }
  const ix = indexMax(tail);
  if (ix) { expected = Math.max(expected, ix); evidence.push(`index cites page ${ix}`); }
  const labels = pageLabels.map((l) => (/^\d{1,4}$/.test(String(l)) ? +l : null)).filter((n) => n != null);
  if (labels.length >= 3) {
    const lm = Math.max(...labels);
    if (lm > pdfPages) { expected = Math.max(expected, lm); evidence.push(`printed page numbers reach ${lm}`); }
  }
  const suspect = expected > 0 && expected > pdfPages * SLACK_RATIO + SLACK_PAGES;
  return { suspect, expected_pages: expected || null, pdf_pages: pdfPages,
    evidence: suspect ? [...evidence, `the PDF has only ${pdfPages} pages`] : evidence };
}

/** A text-layer PDF → { pages: first + last 20 pages' text, pdfPages }. pdftotext reads only those pages. */
export async function pdfEnds(path, { run = null, pdfPages = null } = {}) {
  const { execFile } = await import('child_process');
  const ex = run || execFile;
  const sh = (args) => new Promise((res) => ex(args[0], args.slice(1), { maxBuffer: 64 << 20, timeout: 120000 }, (e, out) => res(e ? '' : String(out))));
  const n = pdfPages || Number((await sh(['pdfinfo', path])).match(/^Pages:\s+(\d+)/m)?.[1]) || 0;
  if (!n) return { pages: [], pdfPages: 0 };
  const read = async (f, l) => (await sh(['pdftotext', '-layout', '-f', String(f), '-l', String(l), '-enc', 'UTF-8', path, '-'])).split('\f');
  const head = await read(1, Math.min(20, n));
  const tail = n > 20 ? await read(Math.max(21, n - 19), n) : [];
  return { pages: [...head, ...tail].filter((p) => p.trim()), pdfPages: n };
}

/** SLP Markdown → { pages, pageLabels } — the printed page label of each page from its marker. Pure. */
export function slpPages(md) {
  const pages = [], pageLabels = [];
  const parts = String(md || '').split(/<!--\s*pdf:(\d+)(?:\s*,\s*pg:([\w-]+))?\s*-->/);
  for (let i = 1; i < parts.length; i += 3) { pages.push(parts[i + 2] || ''); if (parts[i + 1]) pageLabels.push(parts[i + 1]); }
  return { pages, pageLabels };
}
