// Published discussions on the Anís host (Chad 11-14): the curated public conversations (tower published_conversations,
// /api/v1/dialogs) at anis.oceanlibrary.com/discuss/<slug> + an index at /discuss, in the look of the shared /d/ pages
// (share.js head/CSS). Canonical = this URL (siftersearch.com/dialogue/<slug> 301s here). Edge-cached by the site Worker.
import { esc, fmtDate, answerHtml, plain, head, TOP, titleFrom, ORIGIN } from './share.js';
import { widgetEmbed } from './content-widget.js';

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
// a summary's *italic* titles, nothing else (descriptions are plain prose)
const emph = (md) => esc(String(md || '')).replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
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

const TOPICS = { theology: 'Theology', ethics: 'Ethics', 'social-order': 'Social order', politics: 'Politics', history: 'History', 'comparative-religion': 'Comparative religion',
  mysticism: 'Mysticism', practice: 'Practice', 'modern-challenges': 'Modern challenges', 'word-meaning': 'Word and meaning', metaphysics: 'Metaphysics', philosophy: 'Philosophy' };
export const topicLabel = (t) => TOPICS[t] || String(t || '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

const CSS = `.q .ask-full{margin:8px 0 0;color:var(--muted);font-size:17px}
.gist{margin:0 0 .8em;font-weight:600}
.list{list-style:none;margin:28px 0 0;padding:0}
.list li{padding:20px 0;border-top:1px solid var(--line)}
.list h2{margin:4px 0 6px;font:600 21px/1.35 var(--serif);text-wrap:pretty}
.list h2 a{color:var(--ink);text-decoration:none}.list h2 a:hover{text-decoration:underline}
.list p{margin:0;color:var(--muted)}
.list .meta{margin:8px 0 0}
.crumb{margin:0 0 10px;font:14px/1.4 var(--sans)}
.crumb a{display:inline-flex;align-items:center;min-height:48px}`;
const FOOT = `<footer><div class="wrap"><p>Discussions with Anís, the Ocean AI Research Assistant of Ocean 2.0, prepared for publication.</p><p>Answers quote and link their sources — read each passage in its context in the <a href="https://oceanlibrary.com/">Ocean Library</a>.</p></div></footer>`;
const og = (o) => `<meta property="og:type" content="${o.type}">
<meta property="og:site_name" content="Ocean 2.0">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${o.url}">
<meta property="og:image" content="${ORIGIN}/anis-app/og-1200x630.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Anís — Ocean AI Research Assistant">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.title)}">
<meta name="twitter:description" content="${esc(o.description)}">
<meta name="twitter:image" content="${ORIGIN}/anis-app/og-1200x630.png">
${o.ld ? `<script type="application/ld+json">${JSON.stringify(o.ld).replace(/</g, '\\u003c')}</script>\n` : ''}<style>${CSS}</style>
`;

/** JSON-LD: a DiscussionForumPosting (the first question is the posting, every answer and later question a comment). */
export function discussLd(disc) {
  const url = `${ORIGIN}/discuss/${disc.slug}`, at = new Date(disc.published_at).toISOString();
  const anis = { '@type': 'Organization', name: 'Anís — Ocean AI Research Assistant', url: `${ORIGIN}/` }, reader = { '@type': 'Person', name: 'A reader' };
  const [first, ...rest] = turnsOf(disc);
  return { '@context': 'https://schema.org', '@type': 'DiscussionForumPosting', '@id': url, url, mainEntityOfPage: url, headline: disc.title,
    ...(disc.summary ? { description: disc.summary } : {}), text: plain(first.content).slice(0, 2000), datePublished: at,
    ...(disc.updated_at ? { dateModified: new Date(disc.updated_at).toISOString() } : {}), inLanguage: 'en', author: reader,
    ...(disc.tags.length ? { keywords: disc.tags.join(', ') } : {}),
    publisher: { '@type': 'Organization', name: 'Ocean 2.0', url: 'https://oceanlibrary.com/' }, commentCount: rest.length,
    comment: rest.map((t, i) => ({ '@type': 'Comment', position: i + 1, text: plain(t.content).slice(0, 5000), datePublished: at, author: t.role === 'assistant' ? anis : reader })) };
}

const page = (o, main) => `${head({ title: o.title, description: o.description, canonical: o.url, extra: og(o) })}
<body>
${TOP}
<main class="wrap">
${main}
</main>
${FOOT}
${widgetEmbed(o.page)}
</body>
</html>`;

/** One published discussion: server-rendered, no client script, light + dark. */
export function discussPage(disc) {
  const url = `${ORIGIN}/discuss/${disc.slug}`, iso = new Date(disc.published_at).toISOString();
  const description = disc.summary ? titleFrom(disc.summary, 160) : titleFrom(plain(disc.rounds[0].answer), 155);
  const body = disc.rounds.map((r) => `<section class="turn q"><p class="who">Question</p><h2>${esc(plain(r.title || r.question))}</h2>${r.title ? `<p class="ask-full">${esc(plain(r.question))}</p>` : ''}</section>
<section class="turn"><p class="who">Anís</p><div class="a">${r.gist ? `<p class="gist">${esc(plain(r.gist))}</p>` : ''}${answerHtml(r.answer)}</div></section>`).join('\n');
  const n = disc.rounds.length;
  return page({ type: 'article', title: `${disc.title} — Anís`, description, url, ld: discussLd(disc), page: { type: 'discussion', slug: disc.slug, title: disc.title } }, `<article>
<p class="crumb"><a href="/discuss">All discussions</a></p>
<p class="kicker">${esc(disc.topic ? topicLabel(disc.topic) : 'A discussion with Anís')}</p>
<h1>${esc(disc.title)}</h1>
${disc.summary ? `<p class="summary">${emph(disc.summaryMd)}</p>` : ''}
<p class="meta">Published <time datetime="${iso.slice(0, 10)}">${fmtDate(disc.published_at)}</time> · ${n === 1 ? 'one question' : `${n} questions`}</p>
<hr class="rule">
${body}
</article>
<aside class="cta" aria-label="Continue"><p>Have a question of your own about this?</p><a class="btn" href="/?discuss=${esc(disc.slug)}">Continue this conversation with Anís</a></aside>`);
}

/** The index: every published discussion, newest first. `list` = tower's /api/v1/dialogs rows. */
export function discussIndexPage(list) {
  const url = `${ORIGIN}/discuss`;
  const rows = [...(list || [])].filter((d) => d?.slug).sort((a, b) => when(b.published_at) - when(a.published_at));
  const description = 'Conversations with Anís, the Ocean AI Research Assistant, on questions of faith, scripture and history — every answer quoted and cited from the Ocean library.';
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': url, url, name: 'Discussions with Anís', description,
    mainEntity: { '@type': 'ItemList', itemListElement: rows.map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/discuss/${d.slug}`, name: d.title })) } };
  const items = rows.map((d) => { const at = when(d.published_at), iso = new Date(at).toISOString();
    return `<li><p class="kicker">${esc(topicLabel(d.topic))}</p><h2><a href="/discuss/${esc(d.slug)}">${esc(d.title)}</a></h2>${d.excerpt || d.description ? `<p>${esc(titleFrom(plain(d.excerpt || d.description), 200))}</p>` : ''}<p class="meta"><time datetime="${iso.slice(0, 10)}">${fmtDate(at)}</time>${d.rounds_count ? ` · ${d.rounds_count} questions` : ''}</p></li>`; }).join('\n');
  return page({ type: 'website', title: 'Discussions with Anís — Ocean AI Research Assistant', description, url, ld }, `<p class="kicker">Discussions</p>
<h1>Discussions with Anís</h1>
<p class="summary">${esc(description)}</p>
${rows.length ? `<ul class="list">\n${items}\n</ul>` : '<p class="meta">No discussions are published yet.</p>'}
<aside class="cta" aria-label="Ask"><p>Have a question of your own?</p><a class="btn" href="/">Ask Anís</a></aside>`);
}

export const discussNotFound = () => page({ type: 'website', title: 'Discussion not found — Anís', description: 'This discussion is not available.', url: `${ORIGIN}/discuss` },
  `<p class="kicker">Not found</p><h1>This discussion is not available</h1><p class="summary">It may have been moved or withdrawn.</p>
<aside class="cta" aria-label="Browse"><a class="btn" href="/discuss">See all discussions</a></aside>`).replace(/<link rel="canonical"[^>]*>/, '<meta name="robots" content="noindex">');

const HTML = { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' };
const read = async (fetchFn, path) => {
  const r = await fetchFn(path, { headers: { accept: 'application/json' } });
  if (r.status === 404 || r.status === 400) return { missing: true };
  if (!r.ok) throw new Error(`origin ${r.status}`);
  return { data: await r.json() };
};

/** GET /discuss[/<slug>] → { res, tainted } (the edge cache's producer contract). `api` = the tower origin. */
export async function discussResponse(slug, { api, fetchFn = fetch }) {
  try {
    if (!slug) {
      const { data } = await read(fetchFn, `${api}/api/v1/dialogs`);
      return { res: new Response(discussIndexPage(data?.dialogs || []), { status: 200, headers: { ...HTML, 'cache-control': 'public, max-age=300' } }), tainted: false };
    }
    const { data, missing } = await read(fetchFn, `${api}/api/v1/dialogs/${slug}`);
    const disc = missing ? null : fromDialog(data?.dialog);
    if (!disc) return { res: new Response(discussNotFound(), { status: 404, headers: { ...HTML, 'cache-control': 'no-store' } }), tainted: false };
    return { res: new Response(discussPage(disc), { status: 200, headers: { ...HTML, 'cache-control': 'public, max-age=300' } }), tainted: false };
  } catch {
    return { res: new Response('Discussions are briefly unavailable. Please try again in a moment.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '30' } }), tainted: true };
  }
}

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
