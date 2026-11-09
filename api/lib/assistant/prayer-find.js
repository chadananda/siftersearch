// PRAYER FINDING for any tradition (Chad 11-09: prayer-ness is a property of the PASSAGE — it addresses God or is used in devotion —
// never of one book's headings). findPrayers: a name/incipit → literal + phrase (+ meaning for a name) over the tradition's WHOLE scope,
// scripture included; a need → meaning search (hype + phrase) in the tradition plus inside its prayer works. Headings, titles and prayer
// works are ranking SIGNALS only. wholePrayer: one chosen paragraph → the whole prayer (attribution run, a small section, else the
// contiguous address). Pure over injected deps: search(layer, input), findDocuments, paragraphsInRange, sectionsOfDoc.
import { canonicalTradition } from './tradition-name.js';
import { standingOf } from './tradition-authority.js';
import { prayerWorksOf, prayerScore, TRADITIONS } from './prayer-works.js';
import { splitPrayers, hasWords, isAttribution, isHeadingRow, sectionAt } from './prayer-sections.js';

const OPENING = 220;
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`ʻʼ]/g, "'").toLowerCase().replace(/[^\p{L}\p{N}']+/gu, ' ').trim();
export const opening = (t) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > OPENING ? `${s.slice(0, OPENING).replace(/\s+\S*$/, '')}…` : s; };
// a passage that ADDRESSES God (vocative / second person singular to the divine / a closing Amen), in the scripts the library holds most. A ranking
// signal, never a filter: the Jev choice (judge.prayer) verifies prayer-ness until EXTRACT labels passage form (review 11-09 wishlist).
const ADDRESS = /\b(thou|thee|thy|thine|hallowed)\b|\bO (God|Lord|Allah|my Lord|our Lord|Father|Thou)\b|\b(our|my) (Father|Lord|God)\b|\bamen\b|\b(lord|god),? (have mercy|hear|forgive|grant|help)|\by[aā] (allah|rabb)/i;
const ADDRESS_NATIVE = /اللهم|ربنا|رب اغفر|يا (الله|رب|إلهي)|الهی|ای خدا|ברוך אתה|אבינו|हे (प्रभु|भगवान)|ॐ/u;
export const addressesGod = (t) => ADDRESS.test(String(t || '')) || ADDRESS_NATIVE.test(String(t || ''));
// first-person petition without a human addressee: "Give us this day", "forgive me" — joins a prayer by contiguity only
const PETITION = /\b(us|our|me|my|we)\b/i, HUMAN = /\b(ye|you|your|yours)\b/i;
const devotional = (t) => addressesGod(t) || (PETITION.test(t) && !HUMAN.test(t));
const STANDING = { writings: 1.5, guardian: 1, compilation: 0.8, reported: 0.3, house: 0.3, secondary: 0 };
const isHeadingLike = (p) => isHeadingRow(p) || !hasWords([p]);
const keyOf = (p) => `${p.document_id}:${p.paragraph_index}`;

/** The candidates' ranking (signals only) → number. Pure. */
export function prayerSignals(p, { name = null, works = new Set(), top = new Set() } = {}) {
  const sig = [];
  // named: the text or its heading carries the name, or the engine ranks it FIRST for the name (a meaning hit: "the Lord's Prayer" → Matthew 6:9)
  if (name && (fold(`${p.heading || ''} ${p.text}`).includes(fold(name)) || top.has(keyOf(p)))) sig.push('named');
  if (addressesGod(p.text)) sig.push('addresses God');
  if (works.has(Number(p.document_id))) sig.push('prayer work');
  if (prayerScore({ title: p.heading || '' }) > 0 || prayerScore({ title: p.title || '' }) > 0) sig.push('prayer title');
  const w = { named: 3, 'addresses God': 2, 'prayer work': 2, 'prayer title': 1 };
  const standing = standingOf(p);
  return { signals: sig, prayer_score: sig.reduce((n, s) => n + w[s], 0) + (STANDING[standing] ?? 0), standing };
}

// a heading hit (a section title naming the prayer: "The Lord's Prayer", "For the Departed") → the first body paragraph after it, headed by it
async function bodyOf(p, paragraphsInRange) {
  if (!isHeadingLike(p) || !paragraphsInRange) return p;
  const rows = await paragraphsInRange(p.document_id, p.paragraph_index + 1, p.paragraph_index + 4).catch(() => []);
  const r = (rows || []).find((x) => String(x.text || '').trim() && !isHeadingRow(x) && !isAttribution(x.text) && hasWords([x]));
  return r ? { ...p, id: r.id ?? p.id, text: r.text, paragraph_index: r.paragraph_index, heading: String(p.text || '').replace(/^#+\s*/, '').trim(), source_url: null } : null;
}

/** One tradition's candidates for a name/incipit and/or a need. → { candidates, works, how } */
async function oneTradition(tradition, a, d) {
  const filters = { ...(tradition ? { tradition } : {}), ...(a.lang ? { language: a.lang } : {}) };
  const works = tradition ? await prayerWorksOf(tradition, { findDocuments: d.findDocuments, language: a.lang || null }).catch(() => []) : [];
  const inWorks = [...(a.workDoc ? [a.workDoc] : []), ...works.filter((w) => w.id !== a.workDoc?.id)].slice(0, 3);
  const q = (layer, query, limit, f = filters) => d.search(layer, { query, limit, filters: f }).then((o) => o?.passages || [], () => []);
  const named = a.name || a.incipit, jobs = [], how = [], top = new Set();
  const first = (pr) => pr.then((ps) => { if (ps[0]?.document_id != null) top.add(keyOf(ps[0])); return ps; });
  if (named) {
    jobs.push(first(q('literal_search', named, 6)), first(q('phrase_search', named, 6)));
    if (a.name) jobs.push(first(q('hype_search', a.name, 6)));
    how.push(`${a.incipit && !a.name ? 'the opening words' : 'the name'} "${named}" (literal, phrase${a.name ? ', meaning' : ''}) across ${tradition || 'the library'}`);
  }
  if (a.need) {
    jobs.push(q('hype_search', a.need, 8), q('phrase_search', a.need, 6));
    how.push(`the need "${a.need}" by meaning across ${tradition || 'the library'}`);
  }
  for (const w of inWorks) jobs.push(q('phrase_search', named || a.need, 4, { documentId: w.id }));
  if (inWorks.length) how.push(`inside ${inWorks.map((w) => w.title).join(', ')}`);
  const raw = (await Promise.all(jobs)).flat();
  const workIds = new Set([...works, ...(a.workDoc ? [a.workDoc] : [])].map((w) => Number(w.id)));
  const seen = new Set(), out = [];
  for (const p0 of raw) {
    if (p0?.document_id == null || p0.paragraph_index == null || isAttribution(p0.text)) continue;
    if (tradition && p0.religion && canonicalTradition(p0.religion) !== tradition) continue;   // the engine filter, enforced
    const p = await bodyOf(p0, d.paragraphsInRange);
    if (!p || seen.has(keyOf(p))) continue;
    seen.add(keyOf(p));
    const s = prayerSignals(p, { name: named, works: workIds, top: top.has(keyOf(p0)) ? new Set([keyOf(p)]) : top });
    out.push({ ...p, ...s, work: p.title || null, tradition: canonicalTradition(p.religion || tradition || '') || null, opening: opening(p.text) });
  }
  out.sort((x, y) => y.prayer_score - x.prayer_score || (y.score ?? 0) - (x.score ?? 0));
  return { candidates: out, works: inWorks, how };
}

/** Candidates for a prayer, by name/incipit and/or need, in one tradition or (none given) per tradition, keeping only traditions whose hits look
 *  like prayer (address, prayer work or title, or the name itself). → { candidates, tradition, traditions, works, searched }. */
export async function findPrayers(a = {}, d = {}) {
  const tradition = a.tradition ? canonicalTradition(a.tradition) : a.workDoc?.religion ? canonicalTradition(a.workDoc.religion) : null;
  const limit = a.limit ?? 12;
  if (tradition) {
    const r = await oneTradition(tradition, a, d);
    return { candidates: r.candidates.slice(0, limit), tradition, traditions: [{ tradition, count: r.candidates.length }], works: r.works,
      searched: [{ tradition, how: r.how, works: r.works.map((w) => w.title), found: r.candidates.length }] };
  }
  const per = await Promise.all((a.traditions || TRADITIONS).map(async (t) => ({ t, ...(await oneTradition(t, a, d)) })));
  const real = per.map((x) => ({ ...x, candidates: x.candidates.filter((c) => c.signals.length) })).filter((x) => x.candidates.length)
    .sort((x, y) => y.candidates[0].prayer_score - x.candidates[0].prayer_score);
  // round-robin: each tradition's best, then each one's second… so a choice over the top 8 spans the traditions
  const mixed = []; for (let i = 0; mixed.length < limit && real.some((x) => x.candidates[i]); i++) for (const x of real) if (x.candidates[i] && mixed.length < limit) mixed.push(x.candidates[i]);
  return { candidates: mixed, tradition: null, traditions: real.map((x) => ({ tradition: x.t, count: x.candidates.length })), works: per.flatMap((x) => x.works),
    searched: per.map((x) => ({ tradition: x.t, how: x.how, works: x.works.map((w) => w.title), found: real.find((r) => r.t === x.t)?.candidates.length ?? 0 })) };
}

/** One paragraph → the whole prayer holding it: a run closed by an attribution line; else the smallest section when it is short enough to be one
 *  prayer (a psalm); else contiguity — neighbours join while they address God or petition in the first person to no human addressee, stopping
 *  at a heading and after "Amen". → { rows, bound }. Deps: paragraphsInRange, sectionsOfDoc. */
export async function wholePrayer({ document_id: doc, paragraph_index: pi }, { paragraphsInRange, sectionsOfDoc } = {}) {
  const sections = ((await sectionsOfDoc?.(doc).catch(() => [])) || []).filter((s) => s.paragraphs > 0);
  const sec = sectionAt(sections, pi);
  const [a, b] = sec && sec.paragraphs <= 40 ? [sec.start_index, sec.end_index] : [Math.max(sec?.start_index ?? 0, pi - 20), Math.min(sec?.end_index ?? Infinity, pi + 20)];
  const rows = ((await paragraphsInRange(doc, a, b).catch(() => [])) || []).filter((r) => String(r.text || '').trim()).sort((x, y) => x.paragraph_index - y.paragraph_index);
  const at = rows.findIndex((r) => r.paragraph_index === pi);
  if (at < 0) return { rows: [], bound: 'unread' };
  if (rows.some((r) => isAttribution(r.text))) {
    const run = splitPrayers(rows, { max: 14 }).find((p) => p.some((r) => r.paragraph_index === pi));
    if (run && isAttribution(run.at(-1).text)) return { rows: run, bound: 'attribution' };
  }
  const body = rows.filter((r) => !isHeadingRow(r));
  if (sec && sec.paragraphs <= 40 && body.length <= 14 && body.every((r) => devotional(r.text) || r.paragraph_index === pi)) return { rows: body, bound: 'section' };
  let i = at, j = at;
  while (i > 0 && !isHeadingRow(rows[i - 1]) && !/\bamen\b[.!”"’']*\s*$/i.test(rows[i - 1].text) && devotional(rows[i - 1].text)) i--;
  while (j < rows.length - 1 && !/\bamen\b[.!”"’']*\s*$/i.test(rows[j].text) && !isHeadingRow(rows[j + 1]) && devotional(rows[j + 1].text)) j++;
  return { rows: rows.slice(i, j + 1), bound: i === j ? 'paragraph' : 'contiguous' };
}
