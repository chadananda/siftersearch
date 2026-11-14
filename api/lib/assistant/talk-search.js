// talk_search core (Chad 11-14: "looking for a document should be very very fast"): a published talk by speaker, topic or title, ranked in
// memory over the published rows (no LLM, no Qdrant unless the title says nothing). Deps injectable: rows(), sketch(key), topicDocs(topic). Pure but for the defaults.
import { SITE } from '../source-links.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘'ʼ`]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['the', 'a', 'an', 'of', 'on', 'in', 'to', 'and', 'for', 'about', 'talk', 'talks', 'lecture', 'recording', 'by', 'from', 'with', 'dr', 'mr']);
const words = (s) => fold(s).split(' ').filter((w) => w && !STOP.has(w));
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length]; };
/** How well word w is found among words ws: 1 exact, .9 prefix (≥4), .8 within a typo (1 edit from 5 letters, 2 from 9), else 0. Pure. */
export const wordScore = (w, ws) => ws.reduce((best, x) => Math.max(best, x === w ? 1 : (w.length >= 4 && x.startsWith(w)) || (x.length >= 4 && w.startsWith(x)) ? 0.9
  : w.length >= 5 && lev(w, x) <= (w.length >= 9 ? 2 : 1) ? 0.8 : 0), 0);
const score = (query, text) => { const q = words(query), t = words(text); return q.length ? q.reduce((s, w) => s + wordScore(w, t), 0) / q.length : 0; };

/** Rank talk rows → [{ ...row, score, matched }] best first. speaker words must all be found in the speaker (else dropped); topic/title rank by title. Pure. */
export function rankTalks(rows, { speaker, topic, title }) {
  let pool = rows;
  if (speaker) pool = pool.filter((r) => score(speaker, r.speaker) >= 0.8 && words(speaker).every((w) => wordScore(w, words(r.speaker)) > 0));
  const q = [topic, title].filter(Boolean).join(' ');
  return pool.map((r) => { const s = q ? score(q, r.title) : 1; return { ...r, score: s, matched: !q || s >= 0.5 }; })
    .sort((a, b) => b.score - a.score || (b.year || 0) - (a.year || 0));
}

let cached = { at: 0, rows: null };
const defaults = {
  rows: async () => { if (cached.rows && Date.now() - cached.at < 60000) return cached.rows; cached = { at: Date.now(), rows: await (await import('../repos/media-repo.js')).publishedTalkRows() }; return cached.rows; },
  sketch: async (key) => { if (!key) return null; const m = await import('../repos/media-repo.js'); return (await import('../media/sketch.js')).speakerSketchOrStatic(await m.getSpeaker(key))?.square ?? null; },
  // the transcripts, by keyword, when no title says it → the talks' doc ids
  topicDocs: async (topic) => { const q = await import('../search/qdrant-layers.js'), m = await import('../repos/media-repo.js');
    const r = await q.searchKeywordQdrant(String(topic), { limit: 40, filters: { collection: 'Media' }, timeoutMs: 6000 }).catch(() => ({ hits: [] }));
    return [...new Set((await m.mediaParagraphs([...new Set(r.hits.map((h) => h.paragraph_id))])).map((p) => p.doc_id))]; },
};

/** → { talks: [{ doc_id, slug, title, speaker, year, date, duration_s, playback, url, thumb_url, audio_url, matched }] } top 5, published only. */
export async function talkSearch(a = {}, deps = {}) {
  const d = { ...defaults, ...deps }, { speaker, topic, title } = a;
  if (![speaker, topic, title].some((x) => String(x || '').trim())) return { talks: [], note: 'give a speaker, topic or title' };
  const rows = await d.rows();
  let ranked = rankTalks(rows, { speaker, topic, title });
  // nothing says the topic in a title: the talks whose transcripts do (within the speaker's talks when one is named)
  if (topic && !ranked.some((r) => r.matched)) {
    const ids = new Set((await d.topicDocs(topic).catch(() => [])).map(Number)), byText = ranked.filter((r) => ids.has(Number(r.doc_id)));
    if (byText.length) ranked = byText.map((r) => ({ ...r, matched: true }));
  }
  const top = (speaker || ranked.some((r) => r.matched) ? ranked : []).filter((r) => r.matched || speaker).slice(0, 5);
  const talks = await Promise.all(top.map(async (r) => {
    const sk = await d.sketch(r.speaker_key).catch(() => null), tile = r.thumb && /\.svg$/.test(r.thumb) ? `${SITE}/api/media/${r.slug}/file/${r.thumb}` : null;
    return { doc_id: r.doc_id, slug: r.slug, title: r.title, speaker: r.speaker, year: r.year ?? null, date: r.date ?? null, duration_s: r.duration_s ?? null, playback: r.playback,
      url: `${SITE}/media/${r.slug}`, thumb_url: sk || tile, audio_url: r.playback === 'full' ? `${SITE}/api/media/${r.slug}/file/web/${r.slug}.m4a` : null, matched: r.matched };
  }));
  return { talks };
}
