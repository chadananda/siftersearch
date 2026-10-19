// POSITION QUESTIONS — "what is the Bahá'í position on socialism, equality and property?" (Chad 10-19: Anís answered from
// pilgrim notes and secondary articles — "extremely shallow and wishy washy" — while 'Abdu'l-Bahá on socialism, God Passes
// By on private property, The Promised Day Is Come on the Movement of the Left and the worship of the state, Shoghi
// Effendi on capitalism and free trade, Bahá'u'lláh to the kings on burdensome taxes were all in the library).
// One planning call names the THEMES and the authoritative works where each is addressed (where to look — never the
// answer); each theme is searched; every passage is ranked by AUTHORITY (the Central Figures, Shoghi Effendi, the
// Universal House of Justice first, secondary works only to fill); whole-book "paragraphs" (unsegmented PDF imports) are
// dropped. Deps injectable: create (roleCreate), search (executeSearch), authorityOf.

/** "position / stance / teaching / view on X", "where does the Faith fit", "what does the Faith say about X". Pure. */
export function looksLikePositionQuestion(text) {
  const t = String(text || '');
  return /\b(position|stance|standpoint|view|views|outlook|attitude|perspective|teachings?)\s+(?:of [^?]{0,40}\s)?(?:on|about|regarding|toward|towards)\b/i.test(t)
    || /\bwhere (?:does|do) (?:the )?(?:bah[aá]['’]?[ií]|faith|bah[aá]['’]?[ií] faith)[^?]{0,40}\bfit\b/i.test(t)
    || /\bwhat (?:does|do) (?:the )?(?:bah[aá]['’]?[ií](?: faith| writings| teachings)?|writings|teachings) (?:say|teach|hold) (?:on|about|regarding)\b/i.test(t)
    || /\bsummary of (?:the )?(?:bah[aá]['’]?[ií] )?(?:position|teachings?|view)/i.test(t);
}

const BRIEF = (q) => `A reader asks the Bahá'í library assistant: "${q}"
List the 4–6 THEMES this question covers, and for each: 2–3 short search phrasings (the words the Bahá'í writings themselves use), and the authoritative works where it is addressed (writings of Bahá'u'lláh, the Báb, 'Abdu'l-Bahá, Shoghi Effendi's letters and books, the Universal House of Justice). Name works only if you are confident; the library will be searched, you do not answer.
JSON only: {"themes":[{"theme":"…","queries":["…"],"works":["…"]}]}`;

// (no \b at the end: "Bahá" ends in an accented letter, which \b does not count as a word character)
const AUTHORITATIVE = /(bah[aá]['’]?u['’]?ll[aá]h|\bthe b[aá]b|abdu['’]?l-bah[aá]|shoghi effendi|universal house of justice)/i;
const GIANT = 6000;   // a "paragraph" this long is a whole unsegmented book (pdf imports) — it matches everything

/** Rank passages: authoritative author first, then the library's authority, then search order; giants out. Pure but for authorityOf. */
export async function rankByAuthority(passages, authorityOf = async () => 0) {
  const seen = new Set();
  const scored = [];
  for (const [i, p] of passages.entries()) {
    const key = p.id ?? `${p.document_id}:${p.paragraph_index}`;
    if (seen.has(key) || String(p.text || '').length > GIANT) continue;
    seen.add(key);
    const core = AUTHORITATIVE.test(String(p.author || '')) && !/pilgrim/i.test(String(p.collection || '')) ? 1 : 0;
    scored.push({ p, core, a: Number(await authorityOf(p)) || 0, i });
  }
  return scored.sort((x, y) => y.core - x.core || y.a - x.a || x.i - y.i).map((s) => s.p);
}

/** → { passages, themes } — up to `perTheme` passages a theme, authoritative first, `max` in all. */
export async function positionResearch({ question, create, search, authorityOf, defaults = {}, scope_config, perTheme = 3, max = 16 }) {
  // a question naming the Faith searches its texts (unscoped, a cross-tradition rule leaves the Bahá'í writings ONE slot in 8)
  if (!defaults.religion && /bah[aá]['’]?[ií]/i.test(question)) defaults = { ...defaults, religion: "Baha'i" };
  let themes = [];
  try {
    const r = await create('anis-research-brief', { max_tokens: 1500, temperature: 0, messages: [{ role: 'user', content: BRIEF(question) }] });
    const m = String(r?.choices?.[0]?.message?.content || '').match(/\{[\s\S]*\}/);
    themes = (m ? JSON.parse(m[0]).themes : []) || [];
  } catch { themes = []; }
  themes = themes.filter((t) => t?.theme).slice(0, 6);
  if (!themes.length) return null;
  const searchOne = (query) => search({ query, mode: 'passages', limit: 8, scope_config, plan: { messages: [{ role: 'user', content: query }], defaults } }).then((r) => r?.passages || []).catch(() => []);
  const perThemeHits = await Promise.all(themes.map(async (t) => {
    const qs = [...(t.queries || []).slice(0, 2), ...(t.works || []).slice(0, 1).map((w) => `${w} ${t.theme}`)];   // ≤ 3 searches a theme
    const hits = (await Promise.all(qs.map(searchOne))).flat();
    return { theme: t.theme, ranked: (await rankByAuthority(hits, authorityOf)).slice(0, perTheme) };
  }));
  const out = [], ids = new Set();
  for (const t of perThemeHits) for (const p of t.ranked) {
    const k = p.id ?? `${p.document_id}:${p.paragraph_index}`;
    if (ids.has(k) || out.length >= max) continue;
    ids.add(k); out.push({ ...p, theme: t.theme });
  }
  return { passages: out, themes: perThemeHits.map((t) => ({ theme: t.theme, found: t.ranked.length })) };
}

export const POSITION_HOW = 'The seeker asks for the Bahá\'í position on a subject. Answer THEME BY THEME (one short heading or bold lead each, the themes of the evidence). Under each, say plainly what the authoritative texts affirm and what they warn against, quoting them — Bahá\'u\'lláh, the Báb, \'Abdu\'l-Bahá, Shoghi Effendi, the Universal House of Justice — and naming who and where; use secondary works or pilgrims\' notes only to illustrate, and say that they are not authoritative. Give substance, not hedging: no "it does not fit neatly into any theory", no generic neutrality line, no closing filler — unless a quoted text says so. Never say the library has nothing on a theme when passages on it are given; if a theme truly has no passage, leave it out.';
