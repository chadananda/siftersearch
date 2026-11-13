// A whole work's original beside its whole translation, aligned by MEANING (Chad 11-13: "it MUST be aligned by semantics"): both sides cut
// into clauses/sentences, every short run embedded (multilingual embeddings, cents per tablet, no LLM), then one monotone dynamic program
// picks the grouping with the highest total similarity. Original runs never cross a verse; text is never changed. Pure except `embed`.

/** Text → pieces whose join is the text: cut after a verse star (*) or a sentence end (. ! ? ؟) before whitespace. */
export const units = (text) => String(text || '').split(/(?<=(?:\*|[.!?؟]["'”’»)\]]*)\s+)/).filter((s) => s.length)
  .reduce((a, s) => { if (a.length && !/\p{L}/u.test(s)) a[a.length - 1] += s; else if (a.length && !/\p{L}/u.test(a.at(-1))) a[a.length - 1] += s; else a.push(s); return a; }, []);   // a bare "*" is no clause

const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y || 1); };
export const MAX_O = 5, MAX_T = 3, BASE = 0.3, SKIP = 0.12;

/** verses: original verse texts; translation: the whole translation text; embed(texts) → vectors.
 *  → per verse, its lines [{ o, t }] (o joins back to the verse, every translation sentence lands in exactly one line; a verse the
 *  translation lacks gets one line with t ''). */
export async function alignByMeaning(verses, translation, embed, { maxO = MAX_O, maxT = MAX_T, base = BASE, skip = SKIP } = {}) {
  const O = verses.flatMap((v, vi) => units(v).map((text) => ({ text, vi }))), T = units(translation);
  const oKey = (i, k) => (k && i + k <= O.length && O[i + k - 1].vi === O[i].vi ? O.slice(i, i + k).map((u) => u.text).join('').trim() : null);
  const tKey = (j, k) => (k && j + k <= T.length ? T.slice(j, j + k).join('').trim() : null);
  const texts = new Set();
  for (let i = 0; i < O.length; i++) for (let k = 1; k <= maxO; k++) { const s = oKey(i, k); if (s) texts.add(s); }
  for (let j = 0; j < T.length; j++) for (let k = 1; k <= maxT; k++) { const s = tKey(j, k); if (s) texts.add(s); }
  const list = [...texts], vecs = await embed(list), V = new Map(list.map((s, n) => [s, vecs[n]]));
  // dp[i][j]: best score with the first i original pieces and the first j translation pieces placed
  const N = O.length, M = T.length, dp = Array.from({ length: N + 1 }, () => new Float64Array(M + 1).fill(-Infinity)), back = Array.from({ length: N + 1 }, () => new Array(M + 1));
  dp[0][0] = 0;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) {
    if (dp[i][j] === -Infinity) continue;
    const go = (a, b, s) => { if (dp[i][j] + s > dp[i + a][j + b]) { dp[i + a][j + b] = dp[i][j] + s; back[i + a][j + b] = [a, b]; } };
    // an untranslated stretch of a verse (a postscript the translation omits) costs ONE skip, however many clauses: charged per
    // clause, stealing a weak match was cheaper, and the last translated sentence slid onto the postscript (11-13)
    for (let a = 1; i + a <= N && O[i + a - 1].vi === O[i].vi; a++) go(a, 0, -skip);
    if (j < M) go(0, 1, -skip);
    for (let a = 1; a <= maxO; a++) { const os = oKey(i, a); if (!os) break;
      for (let b = 1; b <= maxT && j + b <= M; b++) go(a, b, cos(V.get(os), V.get(tKey(j, b))) - base); }
  }
  const steps = [];
  for (let i = N, j = M; i || j;) { const [a, b] = back[i][j]; steps.unshift({ i: i - a, a, j: j - b, b }); i -= a; j -= b; }
  // steps → lines: a lone translation sentence joins the line before it (else the next); a lone original piece joins the line before it in its verse
  const out = verses.map(() => []);
  let carry = '', last = null;
  for (const s of steps) {
    const t = T.slice(s.j, s.j + s.b).join('');
    if (!s.a) { if (last) last.t += t; else carry += t; continue; }
    const vi = O[s.i].vi, o = O.slice(s.i, s.i + s.a).map((u) => u.text).join('');
    if (!s.b && last && last.vi === vi) { last.o += o; continue; }
    last = { vi, o, t: carry + t }; carry = ''; out[vi].push(last);
  }
  return out.map((ls) => ls.map(({ o, t }) => ({ o: o.trim(), t: t.trim() })));
}
