// Talks on the Anís host (Chad 11-14): anis.oceanlibrary.com/media/<slug> + the /media index, rendered here from tower's
// public media API (/api/media/index, /api/media/<slug>), edge-cached by the site Worker. Canonical = this URL; the old
// siftersearch.com/media[/<slug>] pages 301 here. Only a published remaster ever plays — never the original (CLAUDE.md).
import { esc, ORIGIN } from './share.js';
import { askLink } from './content-widget.js';
import { shell, imgTag, localImg, outHref, clip, read, optional, html, moved, unavailable, liveCount, fold, capName, reportError } from './people.js';
import { svcFixed } from '../../src/lib/imagekit.js';

export const MEDIA_PATH = /^\/media(?:\/([a-z0-9][a-z0-9_-]{0,160}))?\/?$/i;
export const mediaUrl = (slug) => `${ORIGIN}/media${slug ? `/${slug}` : ''}`;
// slug of a talk link (/media/<slug>, absolute or not): '' for the index, null when not a talk page
export function mediaSlug(href) {
  let p; try { p = new URL(href, 'https://x.invalid').pathname; } catch { return null; }
  const m = MEDIA_PATH.exec(p);
  return m ? (m[1] || '') : null;
}

/** The listening copy, or null: only a ready remaster, only its web files, never anything named original. */
export function listeningAudio(item) {
  const a = item?.audio;
  if (!a?.remastered || !a.ready) return null;
  const ok = (u) => (typeof u === 'string' && /^\/api\/media\/[^/]+\/file\/web\//.test(u) && !/original/i.test(u) ? u : null);
  const ogg = ok(a.ogg), m4a = ok(a.m4a);
  return ogg || m4a ? { ogg, m4a } : null;
}

export const clock = (s) => { const t = Math.max(0, Math.floor(+s || 0)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = String(t % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const isoDur = (s) => { const t = Math.round(+s || 0); return `PT${Math.floor(t / 3600)}H${Math.floor((t % 3600) / 60)}M${t % 60}S`; };
// a person link from the talk (`/biography/<slug>` on tower) → this host's /bio/<slug>
const bioHref = (u) => { const m = /^\/biography\/([a-z0-9-]+)$/.exec(String(u || '')); return m ? `/bio/${m[1]}` : null; };

const CSS = `.player{margin:22px 0 0;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--card)}.player audio{display:block;width:100%;height:54px}
.toc{list-style:none;margin:0;padding:0;font:15px/1.5 var(--sans)}.toc li{display:flex;gap:12px;padding:6px 0;border-top:1px solid var(--line)}
.t{display:inline-flex;align-items:center;min-width:56px;min-height:44px;font:600 13px/1 var(--sans);font-variant-numeric:tabular-nums;color:var(--gold-ink);text-decoration:none}
.tx p{margin:0 0 1em}.tx h3{margin:1.6em 0 .5em;font:600 18px/1.35 var(--serif)}.tx .spk{font:600 12px/1.2 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-right:6px}
.qs{list-style:none;margin:0;padding:0}.qs li{padding:12px 0;border-top:1px solid var(--line)}.qs blockquote{margin:0 0 6px;padding:2px 0 2px 14px;border-left:2px solid var(--gold);font-style:italic}.qs p{margin:0;font:14px/1.45 var(--sans);color:var(--muted)}
.sp{display:flex;gap:14px;align-items:center}.sp img{border-radius:50%;border:1px solid var(--line)}`;
const FOOT = `<footer><div class="wrap"><p>Talks remastered for listening and transcribed by Anís, the Ocean AI Research Assistant of Ocean 2.0.</p><p>Quoted passages link to the <a href="https://oceanlibrary.com/">Ocean Library</a>, where each can be read in its context.</p></div></footer>`;
// time links: play the talk from there (the only script on the page)
const SEEK = `<script type="module">{const a=document.querySelector('audio');const go=(t)=>{if(!a)return;a.currentTime=t;a.play().catch(()=>{})};
document.addEventListener('click',(e)=>{const l=e.target.closest('a[data-t]');if(!l||!a)return;e.preventDefault();go(+l.dataset.t);history.replaceState(null,'','#t='+l.dataset.t)});
const m=/^#t=(\\d+)/.exec(location.hash);if(m&&a)a.addEventListener('loadedmetadata',()=>{a.currentTime=+m[1]},{once:true})}</script>`;
const tlink = (t) => `<a class="t" href="#t=${Math.floor(+t || 0)}" data-t="${Math.floor(+t || 0)}">${clock(t)}</a>`;

/** schema.org AudioObject (the listening copy, when one plays). */
export function talkLd(item, url, audio) {
  return { '@context': 'https://schema.org', '@type': 'AudioObject', '@id': url, url, mainEntityOfPage: url, name: item.title,
    ...(item.summary ? { description: clip(item.summary, 300) } : {}), ...(item.duration_s ? { duration: isoDur(item.duration_s) } : {}),
    ...(item.speaker ? { author: { '@type': 'Person', name: item.speaker } } : {}), ...(item.language ? { inLanguage: item.language } : {}),
    ...(item.date || item.year ? { dateCreated: String(item.date || item.year) } : {}), ...(item.place ? { contentLocation: { '@type': 'Place', name: item.place } } : {}),
    ...(audio ? { contentUrl: `${ORIGIN}${audio.m4a || audio.ogg}`, encodingFormat: audio.m4a ? 'audio/mp4' : 'audio/ogg' } : {}),
    publisher: { '@type': 'Organization', name: 'Ocean 2.0', url: 'https://oceanlibrary.com/' } };
}

/** One talk: title, speaker (→ /bio), player (remaster only), contents, transcript with time links, quoted passages, people. */
export function talkPage(item, { speakerSlug = null } = {}) {
  const url = mediaUrl(item.slug), audio = listeningAudio(item);
  const names = item.speakers || {};
  const persons = [...new Map((item.links || []).filter((l) => l.kind === 'person' && bioHref(l.url) && l.name).map((l) => [bioHref(l.url), l.name])).entries()];
  const spk = item.speaker ? (speakerSlug ? `<a href="/bio/${esc(speakerSlug)}">${esc(item.speaker)}</a>` : esc(item.speaker)) : '';
  const face = item.thumb?.url ? imgTag(item.thumb.sketch?.square || item.thumb.url, 56, 56, item.speaker || 'Speaker') : '';
  const heads = new Map((item.headings || []).map((h) => [h.p, h.text]));
  const paras = (item.paragraphs || []).map((p) => {
    const text = (p.words || []).map((w) => w[0]).join(' ').replace(/\s+([,.;:!?])/g, '$1');
    return `${heads.has(p.n) ? `<h3>${esc(heads.get(p.n))}</h3>` : ''}<p id="p${p.n}">${tlink(p.t0)} ${p.spk && Object.keys(names).length > 1 ? `<span class="spk">${esc(names[p.spk] || p.spk)}</span>` : ''}${esc(text)}</p>`;
  }).join('\n');
  const toc = (item.chapters || []).map((c) => `<li>${tlink(c.t)}<span>${esc(c.title)}</span></li>`).join('');
  const passages = [...(item.quotes || []), ...(item.cross_references || [])].filter((q) => q?.excerpt && outHref(q.url)).slice(0, 16)
    .map((q) => `<li><blockquote>${esc(clip(q.excerpt, 320))}</blockquote><p><a href="${esc(outHref(q.url))}">${esc(q.cite || 'Source')}</a>${q.t0 != null ? ` · ${tlink(q.t0)}` : ''}${q.claim ? ` — ${esc(q.claim)}` : ''}</p></li>`).join('');
  const meta = [item.date || item.year, item.place, item.event, item.duration_s ? `${Math.round(item.duration_s / 60)} min` : null].filter(Boolean).map(esc).join(' · ');
  const og = item.thumb?.url ? svcFixed(item.thumb.sketch?.square || item.thumb.url, 600, 600)?.src : null;
  const body = `<article>
<p class="crumb"><a href="/media">All talks</a></p>
<p class="kicker">Talk</p>
<h1>${esc(item.title)}</h1>
${spk ? `<div class="sp">${face}<p class="meta">${spk}</p></div>` : ''}
${meta ? `<p class="meta">${meta}</p>` : ''}
${audio ? `<div class="player"><audio controls preload="none">${audio.ogg ? `<source src="${esc(audio.ogg)}" type="audio/ogg">` : ''}${audio.m4a ? `<source src="${esc(audio.m4a)}" type="audio/mp4">` : ''}</audio></div>` : '<p class="meta">The listening copy of this talk is being prepared.</p>'}
${item.summary ? `<p class="summary">${esc(item.summary)}</p>` : ''}
<hr class="rule">
${toc ? `<h2>Contents</h2><ol class="toc">${toc}</ol>` : ''}
${passages ? `<h2>Passages quoted and referred to</h2><ul class="qs">${passages}</ul>` : ''}
${persons.length ? `<h2>People in this talk</h2><ul class="chips">${persons.map(([h, n]) => `<li><a href="${esc(h)}">${esc(capName(n))}</a></li>`).join('')}</ul>` : ''}
${paras ? `<h2>Transcript</h2><div class="tx">\n${paras}\n</div>` : ''}
</article>
${reportError('media', item.slug)}
<aside class="cta" aria-label="Ask"><p>Questions about this talk?</p>${askLink('Ask Anís about this talk', `Tell me about the talk “${item.title}”${item.speaker ? ` by ${item.speaker}` : ''}`, 'btn')}</aside>
${audio ? SEEK : ''}`;
  const description = clip(item.summary || `${item.title}${item.speaker ? `, a talk by ${item.speaker}` : ''}.`, 160);
  return shell({ type: 'article', title: `${item.title}${item.speaker ? ` — ${item.speaker}` : ''} — Anís`, description, url, image: og ? `${ORIGIN}${localImg(og)}` : null, ld: talkLd(item, url, audio), css: CSS, page: { type: 'talk', slug: item.slug, title: item.title } }, body, FOOT);
}

/** The index: every published talk by speaker (most talks first), then the rest, with counts that refresh live. */
export function mediaIndexPage(idx) {
  const url = mediaUrl(''), items = (idx?.items || []).filter((x) => x?.s && x.t && x.pb !== 'none');
  const speakers = new Map((idx?.speakers || []).map((s) => [s.k, s]));
  const by = items.reduce((g, x) => ((g[x.k || ''] ||= []).push(x), g), {});
  const keys = Object.keys(by).filter(Boolean).sort((a, b) => by[b].length - by[a].length || fold(a).localeCompare(fold(b)));
  const row = (x) => `<li><a href="/media/${esc(x.s)}">${esc(x.t)}</a><p>${[x.y, x.d ? `${Math.round(x.d / 60)} min` : null].filter(Boolean).map(esc).join(' · ')}</p></li>`;
  const section = (k) => { const s = speakers.get(k), n = s?.n || by[k][0].sp || k; const face = s?.p ? imgTag(s.p, 48, 48, n) : '';
    return `<h2 id="s-${esc(k)}" class="sp">${face}<span>${esc(n)} <span class="meta">(${by[k].length})</span></span></h2><ul class="list">${by[k].map(row).join('')}</ul>`; };
  const description = 'Talks on the Bahá’í Faith and its history, remastered for listening, each with a transcript linked to the passages it quotes.';
  const hours = Math.round(+idx?.hours || items.reduce((t, x) => t + (+x.d || 0), 0) / 3600);
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': url, url, name: 'Talks', description,
    mainEntity: { '@type': 'ItemList', numberOfItems: items.length, itemListElement: items.slice(0, 500).map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: mediaUrl(x.s), name: x.t })) } };
  return shell({ type: 'website', title: 'Talks — Anís, Ocean AI Research Assistant', description, url, ld, css: CSS }, `<p class="kicker">Talks</p>
<h1>Talks</h1>
<p class="summary">${esc(description)}</p>
<p class="meta"><span class="count" id="n" data-n="${items.length}">${items.length.toLocaleString('en')}</span> talks · about ${hours.toLocaleString('en')} hours</p>
<nav aria-label="Speakers"><h2>Speakers</h2><ul class="chips">${keys.slice(0, 40).map((k) => `<li><a href="#s-${esc(k)}">${esc(speakers.get(k)?.n || by[k][0].sp || k)} (${by[k].length})</a></li>`).join('')}</ul></nav>
${keys.map(section).join('\n')}
${by[''] ? `<h2 id="s-other">Other recordings <span class="meta">(${by[''].length})</span></h2><ul class="list">${by[''].map(row).join('')}</ul>` : ''}
<aside class="cta" aria-label="Ask"><p>Looking for a talk on a subject?</p><a class="btn" href="/">Ask Anís</a></aside>
${liveCount('/api/media/index', '(d)=>(d.items||[]).length')}`, FOOT);
}

