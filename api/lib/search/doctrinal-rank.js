// DOCTRINAL AUTHORITY in ranking (Chad 10-20: "Authority with doctrine is absolutely critical"). A relevance score is
// multiplied by a factor from the PARAGRAPH's writer (content.authors — a compilation quoting Bahá'u'lláh is Bahá'u'lláh's
// words), steep enough to decide between passages of similar relevance. Two DOMAINS (Chad 10-23, a decision — see
// planning/anis-liliane-reviews.md):
//   doctrine (default) — the Writings of the Báb, Bahá'u'lláh and 'Abdu'l-Bahá > Shoghi Effendi (letters on his behalf
//     included) > pilgrims' notes of the Central Figures and the Guardian > everything after the Guardian. "The House of
//     Justice has zero doctrinal or interpretive authority. Zero. As with everything below the status of Pilgrim Note" —
//     the House, institutions and scholars weigh alike here: commentary.
//   administration — laws, administration, current guidance: the House of Justice is the primary source (legal authority),
//     beside the Writings that ordain the laws.
// Other traditions keep their own authority numbers (their scripture ranks as scripture). Pure.

// the SAME folding as the Qdrant payload's author_fold (search/qdrant-layers.js authorKey): letters and digits only
export const foldKey = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2018\u2019\u02bc\u02bb`']/g, '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
export const PILGRIM = 1.6;   // doctrine: below Shoghi Effendi (2.6), above the House and everything after the Guardian (1.0)
const TIER = new Map([
  ['bahaullah', 3.0], ['thebab', 3.0], ['bab', 3.0],
  ['abdulbaha', 2.8], ['shoghieffendi', 2.6],
]);
const HOUSE_KEY = 'universalhouseofjustice';
const HOUSE = /universal house of justice|research department/i;
/** The House's weight by domain: commentary on doctrine (no doctrinal standing), primary on law and administration. */
export const houseFactor = (domain) => (domain === 'administration' ? 2.9 : 1.0);
/** Pilgrims' notes by domain: above every post-Guardian source on doctrine; on administration below the House. */
export const pilgrimFactor = (domain) => (domain === 'administration' ? 1.3 : PILGRIM);

// what a question is about: LAW / ADMINISTRATION (the House is primary) or DOCTRINE (default). Rules only. Pure.
const ADMIN = /\b(local|national) spiritual assembl|\bassembl(y|ies)\b|\belection|\belect(ed|ing)?\b|\bvot(e|ing)\b|\bnineteen[- ]day feast|\bfeast\b|\bthe fund\b|\bcontribut(e|ions?)\b|huq[uú]q|\bmarriage\b|parental consent|\bconsent\b|\bdivorce\b|year of patience|\bburial\b|\benrol(l)?ment|\bmembership|administrative (rights|order|sanctions?)|\bsanctions?\b|\bcounsellors?\b|auxiliary board|\bcluster\b|(nine|five|four|seven|three)[- ]year plan|\bthe plan\b|ridv[aá]n message|\bpolicy\b|\bprocedure\b|\bpermitted\b|\ballowed\b|\bobligatory\b|\bis it (?:ok|okay|allowed|permissible)\b|\bcan (?:a )?bah[aá]['’]?[ií]s? \b|\blaws? (?:of|on|about)\b|\bfasting exemption|\bpolitic(s|al) (?:activity|involvement|party)|\bmilitary service|\bcrematio|\bwill and testament of a\b/i;
export const queryDomain = (q) => (ADMIN.test(String(q || '')) ? 'administration' : 'doctrine');

// TALKS (Chad 10-31: "Anís results are being polluted by talks content … even over doctrinal core"). A talk — a media
// transcript, collection Media — is a speaker's commentary: the LOWEST tier on every domain, below published scholarship
// (0.6), whoever speaks and whatever it is titled. A question ABOUT talks (domain 'talks') weighs them neutrally.
export const TALK = 0.4;
export const isTalk = (collection) => /^media$/i.test(String(collection || '').trim());
const talkFactor = (domain) => (domain === 'talks' ? 1 : TALK);
const TALK_Q = /\b(talks?|lectures?|speakers?|speeches|recordings?|firesides?|audio|video|podcasts?|transcripts?)\b/i;
/** Is the question about a talk or a speaker's recording? Then talks are what is asked for — not supplementary. Pure. */
export const aboutTalks = (q) => TALK_Q.test(String(q || ''));

/** The doctrinal writers' keys (author_fold / voices_fold) — the authoritative retrieval pass filters on these. */
export const DOCTRINAL_KEYS = ['bahaullah', 'thebab', 'abdulbaha', 'shoghieffendi'];

/** FUSION-time factor (authority from the outset): known from the Qdrant payload alone — writer key + scope. */
export function keyFactor(authorFold, scope, collection = null, domain = 'doctrine') {
  if (isTalk(collection)) return talkFactor(domain);
  if (/pilgrim notes/i.test(collection || '')) return pilgrimFactor(domain);   // a recollection of a Central Figure / the Guardian
  const t = String(authorFold || '') === HOUSE_KEY ? houseFactor(domain) : TIER.get(String(authorFold || ''));
  const f = t ?? 1;
  return scope === 'supplemental' ? f * 0.7 : f;
}

/** The factor for an authority NUMBER (1–10) — other traditions and unrecognised writers. */
export function numberFactor(auth) {
  const a = Number(auth);
  if (!Number.isFinite(a)) return 1;
  if (a >= 9) return 2.8;
  if (a >= 8) return 2.2;
  if (a >= 7) return 1.3;
  if (a >= 6) return 1.0;
  if (a >= 5) return 0.85;
  if (a >= 3) return 0.6;
  return 0.4;
}

/** hit { author (the paragraph's writer), collection, source_site, source_url }, auth (live authority number) → factor. */
export function doctrinalFactor(hit, auth, domain = 'doctrine') {
  if (isTalk(hit.collection)) return talkFactor(domain);
  if (/pilgrim notes/i.test(hit.collection || '')) return pilgrimFactor(domain);   // a recollection of a Central Figure / the Guardian
  if (Number(auth) <= 1) return 0.4;                                  // other authority-1 collections
  const key = foldKey(hit.author);
  let t = key === HOUSE_KEY || HOUSE.test(String(hit.author || '')) ? houseFactor(domain) : TIER.get(key);
  // AUTHENTICATED TEXT FIRST: a central figure's words count in full only in an authoritative book (their own works, the
  // compilations of the Writings, the House's) — quoted or recalled in a secondary book (a pilgrim's account, a paper) they
  // are a pointer to the original, never its equal (10-20: "Visiting the Bahá'í World Centre" outranked the Íqán)
  if (t != null && hit.book_authority != null && Number(hit.book_authority) < 7) t = Math.min(t, 1.3);
  let f = t ?? numberFactor(auth);
  // a copy on a scraped site (not OceanLibrary, not the library itself) yields to the library's own text
  const site = hit.source_site || '';
  if (site && site !== 'oceanlibrary.com') f *= 0.7;
  return f;
}

/**
 * TALKS AFTER CORE (Chad 10-31): in a result window talks are supplementary — at most `max` of them, never ahead of the
 * last doctrinal-core passage (factor ≥ `core`: the Writings and Shoghi Effendi). A talk beyond the cap gives its slot to
 * the next non-talk of the SAME tradition from `pool` (so the tradition diversity the window already has is kept).
 * Order, never a filter: talks still appear. entries { paragraph: { collection, religion }, _factor }. Pure.
 */
export function talksAfterCore(window, pool = [], { max = 2, core = 2.5 } = {}) {
  const talk = (e) => isTalk(e?.paragraph?.collection);
  const talks = window.filter(talk);
  if (!talks.length) return window;
  const kept = talks.slice(0, max);
  const out = window.filter((e) => !talk(e));
  const used = new Set(window);
  for (const t of talks.slice(max)) {
    const sub = pool.find((e) => !used.has(e) && !talk(e) && (e.paragraph?.religion || '') === (t.paragraph?.religion || ''));
    if (sub) { used.add(sub); out.push(sub); }
  }
  let lastCore = -1;
  out.forEach((e, i) => { if ((e._factor ?? 0) >= core) lastCore = i; });
  // each kept talk keeps its place unless that place is ahead of core; inserted in order, so they stay in order
  let after = lastCore;
  for (const t of kept) {
    const at = Math.min(out.length, Math.max(window.indexOf(t), after + 1));
    out.splice(at, 0, t);
    after = at;
  }
  return out;
}
