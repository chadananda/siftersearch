// BOOK REQUESTS for prolific contributors (Chad 10-23). Who is prolific (thresholds from the Worker's mail_settings), and
// which 5–10 works from OUR REAL wanted lists to ask each of them for — personalised to what they have contributed (same
// author, collection, tradition). Pools: the missing-books triage's no-source queue (catalogue rows we cannot fetch
// ourselves), Dewey's wanted / researched / to-buy / lead items. Pure; the route (routes/dewey-mail.js) gathers the data.
import { createHmac } from 'node:crypto';

/** Prolific: ≥ recentMin accepted items in the last window, or ≥ totalMin ever — and active within idleDays. Pure. */
export function isProlific({ total = 0, recent = 0, last_at = null }, { recentMin = 5, totalMin = 15, idleDays = 90, now = Date.now() } = {}) {
  const active = last_at && now - Date.parse(last_at) <= idleDays * 864e5;
  return !!active && (recent >= recentMin || total >= totalMin);
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const shelfOf = (i) => i.identified?.shelf || (i.religion || i.collection ? { religion: i.religion || null, collection: i.collection || null } : null);

/** What a contributor's own items say they care about: authors, collections, traditions (weighted by count). Pure. */
export function interests(items = []) {
  const count = (m, k) => { if (k) m.set(k, (m.get(k) || 0) + 1); };
  const authors = new Map(), collections = new Map(), religions = new Map();
  for (const i of items) {
    count(authors, fold(i.author));
    const s = shelfOf(i);
    count(collections, s?.collection ? `${fold(s.religion)}|${fold(s.collection)}` : null);
    count(religions, fold(s?.religion));
  }
  return { authors, collections, religions };
}

const WHY = { 'no-source': 'listed in our catalogue, but we have no copy', wanted: 'on our wanted list', researched: 'researched — we still need a copy',
  'to-buy': 'on our list to buy', lead: 'a lead our scouts found' };
/** A row fit to show a person: a real title (not a file-name slug like "bia_blogging_suggestions"), a real author or none. Pure. */
export const presentable = (p) => !/_|\.(pdf|docx?|html?)$/i.test(p.title || '') && /\s/.test(String(p.title || '').trim())
  && !/^(pdf|doc|file|scan|unknown)[-_]|^[a-z0-9-]+-[a-z0-9-]+$/i.test(String(p.author || '').trim());

/** Pool entries → the contributor's 5–10 best matches: [{ title, author, why, source }]. Pure.
 *  pool: [{ title, author, religion?, collection?, identified?, source: 'no-source'|state, since? }]; own: their items (never asked back). */
export function pickRequests(pool = [], own = [], { min = 5, max = 10 } = {}) {
  const like = interests(own);
  const mine = new Set(own.map((i) => fold(i.title)));
  const seen = new Set();
  const scored = [];
  for (const p of pool) {
    const t = fold(p.title);
    if (!t || t.length < 4 || mine.has(t) || seen.has(t) || !presentable(p)) continue;
    seen.add(t);
    const s = shelfOf(p);
    const a = like.authors.get(fold(p.author)) || 0, c = s?.collection ? like.collections.get(`${fold(s.religion)}|${fold(s.collection)}`) || 0 : 0, r = like.religions.get(fold(s?.religion)) || 0;
    // an author they send is the strongest sign; counts are capped so one huge shelf cannot outrank every author match
    const score = (a ? 10 + Math.min(a, 3) : 0) + (c ? 4 + Math.min(c, 3) : 0) + (r ? 1 : 0) + (p.source === 'no-source' ? 0.5 : 0);
    const because = a ? `you have sent us other works by ${p.author}` : c ? `it fills a gap in ${s.religion} › ${s.collection}, where you have contributed` : r ? `it is in ${s.religion}, where you contribute` : null;
    scored.push({ title: p.title, author: p.author || null, why: `${WHY[p.source] || 'wanted'}${because ? `; ${because}` : ''}`, source: p.source, score, matched: !!(a || c || r) });
  }
  scored.sort((x, y) => y.score - x.score);
  const matched = scored.filter((x) => x.matched);
  const list = matched.length >= min ? matched.slice(0, max) : [...matched, ...scored.filter((x) => !x.matched)].slice(0, Math.max(min, Math.min(max, matched.length)));
  return list.map(({ score, matched: m, ...x }) => x);
}

// ── the contributor's ITEM PAGE: a signed link (no sign-in needed) — /dewey/item/<id>?t=<sig> ──
const SITE = 'https://siftersearch.com';
export const itemSig = (id, secret = process.env.INTERNAL_API_KEY || '') => createHmac('sha256', secret).update(`dewey-item:${Number(id)}`).digest('hex').slice(0, 24);
export const itemUrl = (id, secret) => `${SITE}/dewey/item/${Number(id)}?t=${itemSig(id, secret)}`;
export const itemSigOk = (id, t, secret) => typeof t === 'string' && t.length === 24 && t === itemSig(id, secret);
