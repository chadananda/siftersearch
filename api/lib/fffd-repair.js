// Put back letters the single writer broke into «��» (chunk-split UTF-8, fixed 2026-09-28) — in place, same paragraph id,
// so alignments, claims and the bilingual layer that hang off the row survive. Each run of U+FFFD is located in the
// SOURCE file by the text on either side of it; a fill is accepted only if every match agrees. Pure; no deps.

const RUN = /�+/g;
const MARKERS = /⁅\/?s\d+⁆/g;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {string} damaged  paragraph text holding one or more U+FFFD runs (sentence markers allowed)
 * @param {string} source   the source file's text
 * @returns {{ text: string|null, fixed: number, unresolved: number }}  text is null unless EVERY run was resolved
 */
export function repairParagraph(damaged, source, { context = [16, 10, 6] } = {}) {
  const src = String(source || '').normalize('NFC');
  let text = String(damaged || '').normalize('NFC');
  let fixed = 0, unresolved = 0;
  // Resolve left to right; each fill changes the string, so re-scan from the start.
  for (let guard = 0; guard < 200; guard++) {
    RUN.lastIndex = 0;
    const m = RUN.exec(text);
    if (!m) break;
    const before = text.slice(0, m.index).replace(MARKERS, '');
    const after = text.slice(m.index + m[0].length).replace(MARKERS, '');
    let fill = null;
    for (const n of context) {
      const left = before.slice(-n), right = after.slice(0, n);
      if (left.includes('�') || right.includes('�') || (!left && !right)) continue;
      // A split letter is 2–4 UTF-8 bytes → one to four U+FFFD for ONE character; allow up to the run's length.
      const re = new RegExp(`${esc(left)}([^\\s\\uFFFD]{1,${Math.max(1, m[0].length)}})${esc(right)}`, 'g');
      const fills = new Set([...src.matchAll(re)].map((x) => x[1]));
      if (fills.size === 1) { fill = [...fills][0]; break; }
      if (fills.size > 1) break;          // ambiguous: longer context already failed to separate them
    }
    if (fill == null) { unresolved++; text = text.slice(0, m.index) + '\u0000'.repeat(m[0].length) + text.slice(m.index + m[0].length); continue; }
    text = text.slice(0, m.index) + fill + text.slice(m.index + m[0].length);
    fixed++;
  }
  return unresolved ? { text: null, fixed, unresolved } : { text, fixed, unresolved };
}
