// Share links for a page (moment pages, talk pages): X, Facebook, WhatsApp, email — plain URLs, no SDKs or trackers.
// Pure; tested in tests/api/media-listing.test.js.
export const SITE = 'https://siftersearch.com';

/** Canonical path of a moment's page. */
export const momentPath = (slug, key) => `/media/${encodeURIComponent(slug)}/m/${encodeURIComponent(key)}`;

/** → { x, facebook, whatsapp, email } for an absolute url and the text that goes with it. */
export function shareLinks(url, text = '') {
  const u = encodeURIComponent(url), t = encodeURIComponent(text);
  return {
    x: `https://x.com/intent/post?text=${t}&url=${u}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text}${text ? ' ' : ''}${url}`)}`,
    email: `mailto:?subject=${t}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
  };
}

/** A moment as share text: “quote” — Speaker (trimmed so a post leaves room for the link). */
export function momentShareText(m, max = 200) {
  let q = String(m.text || '').replace(/\s+/g, ' ').trim();
  if (q.length > max) q = `${q.slice(0, q.lastIndexOf(' ', max))}…`;
  return `“${q}”${m.speaker ? ` — ${m.speaker}` : ''}`;
}

/** The post that goes with a video short (YouTube Shorts / Reels / TikTok): quote, who and where, the link back to the
 *  full talk at that time, hashtags. */
export function shortPostText({ text = '', speaker = '', title = '', year = null, talkUrl = '' }, max = 300) {
  let q = String(text).replace(/\s+/g, ' ').trim();
  if (q.length > max) q = `${q.slice(0, q.lastIndexOf(' ', max))}…`;
  const who = [speaker, title ? `“${title}”` : '', year].filter(Boolean).join(', ');
  const tags = ['#Bahai', '#BahaiFaith', speaker ? `#${speaker.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '')}` : '', '#Shorts'].filter((t) => t && t !== '#').join(' ');
  return [`“${q}”`, who ? `— ${who}` : '', talkUrl ? `Hear the whole talk: ${talkUrl}` : '', tags].filter(Boolean).join('\n\n');
}
