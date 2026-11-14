// Shared Anís discussions (P3): a reader publishes a sanitized conversation or one answer → D1 anis_shared (0018) → a public
// page at anis.oceanlibrary.com/d/<slug>. Sanitize = a deterministic scrub (emails, phones, tokened URLs, street addresses) +
// Haiku (metered) naming the reader's personal details as exact redactions + a neutral title and summary. Two steps: share = a
// draft the reader previews; publish = the reader's click (title editable). The owner key (returned once, stored hashed) unpublishes.
import { replyHtml } from '../../src/widget/reply-actions.js';

export const ORIGIN = 'https://anis.oceanlibrary.com';
// slugs always hold a hyphen: /d/<code> without one is a PDF short link (worker/short-links.js SHORT_PATH)
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;
export const DISCUSSION_PATH = /^\/d\/([a-z0-9]+(?:-[a-z0-9]+)+)\/?$/;
export const LIMITS = { turns: 40, turnChars: 30000, totalChars: 90000, title: 120, summary: 240 };
const DRAFT_TTL = 864e5;

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const line = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// ── deterministic scrub ──────────────────────────────────────────────────────────────────────────────────────
const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi;
const PHONE = /(?<![\w#./:=+-])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]\d{3,5}(?![\w/-])/g;
const ADDRESS = /\b\d{1,5}\s+(?:[A-Z][\w'’.-]*\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Circle|Cir|Highway|Hwy|Parkway|Pkwy)\b\.?(?:,?\s*(?:Apt|Apartment|Suite|Unit|#)\.?\s*[\w-]+)?/g;
const SECRET_PARAM = /^(?:token|access_token|id_token|refresh_token|auth|authorization|key|apikey|api_key|sig|signature|secret|password|pass|pwd|session|sessionid|sid|code|otp|jwt|hmac|expires|x-amz-[\w-]+|x-goog-[\w-]+)$/i;

/** A URL without its secret-bearing query parameters (tokens, keys, signatures, session ids); unchanged when it has none. */
export function cleanUrl(u) {
  let url;
  try { url = new URL(u); } catch { return u; }
  const drop = [...url.searchParams.keys()].filter((k) => SECRET_PARAM.test(k));
  if (!drop.length) return u;
  for (const k of drop) url.searchParams.delete(k);
  return url.toString().replace(/\?$/, '');
}

/** Pure: personal contact details out of one text — emails, phone numbers, street addresses → [email] / [phone] / [address];
 *  URLs keep their place, minus secret query parameters (and are never mistaken for phones or addresses). */
export function scrub(text) {
  const urls = [];
  let t = String(text ?? '').replace(URL_RE, (u) => { urls.push(cleanUrl(u)); return `\u0000${urls.length - 1}\u0000`; });
  t = t.replace(EMAIL, '[email]').replace(PHONE, '[phone]').replace(ADDRESS, '[address]');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => urls[+i]);
}

/** Request turns → { turns: [{role, content}] } (from the first question on) or { error }. */
export function normTurns(turns) {
  if (!Array.isArray(turns)) return { error: 'turns required' };
  const out = turns.filter((t) => t && typeof t.content === 'string' && t.content.trim())
    .map((t) => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: t.content.trim() }));
  const first = out.findIndex((t) => t.role === 'user');   // a greeting before the first question is not part of the discussion
  const kept = first < 0 ? [] : out.slice(first);
  if (!kept.some((t) => t.role === 'assistant')) return { error: 'nothing to share yet' };
  if (kept.length > LIMITS.turns) return { error: `at most ${LIMITS.turns / 2} questions can be shared` };
  if (kept.some((t) => t.content.length > LIMITS.turnChars) || kept.reduce((n, t) => n + t.content.length, 0) > LIMITS.totalChars)
    return { error: 'too long to share — share a single answer instead' };
  return { turns: kept };
}

// ── Haiku pass ───────────────────────────────────────────────────────────────────────────────────────────────
export const SANITIZE_SYSTEM = `You prepare a private conversation between a reader and Anís (a research assistant for sacred and scholarly texts) to be published as a public discussion.
1. Find the reader's personal details in every turn: names of private people (the reader, family, friends, colleagues), the reader's own circumstances (health, family events, relationships, age, home town, workplace, school, community, personal struggles), and contact details. Never personal: historical, religious or public figures, authors, translators, works, places named as history, quoted scripture.
2. For each detail give "find" = the shortest exact substring copied verbatim from the turn, and "replace" = a neutral stand-in in square brackets ("[a family member]", "[a friend]", "[a city]", "[an illness]").
3. Write a neutral "title" (at most 70 characters: the question or topic, no personal details) and a one-sentence "summary" (at most 160 characters) of what the discussion covers.
Reply with JSON only: {"title":"…","summary":"…","redactions":[{"turn":0,"find":"…","replace":"[…]"}]}`;

/** Pure: the Haiku messages — every turn numbered, in full. */
export const sanitizeMessages = (turns) => [{ role: 'system', content: SANITIZE_SYSTEM },
  { role: 'user', content: turns.map((t, i) => `[${i}] ${t.role === 'assistant' ? 'Anís' : 'Reader'}:\n${t.content}`).join('\n\n') }];

/** Pure: the model's reply → { title, summary, redactions } or null when it is not the JSON asked for. */
export function parseSanitize(text) {
  const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let j;
  try { j = JSON.parse(s.slice(a, b + 1)); } catch { return null; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const redactions = (Array.isArray(j.redactions) ? j.redactions : [])
    .filter((r) => r && typeof r.find === 'string' && r.find.trim().length >= 2 && r.find.length <= 300)
    .map((r) => ({ find: r.find, replace: /^\[[^\]\n]{1,40}\]$/.test(String(r.replace || '').trim()) ? String(r.replace).trim() : '[removed]' }));
  return { title: line(j.title, 90), summary: line(j.summary, LIMITS.summary), redactions };
}

/** Pure: every redaction applied to every turn (a name the reader gave may come back in an answer). Longest first. */
export function applyRedactions(turns, redactions) {
  const rs = [...(redactions || [])].sort((x, y) => y.find.length - x.find.length);
  return turns.map((t) => ({ ...t, content: rs.reduce((c, r) => c.split(r.find).join(r.replace), t.content) }));
}

/** Pure: a fallback title from the first question (one line, ≤ max chars at a word boundary). */
export function titleFrom(q, max = 70) {
  const s = line(q, 400);
  if (s.length <= max) return s || 'A discussion with Anís';
  const cut = s.slice(0, max - 1), sp = cut.lastIndexOf(' ');
  return `${(sp > max / 2 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-–—]+$/, '')}…`;
}

/** Pure: a readable slug + 8 random base-36 characters (always hyphenated, never a short-link code). */
export function slugFor(title, rand = randomCode()) {
  let s = String(title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’‘ʻ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > 48) s = s.slice(0, 48).replace(/-[^-]*$/, '') || s.slice(0, 48);
  return `${s || 'discussion'}-${rand}`;
}
export function randomCode(n = 8) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return [...b].map((x) => '0123456789abcdefghijklmnopqrstuvwxyz'[x % 36]).join('');
}
export const hashKey = async (k) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(k))))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The full sanitize: deterministic scrub, then Haiku's redactions + title + summary. `ask(messages)` → the model's text.
 *  Throws when the model fails — nothing is shared that only the deterministic pass has seen. */
