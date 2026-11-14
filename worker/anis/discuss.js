// Published discussions on the Anís host (Chad 11-14): URL helpers, the chat's "Continue" turns and the sitemap entries.
// The pages themselves are siftersearch's designed dialogue pages rendered on the Anís host (src/pages/dialogue/, src/lib/anis-host.js).
// Canonical = anis.oceanlibrary.com/discuss/<slug> (siftersearch.com/dialogue/<slug> 301s there).
import { plain, titleFrom, ORIGIN } from './share.js';

export const DISCUSS_PATH = /^\/discuss(?:\/([a-z0-9][a-z0-9-]{0,160}))?\/?$/;
export const DISCUSS_API = /^\/api\/chat\/discuss\/([a-z0-9][a-z0-9-]{0,160})$/;
// siftersearch.com/dialogue[/<slug>] — the same discussions' old home; 301s here (Chad 11-14: every link goes to Anís)
export const DIALOGUE_PATH = /^\/dialogue(?:\/(?!assessment\/?$)([a-z0-9][a-z0-9-]{0,160}))?\/?$/;
// slug of a discussion link (/discuss/<slug>, /dialogue/<slug>, absolute or not): '' for the index, null when not a discussion
export function discussSlug(href) {
  let p; try { p = new URL(href, 'https://x.invalid').pathname; } catch { return null; }
  const m = DISCUSS_PATH.exec(p) || DIALOGUE_PATH.exec(p);
  return m ? (m[1] || '') : null;
}
// the canonical (Anís) URL of a discussion, or of the index when slug is empty
export const discussUrl = (slug) => `${ORIGIN}/discuss${slug ? `/${slug}` : ''}`;

// tower's 'YYYY-MM-DD HH:MM:SS' is UTC
export const when = (s) => { const t = Date.parse(/^\d{4}-\d\d-\d\d \d/.test(String(s)) ? String(s).replace(' ', 'T') + 'Z' : String(s)); return Number.isFinite(t) ? t : Date.now(); };
const json = (s, d) => { try { return JSON.parse(s || ''); } catch { return d; } };

/** body_md (### round title, user-turn div, #### the answer's gist, jafar-turn div — repeated) → rounds. */
export function parseRounds(md) {
  const rounds = [];
  let cur = null;
  const re = /^(#{3,4})\s+(.+)$|<div class="(user|jafar)-turn"[^>]*>([\s\S]*?)<\/div>/gm;
  for (let m; (m = re.exec(String(md || '')));) {
    if (m[1] === '###') { cur = { title: m[2].trim(), question: '', gist: '', answer: '' }; rounds.push(cur); continue; }
    if (!cur) { cur = { title: '', question: '', gist: '', answer: '' }; rounds.push(cur); }
    if (m[1] === '####') cur.gist = m[2].trim();
    else if (m[3] === 'user') cur.question = m[4].trim();
    else cur.answer = m[4].trim();
  }
  return rounds.filter((r) => r.question && r.answer);
}

/** A tower dialog row → the discussion this page renders. */
export function fromDialog(d) {
  if (!d?.slug) return null;
  const rounds = parseRounds(d.body_md);
  if (!rounds.length) return null;
  return { slug: d.slug, title: d.title || titleFrom(rounds[0].question), summary: plain(d.description || d.excerpt || ''), summaryMd: d.description || d.excerpt || '', topic: d.topic || '',
    tags: json(d.tags_json, []), published_at: when(d.published_at), updated_at: d.updated_at ? when(d.updated_at) : null, rounds };
}

/** The reader-and-Anís turns a continued chat starts from (the widget's fromShared shape). */
export const turnsOf = (disc) => disc.rounds.flatMap((r) => [{ role: 'user', content: r.question }, { role: 'assistant', content: r.answer }]);

const read = async (fetchFn, path) => {
  const r = await fetchFn(path, { headers: { accept: 'application/json' } });
  if (r.status === 404 || r.status === 400) return { missing: true };
  if (!r.ok) throw new Error(`origin ${r.status}`);
  return { data: await r.json() };
};

/** GET /api/chat/discuss/<slug> → { slug, title, summary, turns } for the chat's "Continue" (?discuss=<slug>). */
export async function discussTurns(slug, { api, fetchFn = fetch }) {
  try {
    const { data, missing } = await read(fetchFn, `${api}/api/v1/dialogs/${slug}`);
    const disc = missing ? null : fromDialog(data?.dialog);
    if (!disc) return Response.json({ error: 'not found' }, { status: 404 });
    return Response.json({ slug: disc.slug, title: disc.title, summary: disc.summary, turns: turnsOf(disc) }, { headers: { 'cache-control': 'public, max-age=300' } });
  } catch { return Response.json({ error: 'unavailable' }, { status: 503 }); }
}

/** The host's sitemap entries for the discussions (index + each page); [] when tower cannot be read. */
export async function discussSitemapUrls({ api, fetchFn = fetch }) {
  try {
    const { data } = await read(fetchFn, `${api}/api/v1/dialogs`);
    const rows = (data?.dialogs || []).filter((d) => d?.slug);
    return [{ loc: `${ORIGIN}/discuss`, changefreq: 'weekly' },
      ...rows.map((d) => ({ loc: `${ORIGIN}/discuss/${d.slug}`, lastmod: new Date(when(d.updated_at || d.published_at)).toISOString().slice(0, 10) }))];
  } catch { return []; }
}
