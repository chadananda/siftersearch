// Biographies on the Anís host (Chad 11-14): anis.oceanlibrary.com/bio/<slug> + the /bio index, rendered here from tower's
// public people API (/api/v1/people*, /api/media/index), edge-cached by the site Worker. Canonical = this URL; the old
// siftersearch.com/biography/* pages 301 here. Shell + look: share.js. Sources ordered Writings/Shoghi Effendi → Nabíl → rest.
import { esc, head, TOP, ORIGIN } from './share.js';
import { widgetEmbed, askLink } from './content-widget.js';
import { svcFixed } from '../../src/lib/imagekit.js';
import { classifyAuthority, AUTHORITY_CLASSES } from '../../api/lib/companion/authority.js';
import { liveRefresh } from '../../src/lib/live-data.js';
import { anisUrl } from '../../api/lib/anis-links.js';

export const BIO_PATH = /^\/bio(?:\/([^/]{1,160}))?\/?$/;
// siftersearch.com/biography[/<key>] — the old home; 301s to /bio[/<key>] (the key is resolved there)
export const BIOGRAPHY_PATH = /^\/biography(?:\/([^/]{1,160}))?\/?$/;
export const bioUrl = (slug) => `${ORIGIN}/bio${slug ? `/${slug}` : ''}`;
// slug of a biography link (/bio/<slug>, /biography/<slug>, absolute or not): '' for the index, null when not a biography
export function bioSlug(href) {
  let p; try { p = new URL(href, 'https://x.invalid').pathname; } catch { return null; }
  const m = BIO_PATH.exec(p) || BIOGRAPHY_PATH.exec(p);
  return m ? (m[1] || '') : null;
}