export const mediaNotFound = () => shell({ type: 'website', title: 'Talk not found — Anís', description: 'This talk is not available.', url: mediaUrl('') },
  `<p class="kicker">Not found</p><h1>This talk is not available</h1><p class="summary">It may have been moved or withdrawn.</p>
<aside class="cta" aria-label="Browse"><a class="btn" href="/media">See all talks</a></aside>`, FOOT).replace(/<link rel="canonical"[^>]*>/, '<meta name="robots" content="noindex">');

/** GET /media[/<slug>] → { res, tainted } (the edge cache's producer contract). `api` = the tower origin. */
export async function mediaResponse(slug, { api, fetchFn = fetch }) {
  try {
    if (!slug) return { res: html(mediaIndexPage((await read(fetchFn, `${api}/api/media/index`)).data)), tainted: false };
    const r = await fetchFn(`${api}/api/media/${encodeURIComponent(slug)}`, { headers: { accept: 'application/json' } });
    if (r.status === 404 || r.status === 400) {   // a duplicate copy names the group's best (moved_to)
      const to = (await r.json().catch(() => null))?.moved_to;
      return { res: to && /^[\w-]+$/.test(to) && to !== slug ? moved(`/media/${to}`) : html(mediaNotFound(), 404), tainted: false };
    }
    if (!r.ok) throw new Error(`origin ${r.status}`);
    const item = await r.json();
    if (!item?.slug || item.pending) return { res: html(mediaNotFound(), 404), tainted: false };
    if (item.slug !== slug) return { res: moved(`/media/${item.slug}`), tainted: false };
    const key = item.speaker ? Object.values(item.links || {}).map((l) => l?.kind === 'person' && fold(l.name) === fold(item.speaker) && /^\/biography\/([a-z0-9-]+)$/.exec(l.url)?.[1]).find(Boolean) : null;
    let speakerSlug = key || null;
    if (!speakerSlug && item.speaker) {   // the speaker's biography, when there is one (by their speaker key)
      const idx = await optional(read(fetchFn, `${api}/api/media/index`));
      const k = (idx?.speakers || []).find((s) => fold(s.n) === fold(item.speaker))?.k;
      const b = k ? await optional(read(fetchFn, `${api}/api/v1/people/slug/${encodeURIComponent(k)}`)) : null;
      speakerSlug = b?.slug || null;
    }
    return { res: html(talkPage(item, { speakerSlug })), tainted: false };
  } catch { return unavailable('Talks'); }
}

/** The host's sitemap entries for the talks (index + each page); [] when tower cannot be read. */
export async function mediaSitemapUrls({ api, fetchFn = fetch }) {
  try {
    const { data } = await read(fetchFn, `${api}/api/media/index`);
    return [{ loc: mediaUrl(''), changefreq: 'daily' }, ...(data?.items || []).filter((x) => x?.s && x.pb !== 'none').map((x) => ({ loc: mediaUrl(x.s), ...(x.at ? { lastmod: String(x.at).slice(0, 10) } : {}) }))];
  } catch { return []; }
}