export async function sanitize(turns, ask) {
  const scrubbed = turns.map((t) => ({ ...t, content: scrub(t.content) }));
  const parsed = parseSanitize(await ask(sanitizeMessages(scrubbed)));
  if (!parsed) throw new Error('sanitize: no JSON from the model');
  const out = applyRedactions(scrubbed, parsed.redactions);
  const q = out.find((t) => t.role === 'user')?.content || '';
  const clean = (s) => applyRedactions([{ content: scrub(s) }], parsed.redactions)[0].content;
  return { turns: out, title: clean(parsed.title) || titleFrom(q), summary: clean(parsed.summary) || null, redactions: parsed.redactions.length };
}

// ── the public page ──────────────────────────────────────────────────────────────────────────────────────────
export const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
// the answer's markdown as page HTML; every heading inside an answer is an h3 (the question is the h2: a sequential outline)
export const answerHtml = (md) => replyHtml(String(md || '').replace(/<!--[\s\S]*?-->/g, '')).replace(/<(\/?)h[1-6]\b/g, '<$1h3');
export const plain = (md) => String(md || '').replace(/<!--[\s\S]*?-->/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_>#|`]/g, '').replace(/\s+/g, ' ').trim();

/** JSON-LD DiscussionForumPosting: the first question is the posting, each answer and later question a comment. */
export function discussionLd(d) {
  const url = `${ORIGIN}/d/${d.slug}`, at = new Date(d.published_at || d.created_at).toISOString();
  const anis = { '@type': 'Organization', name: 'Anís — Ocean AI Research Assistant', url: `${ORIGIN}/` };
  const reader = { '@type': 'Person', name: 'A reader' };
  const [first, ...rest] = d.turns;
  return { '@context': 'https://schema.org', '@type': 'DiscussionForumPosting', '@id': url, url, mainEntityOfPage: url, headline: d.title,
    ...(d.summary ? { description: d.summary } : {}), text: plain(first?.content).slice(0, 2000), datePublished: at, inLanguage: 'en', author: reader,
    publisher: { '@type': 'Organization', name: 'Ocean 2.0', url: 'https://oceanlibrary.com/' },
    commentCount: rest.length,
    comment: rest.map((t, i) => ({ '@type': 'Comment', position: i + 1, text: plain(t.content).slice(0, 5000), datePublished: at, author: t.role === 'assistant' ? anis : reader })) };
}

const CSS = `:root{--bg:#f9f6f0;--card:#fffdf8;--ink:#22201b;--muted:#5f5747;--line:#e5ddcb;--gold:#c8a24b;--gold-ink:#7d5f1c;--link:#6e4f12;--quote:#6b4a2b;--btn:#14203a;--btn-ink:#f6efdc;--serif:'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif;--sans:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#11151a;--card:#171c23;--ink:#e9e6dd;--muted:#a9afb9;--line:#2a313c;--gold-ink:#d9b866;--link:#e6c77e;--quote:#dcc4a0;--btn:#c8a24b;--btn-ink:#14181e}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.65 var(--serif);overflow-wrap:break-word}
a{color:var(--link);text-decoration-thickness:1px;text-underline-offset:3px}
a:hover{text-decoration-thickness:2px}a:focus-visible{outline:2px solid var(--gold);outline-offset:3px;border-radius:4px}
.top{border-bottom:1px solid var(--line)}
.wrap{max-width:46rem;margin:0 auto;padding:0 20px}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:60px}
.brand{display:inline-flex;align-items:center;gap:10px;min-height:48px;color:var(--ink);text-decoration:none;font:600 18px/1 var(--serif)}
.brand small{font:500 12px/1 var(--sans);letter-spacing:.06em;color:var(--muted)}
.mark{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--btn);color:var(--btn-ink);font:600 15px/1 var(--serif)}
.ask{font:500 14px/1 var(--sans);min-height:48px;display:inline-flex;align-items:center;padding:0 4px}
main.wrap{padding-top:40px;padding-bottom:24px}
.kicker{margin:0 0 10px;font:600 12px/1.2 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--gold-ink)}
h1{margin:0;font:600 clamp(28px,5vw,38px)/1.18 var(--serif);letter-spacing:-.005em;text-wrap:balance}
.summary{margin:14px 0 0;color:var(--muted);font-size:18px}
.meta{margin:14px 0 0;font:14px/1.4 var(--sans);color:var(--muted)}
.rule{height:1px;margin:30px 0 8px;border:0;background:linear-gradient(90deg,var(--gold),transparent)}
.turn{margin:30px 0 0}
.who{margin:0 0 6px;font:600 12px/1.2 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.q h2{margin:0;font:600 21px/1.4 var(--serif);text-wrap:pretty}
.a{padding:18px 22px;border:1px solid var(--line);border-left:2px solid var(--gold);border-radius:4px 12px 12px 4px;background:var(--card)}
.a>:first-child{margin-top:0}.a>:last-child{margin-bottom:0}
.a p,.a ul,.a ol{margin:0 0 .9em}.a li{margin:.25em 0}.a ul,.a ol{padding-left:1.4em}
.a h3{margin:1.3em 0 .4em;font:600 18px/1.35 var(--serif)}
.a blockquote{margin:1em 0;padding:2px 0 2px 16px;border-left:2px solid var(--gold);color:var(--quote);font-style:italic}
.a blockquote p{margin:.4em 0}
.a table{width:100%;border-collapse:collapse;margin:1em 0;font:15px/1.45 var(--sans);display:block;overflow-x:auto}
.a th,.a td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.a th{font-weight:600}
.a code{font-size:.9em}.a hr{border:0;border-top:1px solid var(--line);margin:1.4em 0}
.cta{margin:44px 0 0;padding:26px 22px;border-radius:14px;background:var(--card);border:1px solid var(--line);text-align:center}
.cta p{margin:0 0 16px;font-size:18px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:10px 24px;border-radius:999px;background:var(--btn);color:var(--btn-ink);font:600 15px/1.3 var(--sans);text-decoration:none}
.btn:hover{filter:brightness(1.08)}
footer{margin-top:48px;border-top:1px solid var(--line)}
footer .wrap{padding-top:18px;padding-bottom:28px;font:14px/1.7 var(--sans);color:var(--muted)}
footer p{margin:0 0 6px}
@media (max-width:520px){body{font-size:16.5px}main.wrap{padding-top:28px}.a{padding:14px 16px}.brand small{display:none}}`;

export const head = (o) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
${o.canonical ? `<link rel="canonical" href="${esc(o.canonical)}">` : '<meta name="robots" content="noindex">'}
<meta name="theme-color" content="#f9f6f0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#11151a" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/anis-app/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/anis-app/favicon-32.png">
<link rel="apple-touch-icon" href="/anis-app/apple-touch-icon.png">
${o.extra || ''}<style>${CSS}</style>
</head>`;
export const TOP = `<header class="top"><div class="wrap"><a class="brand" href="/"><span class="mark" aria-hidden="true">A</span>Anís <small>Ocean AI Research Assistant</small></a><a class="ask" href="/">Ask a question</a></div></header>`;
const FOOT = `<footer><div class="wrap"><p>Shared by a reader from Anís, the Ocean AI Research Assistant of Ocean 2.0. Personal details are removed before a discussion is published.</p><p>Answers quote and link their sources — read each passage in its context in the <a href="https://oceanlibrary.com/">Ocean Library</a>.</p></div></footer>`;

/** The public discussion page: server-rendered, no script but JSON-LD, inline CSS, light + dark. */
export function discussionPage(d) {
  const url = `${ORIGIN}/d/${d.slug}`, at = d.published_at || d.created_at, iso = new Date(at).toISOString();
  const questions = d.turns.filter((t) => t.role === 'user').length;
  const description = d.summary || titleFrom(plain(d.turns.find((t) => t.role === 'assistant')?.content), 155);
  const og = `<meta property="og:type" content="article">
<meta property="og:site_name" content="Ocean 2.0">
<meta property="og:title" content="${esc(d.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}/anis-app/og-1200x630.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Anís — Ocean AI Research Assistant">
<meta property="article:published_time" content="${iso}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(d.title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ORIGIN}/anis-app/og-1200x630.png">
<script type="application/ld+json">${JSON.stringify(discussionLd(d)).replace(/</g, '\\u003c')}</script>
`;
  const body = d.turns.map((t) => (t.role === 'user'
    ? `<section class="turn q"><p class="who">Question</p><h2>${esc(plain(t.content))}</h2></section>`
    : `<section class="turn"><p class="who">Anís</p><div class="a">${answerHtml(t.content)}</div></section>`)).join('\n');
  return `${head({ title: `${d.title} — Anís`, description, canonical: url, extra: og })}
<body>
${TOP}
<main class="wrap">
<article>
<p class="kicker">${d.scope === 'answer' ? 'An answer from Anís' : 'A discussion with Anís'}</p>
<h1>${esc(d.title)}</h1>
${d.summary ? `<p class="summary">${esc(d.summary)}</p>` : ''}
<p class="meta">Shared <time datetime="${iso.slice(0, 10)}">${fmtDate(at)}</time> · ${questions === 1 ? 'one question' : `${questions} questions`}</p>
<hr class="rule">
${body}
</article>
<aside class="cta" aria-label="Continue"><p>Have a question of your own about this?</p><a class="btn" href="/?from=${esc(d.slug)}">Continue this conversation in Anís</a></aside>
</main>
${FOOT}
</body>
</html>`;
}

export const notFoundPage = () => `${head({ title: 'Discussion not found — Anís', description: 'This shared discussion is not available.' })}
<body>
${TOP}
<main class="wrap"><p class="kicker">Not found</p><h1>This discussion is not available</h1><p class="summary">It may have been unpublished by the reader who shared it.</p>
<aside class="cta" aria-label="Ask"><a class="btn" href="/">Ask Anís a question</a></aside></main>
${FOOT}
</body>
</html>`;

// ── routes (D1) ──────────────────────────────────────────────────────────────────────────────────────────────
const row = (r) => (r ? { ...r, turns: JSON.parse(r.turns || '[]') } : null);
const bySlug = async (env, slug) => row(await env.ANIS_DB.prepare('SELECT * FROM anis_shared WHERE slug = ?').bind(slug).first());

/** POST /api/chat/share {turns, scope, conversation_id?, round?} → a sanitized DRAFT (never public) for the reader's preview:
 *  { slug, url, title, summary, turns, owner_key }. `ask(messages)` = the metered Haiku call (index.js). */
export async function shareDraft(body, env, { ask, site = null, now = Date.now() }) {
  const n = normTurns(body?.turns);
  if (n.error) return { status: 400, out: { error: n.error } };
  const scope = body?.scope === 'conversation' ? 'conversation' : 'answer';
  let s;
  try { s = await sanitize(n.turns, ask); } catch (err) {
    console.warn(`[anis] share sanitize failed: ${err?.message}`);
    return { status: 503, out: { error: 'Could not prepare this for sharing. Please try again.' } };
  }
  const title = line(s.title, LIMITS.title), slug = slugFor(title), owner_key = randomCode(32);
  const conv = typeof body?.conversation_id === 'string' ? body.conversation_id.slice(0, 64) : null;
  const round = Number.isInteger(body?.round) && body.round > 0 ? body.round : null;
  await env.ANIS_DB.prepare(`INSERT INTO anis_shared (slug, title, summary, turns, scope, status, owner_hash, source_conversation, source_round, site, created_at)
    VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`).bind(slug, title, s.summary, JSON.stringify(s.turns), scope, await hashKey(owner_key), conv, round, site, now).run();
  await env.ANIS_DB.prepare(`DELETE FROM anis_shared WHERE status = 'draft' AND created_at < ?`).bind(now - DRAFT_TTL).run();   // unpublished drafts fade in a day
  return { status: 200, out: { slug, url: `${ORIGIN}/d/${slug}`, title, summary: s.summary, turns: s.turns, scope, owner_key, redactions: s.redactions } };
}

/** POST /api/chat/share/publish {slug, owner_key, title?} → the draft goes public (the reader's edited title scrubbed). */
export async function sharePublish(body, env, { now = Date.now() } = {}) {
  const slug = String(body?.slug || '');
  if (!SLUG.test(slug)) return { status: 400, out: { error: 'slug required' } };
  const d = await bySlug(env, slug);
  if (!d || d.owner_hash !== await hashKey(body?.owner_key || '')) return { status: 404, out: { error: 'not found' } };
  const title = scrub(line(body?.title, LIMITS.title)) || d.title;
  await env.ANIS_DB.prepare(`UPDATE anis_shared SET status = 'published', title = ?, published_at = COALESCE(published_at, ?) WHERE slug = ?`).bind(title, now, slug).run();
  return { status: 200, out: { ok: true, slug, url: `${ORIGIN}/d/${slug}`, title } };
}

/** DELETE /api/chat/share/<slug> {owner_key} → gone (the row is deleted, not hidden). */
export async function shareDelete(slug, key, env) {
  if (!SLUG.test(slug)) return { status: 400, out: { error: 'bad slug' } };
  const d = await bySlug(env, slug);
  if (!d || d.owner_hash !== await hashKey(key || '')) return { status: 404, out: { error: 'not found' } };
  await env.ANIS_DB.prepare('DELETE FROM anis_shared WHERE slug = ?').bind(slug).run();
  return { status: 200, out: { ok: true } };
}

/** A published discussion, or null (drafts are never served). */
export async function published(env, slug) {
  if (!SLUG.test(slug)) return null;
  const d = await bySlug(env, slug);
  return d?.status === 'published' ? d : null;
}