export const HTML = { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' };
// our image service on this host: the same /img/ path (the anis branch hands /img/* to the image Worker)
export const localImg = (u) => (typeof u === 'string' ? u.replace(/^https:\/\/siftersearch\.com\/img\//, '/img/') : u);
export const imgTag = (url, w, h, alt, cls = '') => {
  const s = url && svcFixed(url, w, h, { extra: 'fo-face,e-sharpen' });
  if (!s?.srcset) return '';
  return `<img${cls ? ` class="${cls}"` : ''} src="${esc(localImg(s.src))}" srcset="${esc(s.srcset.split(', ').map(localImg).join(', '))}" width="${w}" height="${h}" alt="${esc(alt)}" decoding="async">`;
};
export const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[‘’ʻʼ'`]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// "Ask Anís about …": the app opens with the question (the chat reads ?ask=)
// every outbound link through the Anís link policy (collaborator first, never our old host); null = no public page
export const outHref = (u) => (typeof u === 'string' && u ? anisUrl(u) : null);
export const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…`; };

/** A citation's authority rank: the Writings and Shoghi Effendi first, then Nabíl (The Dawn-Breakers), then the rest (≤ 70). */
const CENTRAL = { bahaullah: 100, 'the-bab': 100, bab: 100, 'abdul-baha': 90, 'shoghi-effendi': 90 };
export function sourceRank(s = {}) {
  const title = String(s.source || ''), url = String(s.url || '');
  if (/dawn[- ]?breakers|nabil/i.test(`${title} ${url}`)) return 80;
  let path = ''; try { path = decodeURIComponent(new URL(url).pathname); } catch { /* not a URL */ }
  const segs = path.split('/').filter(Boolean), work = segs.find((x) => x.includes('_')) || '';
  const by = Math.max(0, ...work.split('_').map((x) => CENTRAL[x] || 0));   // "title_author" (oceanlibrary) or "author_title" (library)
  if (by) return by;
  const collection = segs[0] === 'library' ? segs.slice(1, -1).join(' ') : '';
  return Math.min(70, AUTHORITY_CLASSES[classifyAuthority({ title, collection })]?.rank ?? 0);
}

// Latin-script name variants worth showing as "also written": not epithets ("the Master"), not the name itself
export function spellings(p) {
  const seen = new Set([fold(p.name)]);
  return (p.aliases || []).filter((a) => typeof a === 'string' && /^[\p{Script=Latin}\s'‘’ʻ\-.]+$/u.test(a) && !/^(the|his|her|a|sir)\s/i.test(a) && a.length <= 60)
    .filter((a) => { const k = fold(a); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
}

/** Born / died lines from the dossier (death record, the timeline's birth/death events, journeys' birthplace). */
export function lifeDates(p) {
  const ev = p.timeline?.events || [], jr = p.timeline?.journeys || [];
  const b = ev.find((e) => /\b(birth|born)\b/i.test(e.title || '')), d = ev.find((e) => /\b(death|died|martyr\w*|passing|ascension|executed)\b/i.test(e.title || ''));
  const bp = jr.find((j) => /birth/i.test(j.note || ''))?.place;
  const born = b ? [b.date || b.year, bp].filter(Boolean).join(', ') : bp || '';
  const dy = p.death?.year || d?.date || d?.year, dp = p.death?.place || jr.find((j) => /death|died|martyr|burial/i.test(j.note || ''))?.place;
  return { born: String(born || ''), died: [dy, dp].filter(Boolean).join(', '), birthYear: b?.year || null, deathYear: Number(p.death?.year) || d?.year || null };
}

/** Name → slug for linking related people: only names (and aliases) that point at exactly one person (a name is evidence, not identity). */
export function nameIndex(people = [], slugs = new Map()) {
  const hits = new Map();
  for (const p of people) {
    const slug = slugs.get(p.id); if (!slug) continue;
    for (const n of [p.name, ...(p.aliases || [])]) { const k = fold(n); if (k.length < 3) continue; const s = hits.get(k) || new Set(); s.add(slug); hits.set(k, s); }
  }
  const out = new Map();
  for (const [k, s] of hits) if (s.size === 1) out.set(k, [...s][0]);
  return out;
}

// role groups for the index (the dossier's `side` is free text)
const ROLES = [['Bahá’í', /bah[aá]/i], ['Bábí', /b[aá]b[ií]|shaykh[ií]/i], ['Clergy', /clergy|mull[aá]|custodian/i],
  ['Rulers and officials', /q[aá]j[aá]r|ottoman|court|state|royal|legation|government|official/i], ['Western observers', /western|european|british|russian|observer/i],
  ['Other faiths', /islam|sh[ií]|christ|jew|zoroastr|buddh|hindu/i]];
export const roleOf = (side) => { if (/covenant-breaker|opponent|reviled/i.test(side || '')) return 'Opponents'; for (const [r, re] of ROLES) if (re.test(side || '')) return r; return 'Others'; };
const PERIODS = [[1853, 'The Báb’s ministry and the Bábí upheavals (to 1853)'], [1892, 'Bahá’u’lláh’s ministry (1853–1892)'], [1921, '‘Abdu’l-Bahá’s ministry (1892–1921)'], [1957, 'Shoghi Effendi’s ministry (1921–1957)'], [Infinity, 'After 1957']];
export const periodOf = (year) => (Number.isFinite(+year) && +year > 1700 ? PERIODS.find(([end]) => +year <= end)[1] : null);

export const PAGE_CSS = `.crumb{margin:0 0 10px;font:14px/1.4 var(--sans)}.crumb a{display:inline-flex;align-items:center;min-height:48px}
.hero{display:flex;gap:20px;align-items:flex-start}.hero img{flex:none;border-radius:10px;border:1px solid var(--line);object-fit:cover}
.also{margin:10px 0 0;font:15px/1.5 var(--sans);color:var(--muted)}
.facts{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:16px 0 0;font:15px/1.5 var(--sans)}.facts dt{color:var(--muted)}.facts dd{margin:0}
main h2{margin:36px 0 10px;font:600 22px/1.3 var(--serif)}
.ev{margin:0;padding:0;list-style:none}.ev li{padding:14px 0;border-top:1px solid var(--line)}
.when{margin:0;font:600 13px/1.3 var(--sans);color:var(--gold-ink);letter-spacing:.04em}.ev h3{margin:4px 0;font:600 18px/1.35 var(--serif)}.ev p{margin:0}
.ev blockquote{margin:8px 0 0;padding:2px 0 2px 14px;border-left:2px solid var(--gold);font-style:italic;color:var(--muted)}
sup a{text-decoration:none;font:600 12px var(--sans);padding:0 3px}
.notes{font:14px/1.55 var(--sans);color:var(--muted);padding-left:1.6em}.notes li{margin:.35em 0}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}.chips a,.chips span{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border:1px solid var(--line);border-radius:999px;font:15px/1.2 var(--sans);text-decoration:none;color:var(--ink)}
.list{list-style:none;margin:0;padding:0}.list li{padding:12px 0;border-top:1px solid var(--line)}.list a{font:600 17px/1.4 var(--serif);color:var(--ink)}.list p{margin:2px 0 0;color:var(--muted);font:14px/1.45 var(--sans)}
.letters{display:flex;flex-wrap:wrap;gap:4px;margin:20px 0 0;padding:0;list-style:none}.letters a{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border:1px solid var(--line);border-radius:8px;text-decoration:none;font:600 15px var(--sans)}
.count{display:inline-block;min-width:4ch;text-align:right}
.report{margin:28px 0 0;font:15px/1.5 var(--sans)}.report summary{cursor:pointer;min-height:44px;display:flex;align-items:center;color:var(--muted)}.report .btn{border:0;cursor:pointer}.report textarea{display:block;width:100%;margin:8px 0;padding:10px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--ink);font:inherit}
@media (max-width:520px){.hero{flex-direction:column}}`;
const FOOT = `<footer><div class="wrap"><p>Biographies prepared by Anís, the Ocean AI Research Assistant of Ocean 2.0, from the cited sources on each page.</p><p>Read every passage in its context in the <a href="https://oceanlibrary.com/">Ocean Library</a>.</p></div></footer>`;
const og = (o) => `<meta property="og:type" content="${o.type}">
<meta property="og:site_name" content="Ocean 2.0">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${o.url}">
<meta property="og:image" content="${esc(o.image || `${ORIGIN}/anis-app/og-1200x630.png`)}">
<meta name="twitter:card" content="${o.image ? 'summary' : 'summary_large_image'}">
<meta name="twitter:title" content="${esc(o.title)}">
<meta name="twitter:description" content="${esc(o.description)}">
${o.ld ? `<script type="application/ld+json">${JSON.stringify(o.ld).replace(/</g, '\\u003c')}</script>\n` : ''}<style>${PAGE_CSS}${o.css || ''}</style>
`;
/** The Anís page shell for /bio and /media: share.js head + header, OG/JSON-LD, page CSS, footer, the Anís widget (o.page). */
export const shell = (o, main, foot = FOOT) => `${head({ title: o.title, description: o.description, canonical: o.url, extra: og(o) })}
<body>
${TOP}
<main class="wrap">
${main}
</main>
${foot}
${widgetEmbed(o.page)}
</body>
</html>`;

const BORN = /\b(birth|born)\b/i, DIED = /\b(death|died|passing|passed|martyr(dom|ed)?|ascension|executed|execution|killed|slain)\b/i;

/**
 * "Report an error" (Chad 11-14): a reader's note → the Anís feedback store (POST /api/chat/feedback, D1 anis_feedback),
 * conversation_id = <kind>-<slug>, vote down, the note as its question. Round = a per-report number, so reports don't overwrite each other.
 */
export const reportError = (kind, slug) => `<details class="report"><summary>Report an error</summary>
<form data-report="${esc(`${kind}-${slug}`.slice(0, 64))}"><label for="rq">What is wrong on this page?</label><textarea id="rq" name="q" maxlength="300" rows="3" required></textarea><button class="btn" type="submit">Send</button><p class="meta" role="status"></p></form>
<script type="module">{const f=document.querySelector('[data-report]');f.onsubmit=async(e)=>{e.preventDefault();const s=f.querySelector('[role=status]');
try{const r=await fetch('/api/chat/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversation_id:f.dataset.report,round:1+Math.floor(Math.random()*500),vote:'down',question:f.q.value})});
s.textContent=r.ok?'Thank you. We will check it.':'Could not send. Please try again.';if(r.ok)f.q.value=''}catch{s.textContent='Could not send. Please try again.'}}}</script></details>`;

/** schema.org Person. */
export function personLd(p, url, image) {
  const alt = spellings(p), d = lifeDates(p);
  return { '@context': 'https://schema.org', '@type': 'Person', '@id': url, name: p.name, url, mainEntityOfPage: url,
    ...(alt.length ? { alternateName: alt } : {}), ...(image ? { image } : {}),
    ...(d.birthYear ? { birthDate: String(d.birthYear) } : {}), ...(d.deathYear ? { deathDate: String(d.deathYear) } : {}) };
}

/**
 * One person's page. `ctx` = { names: nameIndex Map, talks: index rows by them, mentions: index rows naming them }.
 * Footnotes are numbered in reading order; within each claim the sources run by authority.
 * Every claim must carry a linked source (Chad 11-14): one with none is left off the page here, at render time — stored data is never edited.
 * So the stored summary (uncited prose) is never shown, and born/died show only beside a cited birth/death event.
 */
export function bioPage(p, ctx = {}) {
  const url = bioUrl(p.slug), t = p.timeline || {}, src = t.sources || {}, names = ctx.names || new Map();
  const order = new Map(), notes = [];
  const linked = (ids) => [...new Set(ids || [])].filter((id) => src[id] && outHref(src[id].url));
  const cite = (ids) => linked(ids).sort((a, b) => sourceRank(src[b]) - sourceRank(src[a]))
    .map((id) => { if (!order.has(id)) { notes.push(id); order.set(id, notes.length); } const n = order.get(id); return `<sup><a href="#n${n}" aria-label="Source ${n}">${n}</a></sup>`; }).join('');
  const who = (n) => { const s = names.get(fold(n)); return s && s !== p.slug ? `<a href="/bio/${esc(s)}">${esc(n)}</a>` : esc(n); };
  const alt = spellings(p), ld = lifeDates(p);
  const portrait = p.portrait ? imgTag(p.portrait, 112, 140, `Portrait of ${p.name}`) : '';
  const ogSrc = p.portrait ? svcFixed(p.portrait, 600, 750, { extra: 'fo-face' })?.src : null;
  const ogImg = ogSrc ? `${ORIGIN}${localImg(ogSrc)}` : null;
  const evs = (t.events || []).filter((e) => linked(e.cites).length);
  const d = { born: evs.some((e) => BORN.test(e.title || '')) ? ld.born : null, died: evs.some((e) => DIED.test(e.title || '')) ? ld.died : null };
  const events = evs.map((e) => `<li><p class="when">${esc(e.date || e.year || '')}</p><h3>${esc(e.title || '')}</h3><p>${esc(e.text || '')}${cite(e.cites)}</p>${e.quote && linked([e.quote_cite]).length ? `<blockquote>${esc(e.quote)}${cite([e.quote_cite])}</blockquote>` : ''}</li>`).join('\n');
  const rels = (t.relationships || []).filter((r) => linked(r.cites).length).map((r) => `<li>${who(r.who)}${r.note ? ` <span class="meta">— ${esc(r.note)}</span>` : ''}${cite(r.cites)}</li>`).join('');
  const others = (p.relations || []).filter((n) => typeof n === 'string' && !(t.relationships || []).some((r) => fold(r.who) === fold(n)) && names.get(fold(n)) && names.get(fold(n)) !== p.slug);
  const places = (t.journeys || []).filter((j) => linked(j.cites).length).map((j) => `<li>${esc(j.place)}${j.year ? ` <span class="meta">(${esc(j.year)})</span>` : ''}${j.note ? ` — ${esc(j.note)}` : ''}${cite(j.cites)}</li>`).join('');
  const talk = (x) => `<li><a href="/media/${esc(x.s)}">${esc(x.t)}</a>${x.sp || x.y ? `<p>${[x.sp, x.y].filter(Boolean).map(esc).join(' · ')}</p>` : ''}</li>`;
  const gpb = (p.gpbRefs || []).filter((g) => outHref(g?.url)).slice(0, 6);
  const body = `<article>
<p class="crumb"><a href="/bio">All biographies</a></p>
<div class="hero">${portrait}<div>
<p class="kicker">${esc(roleOf(p.side) === 'Others' ? 'Biography' : roleOf(p.side))}</p>
<h1>${esc(p.name)}</h1>
${alt.length ? `<p class="also">Also written ${alt.map(esc).join(' · ')}</p>` : ''}
</div></div>
${d.born || d.died ? `<dl class="facts">${d.born ? `<dt>Born</dt><dd>${esc(d.born)}</dd>` : ''}${d.died ? `<dt>${p.death?.martyr ? 'Martyred' : 'Died'}</dt><dd>${esc(d.died)}</dd>` : ''}</dl>` : ''}
<hr class="rule">
${gpb.length ? `<h2>In Shoghi Effendi’s <i>God Passes By</i></h2><ul class="list">${gpb.map((g) => `<li><a href="${esc(outHref(g.url))}">${esc(g.heading || 'God Passes By')}</a><p>${esc(clip(g.snippet, 260))}</p></li>`).join('')}</ul>` : ''}
${events ? `<h2>Life</h2><ol class="ev">\n${events}\n</ol>` : ''}
${rels || others.length ? `<h2>Related people</h2><ul class="list">${rels}${others.map((n) => `<li>${who(n)}</li>`).join('')}</ul>` : ''}
${places ? `<h2>Places</h2><ul class="list">${places}</ul>` : ''}
${ctx.talks?.length ? `<h2>Talks by ${esc(p.name)}</h2><ul class="list">${ctx.talks.slice(0, 24).map(talk).join('')}</ul>` : ''}
${ctx.mentions?.length ? `<h2>Talks about ${esc(p.name)}</h2><ul class="list">${ctx.mentions.slice(0, 24).map(talk).join('')}</ul>` : ''}
${p.books?.length ? `<h2>Mentioned in</h2><ul class="chips">${p.books.slice(0, 24).map((b) => `<li><span>${esc(b)}</span></li>`).join('')}</ul>` : ''}
${notes.length ? `<h2>Sources</h2><ol class="notes">${notes.map((id, i) => { const s = src[id]; return `<li id="n${i + 1}">${outHref(s.url) ? `<a href="${esc(outHref(s.url))}">${esc(s.source || 'Source')}</a>` : esc(s.source || 'Source')}${s.proof ? ` — “${esc(clip(s.proof, 220))}”` : ''}</li>`; }).join('')}</ol>` : ''}
</article>
${reportError('bio', p.slug)}
<aside class="cta" aria-label="Ask"><p>Want to know more about ${esc(p.name)}?</p>${askLink(`Ask Anís about ${p.name}`, `Tell me about ${p.name}`, 'btn')}</aside>`;
  const years = [ld.birthYear, ld.deathYear].some(Boolean) ? ` (${ld.birthYear || '?'}–${ld.deathYear || ''})` : '';
  const description = `The life of ${p.name}${years}: every claim linked to its source.`;
  return shell({ type: 'profile', title: `${p.name} — Biography — Anís`, description, url, image: ogImg, ld: personLd(p, url, ogImg), page: { type: 'person', slug: p.slug, title: p.name } }, body);
}

/** The live part of a page (Cached SSR + live refresh): src/lib/live-data.js's liveRefresh, inlined, patches one number. */
export const liveCount = (api, pick) => `<script type="module">{const live=(${liveRefresh.toString()}),el=document.getElementById('n');
live(async()=>{const r=await fetch(${JSON.stringify(api)});return r.ok?(${pick})(await r.json()):null},(n)=>{el.textContent=n.toLocaleString('en')},{el,initial:+el.dataset.n,every:300000,same:(a,b)=>a===b})}</script>`;

/** The index: alphabetical (letter jumps), then by role. `rows` = [{ name, slug, side, summary, death }]. */
export function bioIndexPage(rows) {
  const url = bioUrl('');
  const list = (rows || []).filter((r) => r?.slug && r.name).sort((a, b) => fold(a.name).localeCompare(fold(b.name)));
  const letter = (r) => (fold(r.name)[0] || '#').toUpperCase();
  const groups = list.reduce((g, r) => ((g[letter(r)] ||= []).push(r), g), {});
  const item = (r) => { const sub = [roleOf(r.side) === 'Others' ? null : roleOf(r.side), r.death?.year ? `d. ${r.death.year}` : null].filter(Boolean).join(' · ');
    return `<li><a href="/bio/${esc(r.slug)}">${esc(r.name)}</a>${sub ? `<p>${esc(sub)}</p>` : ''}</li>`; };
  const byRole = list.reduce((g, r) => ((g[roleOf(r.side)] ||= []).push(r), g), {});
  const roleOrder = [...ROLES.map(([r]) => r), 'Opponents', 'Others'].filter((r) => byRole[r]);
  const byPeriod = list.reduce((g, r) => { const p = periodOf(r.death?.year); if (p) (g[p] ||= []).push(r); return g; }, {});
  const periods = PERIODS.map(([, l]) => l).filter((l) => byPeriod[l]);
  const rid = (r) => `r-${fold(r).replace(/ /g, '-')}`;
  const description = 'Lives of the Báb, Bahá’u’lláh, ‘Abdu’l-Bahá, the heroes of Bábí and Bahá’í history and the people around them — every claim cited to its source.';
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': url, url, name: 'Biographies', description,
    mainEntity: { '@type': 'ItemList', numberOfItems: list.length, itemListElement: list.slice(0, 500).map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: bioUrl(r.slug), name: r.name })) } };
  return shell({ type: 'website', title: 'Biographies — Anís, Ocean AI Research Assistant', description, url, ld }, `<p class="kicker">Biographies</p>
<h1>Biographies</h1>
<p class="summary">${esc(description)}</p>
<p class="meta"><span class="count" id="n" data-n="${list.length}">${list.length.toLocaleString('en')}</span> people</p>
<nav aria-label="By letter"><ul class="letters">${Object.keys(groups).map((l) => `<li><a href="#l-${l}">${l}</a></li>`).join('')}</ul></nav>
<nav aria-label="By role"><h2>By role</h2><ul class="chips">${roleOrder.map((r) => `<li><a href="#${rid(r)}">${esc(r)} (${byRole[r].length})</a></li>`).join('')}</ul></nav>
${periods.length ? `<nav aria-label="By period"><h2>By period</h2><ul class="chips">${periods.map((l, i) => `<li><a href="#p-${i}">${esc(l)} (${byPeriod[l].length})</a></li>`).join('')}</ul></nav>` : ''}
${Object.entries(groups).map(([l, rs]) => `<h2 id="l-${l}">${l}</h2><ul class="list">${rs.map(item).join('')}</ul>`).join('\n')}
${roleOrder.map((r) => `<h2 id="${rid(r)}">${esc(r)}</h2><ul class="chips">${byRole[r].map((x) => `<li><a href="/bio/${esc(x.slug)}">${esc(x.name)}</a></li>`).join('')}</ul>`).join('\n')}
${periods.map((l, i) => `<h2 id="p-${i}">${esc(l)}</h2><p class="meta">People who died in this period.</p><ul class="chips">${byPeriod[l].map((x) => `<li><a href="/bio/${esc(x.slug)}">${esc(x.name)}</a></li>`).join('')}</ul>`).join('\n')}
<aside class="cta" aria-label="Ask"><p>Looking for someone else?</p><a class="btn" href="/">Ask Anís</a></aside>
${liveCount('/api/v1/people?limit=1', '(d)=>d.total')}`);
}

export const bioNotFound = () => shell({ type: 'website', title: 'Biography not found — Anís', description: 'This biography is not available.', url: bioUrl('') },
  `<p class="kicker">Not found</p><h1>This biography is not available</h1><p class="summary">It may have been moved, or the name may be spelled differently.</p>
<aside class="cta" aria-label="Browse"><a class="btn" href="/bio">See all biographies</a></aside>`).replace(/<link rel="canonical"[^>]*>/, '<meta name="robots" content="noindex">');

export const read = async (fetchFn, path) => {
  const r = await fetchFn(path, { headers: { accept: 'application/json' } });
  if (r.status === 404 || r.status === 400) return { missing: true };
  if (!r.ok) throw new Error(`origin ${r.status}`);
  return { data: await r.json() };
};
export const optional = (p) => p.then((x) => x.data || null, () => null);   // side data: the page renders without it
export const html = (body, status = 200) => new Response(body, { status, headers: { ...HTML, 'cache-control': status === 200 ? 'public, max-age=300' : 'no-store' } });
export const moved = (location) => new Response(null, { status: 301, headers: { location, 'cache-control': 'public, max-age=3600' } });
export const unavailable = (what) => ({ res: new Response(`${what} are briefly unavailable. Please try again in a moment.`, { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '30' } }), tainted: true });

/** Talks by the person (speaker key = their slug, or the same name) and talks whose title names them. */
export function talksFor(p, items = []) {
  const n = fold(p.name), by = [], about = [];
  for (const x of items) {
    if (!x?.s) continue;
    if (x.k === p.slug || (x.sp && fold(x.sp) === n)) by.push(x);
    else if (n.length >= 5 && ` ${fold(x.t)} `.includes(` ${n} `)) about.push(x);
  }
  return { talks: by, mentions: about };
}

/** GET /bio[/<key>] → { res, tainted } (the edge cache's producer contract). `api` = the tower origin. */
export async function bioResponse(key, { api, fetchFn = fetch }) {
  try {
    if (!key) {
      const [{ data: list }, { data: sm }] = await Promise.all([read(fetchFn, `${api}/api/v1/people?limit=2000`), read(fetchFn, `${api}/api/v1/people/sitemap`)]);
      const slugs = new Map((sm?.people || []).map((x) => [x.id, x.slug]));
      return { res: html(bioIndexPage((list?.people || []).map((x) => ({ ...x, slug: slugs.get(x.id) })))), tainted: false };
    }
    let k; try { k = decodeURIComponent(key); } catch { k = key; }
    const { data: r, missing } = await read(fetchFn, `${api}/api/v1/people/slug/${encodeURIComponent(k)}`);
    if (missing || !r?.slug) return { res: html(bioNotFound(), 404), tainted: false };
    if (r.kind !== 'current' || r.slug !== key) return { res: moved(`/bio/${r.slug}`), tainted: false };   // an old slug or an id → the current one
    const [{ data: p }, list, sm, media] = await Promise.all([read(fetchFn, `${api}/api/v1/people/${r.id}`),
      optional(read(fetchFn, `${api}/api/v1/people?limit=2000`)), optional(read(fetchFn, `${api}/api/v1/people/sitemap`)), optional(read(fetchFn, `${api}/api/media/index`))]);
    if (!p?.name) return { res: html(bioNotFound(), 404), tainted: false };
    const person = { ...p, slug: r.slug };
    const names = nameIndex(list?.people || [], new Map((sm?.people || []).map((x) => [x.id, x.slug])));
    return { res: html(bioPage(person, { names, ...talksFor(person, media?.items || []) })), tainted: !list || !sm || !media };
  } catch { return unavailable('Biographies'); }
}

/** The host's sitemap entries for the biographies (index + each page); [] when tower cannot be read. */
export async function bioSitemapUrls({ api, fetchFn = fetch }) {
  try {
    const { data } = await read(fetchFn, `${api}/api/v1/people/sitemap`);
    return [{ loc: bioUrl(''), changefreq: 'weekly' }, ...(data?.people || []).filter((x) => x?.slug).map((x) => ({ loc: bioUrl(x.slug), changefreq: 'monthly' }))];
  } catch { return []; }
}
