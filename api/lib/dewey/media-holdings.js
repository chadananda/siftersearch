// Dewey's MEDIA holdings check (Chad 10-23: "do we have this talk?" + a YouTube link). A video link is looked up in the media
// library (the Fireside Room talks + the import queue's targets, media_items): by YouTube id, by its source URL, then by title /
// speaker similarity (a re-upload of a talk we hold). → held (the talk's page) · queued (position + an ETA from the recent pace)
// · being processed · could not be imported · not held. A whitelisted contributor's NEW talk joins the import queue as a
// YouTube target (ranked like every other by the media rank job; the pipeline's own rules decide what is published).
// Deps injectable (media-repo, youtube id parser).
const SITE = 'https://siftersearch.com';
export const MEDIA_URL = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch|shorts\/|live\/|embed\/)|youtu\.be\/|vimeo\.com\/\d)/i;
const STOP = new Set(['the', 'and', 'with', 'from', 'that', 'this', 'talk', 'part', 'about', 'what', 'when', 'into', 'their', 'there', 'video', 'full', 'official', 'episode']);
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => fold(s).split(' ').filter((w) => w.length > 3 && !STOP.has(w));
/** Share of the shorter title's words found in the other. Pure. */
export const titleOverlap = (a, b) => { const x = new Set(words(a)), y = new Set(words(b)); const n = Math.min(x.size, y.size); return n ? [...x].filter((w) => y.has(w)).length / n : 0; };
export const mediaLink = (it) => (it?.slug ? `${SITE}/media/${it.slug}` : null);
/** Hours → "about 3 hours" / "about 2 days". Pure. */
export const etaWords = (h) => (h == null ? null : h < 1.5 ? 'within the hour' : h < 36 ? `about ${Math.round(h)} hours` : `about ${Math.round(h / 24)} days`);

const STATUS = { done: 'held', queued: 'queued', scheduled: 'queued', held: 'queued', running: 'processing', failed: 'failed' };

/** url + what oEmbed said about it → the answer. deps: { youtubeId, findMediaByYoutube, findMediaBySource, findMediaByWords, mediaQueueAhead, mediaPublishedSince } */
export async function mediaHoldings(url, { title = null, author = null } = {}, deps, { now = Date.now() } = {}) {
  const id = deps.youtubeId(url);
  let item = (id && await deps.findMediaByYoutube(id)) || await deps.findMediaBySource(url);
  let how = item ? (id && item.youtube_id === id ? 'video id' : 'link') : null;
  if (!item && title) {
    const ws = words(title).sort((a, b) => b.length - a.length).slice(0, 4);
    const near = ws.length >= 2 ? await deps.findMediaByWords(ws.slice(0, 3), { limit: 5 }) : [];
    const best = near.map((m) => ({ m, s: titleOverlap(title, m.title) })).sort((a, b) => b.s - a.s)[0];
    if (best && best.s >= 0.75) { item = best.m; how = 'title'; }
  }
  if (!item || item.state === 'duplicate') return { status: 'not-held', youtube_id: id || null, title, author };
  const status = STATUS[item.state] || item.state;
  const out = { status, how, youtube_id: id || null, title: item.title || title, author: item.speaker || author, item: { id: item.id, title: item.title, speaker: item.speaker, slug: item.slug, state: item.state }, link: status === 'held' ? mediaLink(item) : null };
  if (status === 'queued') {
    out.position = (await deps.mediaQueueAhead(item.queue_rank)) + 1;
    const pace = (await deps.mediaPublishedSince(new Date(now - 48 * 3600e3).toISOString())) / 48;   // talks per hour, last two days
    out.eta = pace > 0 ? etaWords(out.position / pace) : null;
  }
  if (status === 'failed') out.why = String(item.why || '').slice(0, 160) || null;
  return out;
}
