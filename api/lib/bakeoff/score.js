// Bake-off scoring — pure. Per model: quality (judge 1-10), reply-language match, latency, cost per 1k replies, value.
// value = mean quality per dollar of 1k replies (higher is better); a model with no known price ranks on quality+speed only.
const SCRIPT = { ar: /[؀-ۿ]/, fa: /[؀-ۿ]/, he: /[֐-׿]/, zh: /[一-鿿]/ };
const LATIN = new Set(['en', 'fr', 'es', 'de', 'it', 'pt']);

/** Did the reply come back in the asker's language (script-level; Latin languages by a few function words)? */
export function languageMatches(lang, reply) {
  const t = String(reply || '');
  if (SCRIPT[lang]) return (t.match(new RegExp(SCRIPT[lang].source, 'g')) || []).length > t.length * 0.2;
  if (!LATIN.has(lang)) return true;
  if (Object.values(SCRIPT).some((r) => (t.match(new RegExp(r.source, 'g')) || []).length > t.length * 0.2)) return false;
  const w = ` ${t.toLowerCase()} `;
  const hints = { en: [' the ', ' and ', ' of '], fr: [' les ', ' des ', ' est '], es: [' los ', ' que ', ' del '], de: [' die ', ' und ', ' der '] };
  if (!hints[lang]) return true;
  const own = hints[lang].reduce((n, h) => n + w.split(h).length - 1, 0);
  const other = Object.entries(hints).filter(([k]) => k !== lang).reduce((n, [, hs]) => n + hs.reduce((m, h) => m + w.split(h).length - 1, 0), 0);
  return own >= other;
}

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };

/** results: [{ model, scenario, lang, ms, usd, quality (1-10|null), error }] → per-model summary, best value first. */
export function summarize(results) {
  const by = new Map();
  for (const r of results) (by.get(r.model) || by.set(r.model, []).get(r.model)).push(r);
  const rows = [...by].map(([model, rs]) => {
    const ok = rs.filter((r) => !r.error);
    const q = ok.map((r) => r.quality).filter((x) => x != null);
    const priced = ok.filter((r) => r.usd != null);
    const mean = q.length ? q.reduce((a, b) => a + b, 0) / q.length : null;
    const usdPer1k = priced.length ? (priced.reduce((a, r) => a + r.usd, 0) / priced.length) * 1000 : null;
    const byLang = {};
    for (const r of ok) { const l = (byLang[r.lang] ||= { n: 0, q: 0, match: 0 }); l.n++; l.q += r.quality ?? 0; l.match += r.language_ok ? 1 : 0; }
    return {
      model, n: rs.length, errors: rs.length - ok.length, quality: mean == null ? null : +mean.toFixed(2),
      pass_rate: q.length ? +(q.filter((x) => x >= 7).length / q.length).toFixed(2) : null,
      language_ok: ok.length ? +(ok.filter((r) => r.language_ok).length / ok.length).toFixed(2) : null,
      p50_ms: pct(ok.map((r) => r.ms), 0.5), p95_ms: pct(ok.map((r) => r.ms), 0.95),
      usd_per_1k: usdPer1k == null ? null : +usdPer1k.toFixed(3),
      value: mean != null && usdPer1k ? +(mean / usdPer1k).toFixed(1) : null,
      by_lang: Object.fromEntries(Object.entries(byLang).map(([l, v]) => [l, { quality: +(v.q / v.n).toFixed(1), language_ok: +(v.match / v.n).toFixed(2) }])),
    };
  });
  return rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || (b.quality ?? 0) - (a.quality ?? 0));
}

/** A model is a RECOMMENDED switch only if it is no worse on quality (−0.3), no worse on language (−0.05), and cheaper. */
export function recommend(summary, current) {
  const cur = summary.find((s) => s.model === current);
  if (!cur || cur.quality == null) return null;
  const better = summary.filter((s) => s.model !== current && s.quality != null && s.errors === 0
    && s.quality >= cur.quality - 0.3 && (s.language_ok ?? 0) >= (cur.language_ok ?? 0) - 0.05
    && s.usd_per_1k != null && cur.usd_per_1k != null && s.usd_per_1k < cur.usd_per_1k);
  return better.sort((a, b) => b.value - a.value)[0] || null;
}
