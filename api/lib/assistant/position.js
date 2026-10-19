// POSITION QUESTIONS — "what is the Bahá'í position on socialism, equality and property?" (Chad 10-19: Anís answered from
// pilgrim notes and secondary articles — "extremely shallow and wishy washy" — while 'Abdu'l-Bahá on socialism, God Passes
// By on private property, The Promised Day Is Come on the Movement of the Left and the worship of the state, Shoghi
// Effendi on capitalism and free trade, Bahá'u'lláh to the kings on burdensome taxes were all in the library).
// One planning call names the THEMES and the authoritative works where each is addressed (where to look — never the
// answer); each theme is searched; every passage is ranked by AUTHORITY (the Central Figures, Shoghi Effendi, the
// Universal House of Justice first, secondary works only to fill); whole-book "paragraphs" (unsegmented PDF imports) are
// dropped. Deps injectable: create (roleCreate), search (executeSearch), authorityOf.
import { logger } from '../logger.js';
const log = logger.child ? logger.child({ mod: 'anis-position' }) : logger;

/** "position / stance / teaching / view on X", "where does the Faith fit", "what does the Faith say about X". Pure. */
export function looksLikePositionQuestion(text) {
  const t = String(text || '');
  return /\b(position|stance|standpoint|view|views|outlook|attitude|perspective|teachings?)\s+(?:of [^?]{0,40}\s)?(?:on|about|regarding|toward|towards)\b/i.test(t)
    || /\bwhere (?:does|do) (?:the )?(?:bah[aá]['’]?[ií]|faith|bah[aá]['’]?[ií] faith)[^?]{0,40}\bfit\b/i.test(t)
    || /\bwhat (?:does|do) (?:the )?(?:bah[aá]['’]?[ií](?: faith| writings| teachings)?|writings|teachings) (?:say|teach|hold) (?:on|about|regarding)\b/i.test(t)
    || /\bsummary of (?:the )?(?:bah[aá]['’]?[ií] )?(?:position|teachings?|view)/i.test(t);
}

const BRIEF = (q) => `A reader asks the Bahá'í library assistant: "${q}"
List the 5–7 THEMES a well-read Bahá'í scholar would cover in answering it — not only the words of the question but the related doctrines the authoritative texts address (for an economic question, e.g. the institution of private property, the role and limits of the state, taxation and the rights of subjects, trade between nations, the warnings about materialist ideologies). For each, ONE line in exactly this form:
THEME: <theme> | SEARCH: <phrasing 1>; <phrasing 2> | WORKS: <work 1>; <work 2>
SEARCH = short phrasings in the words the Bahá'í writings themselves use. WORKS = authoritative works where it is addressed
(the writings of Bahá'u'lláh and the Báb, and their authorised interpretation by 'Abdu'l-Bahá and Shoghi Effendi) — only
ones you are sure of; leave empty if unsure. The library will be searched; you do not answer. Lines only, nothing else.`;
/** The planner's lines → themes. (JSON broke on tower 10-19 — a quote inside a work's title.) Pure. */
export function parseBrief(text) {
  // tolerant of the dressing a model adds: bullets, numbers, bold (10-19: "- **THEME:** …" parsed as no themes)
  return String(text || '').split('\n').map((l) => l.replace(/\*\*|__|`/g, '').replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter((l) => /^THEME\s*:/i.test(l)).map((l) => {
    const part = (k) => (l.match(new RegExp(`${k}\\s*:\\s*([^|]*)`, 'i'))?.[1] || '').trim();
    const list = (k) => part(k).split(';').map((x) => x.trim()).filter(Boolean);
    return { theme: part('THEME'), queries: list('SEARCH'), works: list('WORKS') };
  }).filter((t) => t.theme);
}

// DOCTRINE = the Revelation (Bahá'u'lláh, the Báb) and its authorised interpretation ('Abdu'l-Bahá, Shoghi Effendi). The
// Universal House of Justice is authoritative in APPLYING Bahá'í law and legislating on what the texts do not cover, but
// not decisive on doctrine (Chad 10-19, per the Will and Testament of 'Abdu'l-Bahá) — its guidance is 'application'.
// (no \b at the end: "Bahá" ends in an accented letter, which \b does not count as a word character)
const DOCTRINAL = /(bah[aá]['’]?u['’]?ll[aá]h|\bthe b[aá]b|abdu['’]?l-bah[aá]|shoghi effendi)/i;
const HOUSE = /universal house of justice/i;
/** DOCTRINE (Chad 10-19: "with doctrine, authority is everything … separate actual doctrine [from] human fad opinions"):
 *  the writings of Bahá'u'lláh, the Báb, 'Abdu'l-Bahá and Shoghi Effendi — never a pilgrim's note or a memoir recording
 *  them, never a study about them, and not the House of Justice (application, not doctrine). Pure. */
export const isDoctrine = (p) => DOCTRINAL.test(String(p.author || '')) && !HOUSE.test(String(p.author || '')) && !/pilgrim|memoir|reminiscen/i.test(`${p.collection || ''} ${p.title || ''}`);
/** The House of Justice's own guidance — authoritative on applying the law, labelled as such. Pure. */
export const isApplication = (p) => HOUSE.test(String(p.author || '')) && !/pilgrim/i.test(`${p.collection || ''} ${p.title || ''}`);
const GIANT = 6000;   // a "paragraph" this long is a whole unsegmented book (pdf imports) — it matches everything

/** Rank passages: authoritative author first, then the library's authority, then search order; giants out. Pure but for authorityOf. */
export async function rankByAuthority(passages, authorityOf = async () => 0, works = []) {
  const seen = new Set();
  const scored = [];
  for (const [i, p] of passages.entries()) {
    const key = p.id ?? `${p.document_id}:${p.paragraph_index}`;
    if (seen.has(key) || String(p.text || '').length > GIANT) continue;
    seen.add(key);
    const core = isDoctrine(p) ? 1 : 0;
    const fw = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f'’‘"]/g, '').toLowerCase();
    const named = works.some((w) => fw(w).length > 4 && fw(p.title).includes(fw(w).replace(/^the /, '')));
    scored.push({ p, core, named: named ? 1 : 0, a: Number(await authorityOf(p)) || 0, i });
  }
  // doctrine first; within it a work the planner NAMED for this theme, then RELEVANCE (search order) — the authority number
  // only breaks ties (10-19: a loosely related Aqdas line outranked the exact Promised Day passage)
  return scored.sort((x, y) => y.core - x.core || y.named - x.named || x.i - y.i || y.a - x.a).map((s) => s.p);
}

/** → { passages, themes } — up to `perTheme` passages a theme, authoritative first, `max` in all. */
export async function positionResearch({ question, create, search, authorityOf, defaults = {}, scope_config, perTheme = 3, max = 20 }) {
  // a question naming the Faith searches its texts (unscoped, a cross-tradition rule leaves the Bahá'í writings ONE slot in 8)
  if (!defaults.religion && /bah[aá]['’]?[ií]/i.test(question)) defaults = { ...defaults, religion: "Baha'i" };
  let themes = [], raw = '';
  try {
    const r = await create('anis-research-brief', { max_tokens: 6000,   // Haiku thinks first: 1500 was spent thinking, text empty (10-19; the ≥ 4000 rule)
      temperature: 0, messages: [{ role: 'user', content: BRIEF(question) }] });
    raw = String(r?.choices?.[0]?.message?.content || '');
    if (!raw) log.warn({ finish: r?.choices?.[0]?.finish_reason, usage: r?.usage, model: r?.model, keys: Object.keys(r?.choices?.[0]?.message || {}) }, 'position: planner returned no text');
    themes = parseBrief(raw);
  } catch (err) { log.warn({ err: String(err.message).slice(0, 200) }, 'position: planning failed'); themes = []; }
  themes = themes.filter((t) => t?.theme).slice(0, 7);
  if (!themes.length) { log.warn({ raw: raw.slice(0, 600) }, 'position: no themes'); return null; }
  const searchOne = (query) => search({ query, mode: 'passages', limit: 8, scope_config, plan: { messages: [{ role: 'user', content: query }], defaults } }).then((r) => r?.passages || [])
    .catch((err) => { log.warn({ err: String(err.message).slice(0, 200), query }, 'position: search failed'); return []; });
  const perThemeHits = await Promise.all(themes.map(async (t) => {
    const qs = [...(t.works || []).slice(0, 2).map((w) => `${w} ${(t.queries || [t.theme])[0]}`), ...(t.queries || []).slice(0, 2)];   // ≤ 4 a theme, the named works first
    const hits = (await Promise.all(qs.map(searchOne))).flat();
    // the named works' own searches first, so their passages lead the theme's search order
    const ranked = await rankByAuthority(hits, authorityOf, t.works || []);
    // the theme's DOCTRINE; a non-authoritative view only where it can be set against doctrine (labelled), never a pilgrim note
    const doctrine = ranked.filter(isDoctrine).slice(0, perTheme).map((p) => ({ ...p, standing: 'doctrine' }));
    const application = ranked.filter(isApplication).slice(0, 1).map((p) => ({ ...p, standing: 'application' }));
    const opinion = doctrine.length ? ranked.filter((p) => !isDoctrine(p) && !isApplication(p) && !/pilgrim/i.test(`${p.collection || ''} ${p.title || ''}`)).slice(0, 1).map((p) => ({ ...p, standing: 'opinion' })) : [];
    return { theme: t.theme, ranked: [...doctrine, ...application, ...opinion] };
  }));
  const out = [], ids = new Set();
  for (const t of perThemeHits) for (const p of t.ranked) {
    const k = p.id ?? `${p.document_id}:${p.paragraph_index}`;
    if (ids.has(k) || out.length >= max) continue;
    ids.add(k); out.push({ ...p, theme: t.theme });
  }
  log.info({ themes: perThemeHits.map((t) => `${t.theme}:${t.ranked.length}`), passages: out.length }, 'position: researched');
  if (!out.some((p) => p.standing === 'doctrine')) return null;   // no doctrine found: not a position answer
  return { passages: out, themes: perThemeHits.map((t) => ({ theme: t.theme, found: t.ranked.length })) };
}

export const POSITION_HOW = 'The seeker asks for the Bahá\'í position on a subject. Separate DOCTRINE from everything else. Answer THEME BY THEME (a bold lead for each), and under each say plainly what the doctrine affirms and what it warns against, QUOTING it and naming who and where. DOCTRINE is only the Revelation (Bahá\'u\'lláh, the Báb) and its authorised interpretation (\'Abdu\'l-Bahá, Shoghi Effendi): passages marked [doctrine] carry the answer. A passage marked [application] is the Universal House of Justice applying the law — authoritative for practice, not decisive on doctrine: cite it as such, after the doctrine. A passage marked [opinion] is a writer\'s view, never doctrine: mention it only to set it against what the texts say, and call it a view. Give substance, not hedging: no "it does not fit neatly", no generic neutrality, no talk about kinds of authority, no remarks about your own synthesis or opinion, no closing filler. Never say the library has nothing on a theme when passages on it are given.';
