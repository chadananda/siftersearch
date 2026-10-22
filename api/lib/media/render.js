// A media item's two text renditions: transcript.md (clean Markdown for search ingestion — one block per paragraph with
// id="para_N" t0/t1/spk attributes, quotations as links on the speaker's own words) and page.html (standalone, no site
// chrome, self-contained: player + transcript + quotation links + cross-reference breakouts). Pure.
import { spansOf } from './links.js';
import { formatTime } from './range.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const yq = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const mdLinkText = (s) => String(s).replace(/([\[\]])/g, '\\$1');

/** The YouTube link at a time (seconds), or null. */
export function youtubeAt(meta, t = 0) {
  const id = meta?.source?.youtube_id;
  return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}${t > 0 ? `&t=${Math.floor(t)}s` : ''}` : null;
}

/** A paragraph's words as Markdown, with each quotation's words linked to its source. quotes: [{ para, i0, i1, url, cite }] */
/** A paragraph as INDEXED text: the shown words only, no markup. Quote, name and work links are NOT written inline (10-22:
 *  "](https://…" polluted keyword search, embeddings and snippets); they live in transcript.json, content_source_links and
 *  media_links, and the player renders them from there. */
export function paragraphMarkdown(p) {
  return p.words.filter((w) => !w.hide).map((w) => w.w).join(' ');
}

/** Any markdown link in a text → its words (snippets of transcripts ingested before 10-22). */
export const stripMdLinks = (t) => String(t ?? '').replace(/!?\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, '$1');

/** transcript.md: frontmatter (title, speaker as author, date, language, the media page as source) + chapters + paragraphs. */
export function transcriptMarkdown({ meta, paragraphs, quotes = [], links = [], chapters = [], headings = [] }) {
  const fm = [['title', meta.title], ['author', meta.speaker], ['language', meta.language || 'en'], ['date', meta.date], ['year', meta.year],
    ['collection', 'Media'], ['media_slug', meta.slug], ['media_kind', meta.has_video ? 'video' : 'audio'], ['duration', meta.duration_s ? formatTime(meta.duration_s) : null],
    ['source_url', `https://siftersearch.com/media/${meta.slug}`], ['youtube_url', youtubeAt(meta)], ['event', meta.event], ['place', meta.place],
    ['needs_segmentation', 'false'], ['sentence_markers', 'defer']]
    .filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${/^(needs_segmentation|sentence_markers|year)$/.test(k) ? v : yq(v)}`);
  const lines = ['---', ...fm, '---', '', `# ${meta.title}`, ''];
  if (meta.summary) lines.push(`*${String(meta.summary).replace(/\*/g, '')}*`, '');
  // the topic subheaders when there are any (finer, faithful), else the chapters: markdown headings, so search and the
  // section index see them (no {id/t0} attrs: a heading is not a moment in the recording)
  const hBy = new Map((headings || []).map((h) => [h.p, h]));
  const chs = hBy.size ? [] : [...chapters].sort((a, b) => a.t - b.t);
  let c = 0;
  for (const p of paragraphs) {
    if (hBy.has(p.n)) lines.push(`## ${hBy.get(p.n).text}`, '');
    while (c < chs.length && chs[c].t <= p.t0 + 0.5) { lines.push(`## ${chs[c].title}`, ''); c++; }
    lines.push(paragraphMarkdown(p), `{id="para_${p.n}" t0="${p.t0.toFixed(2)}" t1="${p.t1.toFixed(2)}" spk="${p.spk || ''}"}`, '');
  }
  return `${lines.join('\n').trim()}\n`;
}

// The Listening Room look (same tokens as the site's --radio-*): cream paper / walnut + amber, Gloock headings, Caslon
// text, Big Shoulders figures. Fonts load from the site's /fonts (same origin as this page when served via siftersearch.com).
const CSS = `@font-face{font-family:Gloock;src:url(/fonts/gloock-latin.woff2) format('woff2');font-display:swap}
@font-face{font-family:'Big Shoulders Display';font-weight:600 800;src:url(/fonts/big-shoulders-latin.woff2) format('woff2');font-display:swap}
@font-face{font-family:'Libre Caslon Text';src:url(/fonts/libre-caslon-normal-400-latin.woff2) format('woff2');font-display:swap}
@font-face{font-family:'Libre Caslon Text';font-style:italic;src:url(/fonts/libre-caslon-italic-400-latin.woff2) format('woff2');font-display:swap}
:root{--bg:#f6efe1;--paper:#fbf6ea;--fg:#2a1a0e;--muted:#6b4f36;--line:rgba(59,36,20,.16);--accent:#b45309;--brass:#9a7330;--wood:#3b2414;--on:#f8ecd4;--needle:#b42318;--hl:rgba(254,240,138,.6);--range:rgba(14,165,233,.08);--card:#fbf6ea;--quote:#b45309}
@media (prefers-color-scheme:dark){:root{--bg:#15100b;--paper:#1e1711;--fg:#f4e6cf;--muted:#c9b394;--line:rgba(244,230,207,.12);--accent:#ffb347;--brass:#d6ad5c;--wood:#120c07;--on:#f8ecd4;--needle:#ff5a3c;--hl:rgba(253,224,71,.22);--range:rgba(56,189,248,.1);--card:#1e1711;--quote:#ffb347}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:18px/1.8 'Libre Caslon Text',Georgia,serif}
header{max-width:46rem;margin:1rem auto 0;padding:1.6rem 1.4rem 1.4rem;background:var(--wood);color:var(--on);border-radius:1.2rem;box-shadow:inset 0 0 0 1px rgba(214,173,92,.45)}
header::before{content:'● THE LISTENING ROOM';display:block;font:700 13px/1 'Big Shoulders Display',sans-serif;letter-spacing:.24em;color:#e3bd6e;margin-bottom:.8rem}
h1{font:400 2.1rem/1.08 Gloock,Georgia,serif;margin:.2rem 0 .5rem}
.meta{color:var(--on);opacity:.8;font:14px/1.5 system-ui,sans-serif}.meta a{color:#ffb347}
.src{display:inline-block;margin-top:.7rem;font:600 14px system-ui,sans-serif;color:var(--on);text-decoration:underline;text-decoration-color:#e3bd6e;text-underline-offset:3px}
main{max-width:46rem;margin:0 auto;padding:1.5rem 1.4rem 8rem}.toc{font:15px/1.5 system-ui,sans-serif;margin:0 0 2rem;padding:.9rem 1.1rem;background:var(--paper);border-radius:12px;box-shadow:inset 0 0 0 1px var(--line)}.toc ol{margin:0;padding-left:1.2rem}.toc a{color:var(--fg);text-decoration:none}.toc a:hover{color:var(--accent)}
h2{font:400 1.6rem/1.2 Gloock,Georgia,serif;margin:2.6rem 0 .6rem;padding-top:1rem;border-top:1px solid var(--line)}
.p{position:relative;margin:0 0 1.15rem}.p .play{position:absolute;left:-2.8rem;top:.2rem;width:2.1rem;height:2.1rem;border-radius:50%;border:0;box-shadow:inset 0 0 0 1.5px var(--line);background:var(--paper);color:var(--accent);cursor:pointer;font-size:.8rem}
.p .play:hover,.p .play:focus{box-shadow:inset 0 0 0 2px var(--accent)}@media (max-width:52rem){.p .play{position:static;float:left;margin:.25rem .55rem 0 0}}
.spk{font:700 13px 'Big Shoulders Display',system-ui,sans-serif;color:var(--brass);text-transform:uppercase;letter-spacing:.16em;display:block}
.w{cursor:pointer;border-radius:3px}.w.on{background:var(--hl);box-shadow:0 0 0 2px var(--hl)}.w.rg{background:var(--range)}
a.q{color:inherit;text-decoration:underline dotted var(--quote);text-decoration-thickness:2px;text-underline-offset:5px}a.ln{color:inherit;text-decoration:underline;text-decoration-color:var(--brass);text-underline-offset:5px}a.ln:hover,a.q:hover{color:var(--accent)}
.cr{margin:1.2rem 0 1.5rem;padding:1rem 1.2rem;background:var(--paper);border-radius:12px;box-shadow:inset 4px 0 0 var(--accent),inset 0 0 0 1px var(--line);font-size:1rem;font-style:italic}
.cr .k{display:block;font:700 12px 'Big Shoulders Display',system-ui,sans-serif;font-style:normal;color:var(--muted);text-transform:uppercase;letter-spacing:.2em;margin-bottom:.3rem}.cr cite{display:block;font:600 13px system-ui,sans-serif;font-style:normal;color:var(--muted);margin-top:.5rem}.cr a{color:var(--fg);text-decoration:underline;text-decoration-color:var(--accent);text-decoration-thickness:2px}.cr a:hover{color:var(--accent)}
.fab{position:fixed;left:1rem;bottom:1rem;display:flex;gap:.5rem;align-items:center;font:700 16px 'Big Shoulders Display',system-ui,sans-serif;letter-spacing:.06em}
.fab button{border:0;border-radius:999px;background:var(--accent);color:var(--wood);height:3.3rem;min-width:3.3rem;padding:0 1.1rem;font:inherit;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.3)}
.fab .follow{background:var(--wood);color:var(--accent);height:2.5rem;display:none}.fab .follow.show{display:inline-block}
.sel{position:absolute;display:none;z-index:5;font:600 13px system-ui,sans-serif;background:var(--wood);color:var(--on);border:0;border-radius:8px;padding:.45rem .7rem;cursor:pointer}
.note{color:var(--on);opacity:.75;font:14px system-ui,sans-serif;margin:.5rem 0}
a:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}`;

/** The player script (vanilla; the Svelte /media page follows the same rules). Reads window.MEDIA. */
const JS = `(()=>{const M=window.MEDIA,$=(s,r=document)=>r.querySelector(s);const audio=new Audio();audio.preload='none';
const words=[];document.querySelectorAll('.w').forEach(el=>words.push({el,s:+el.dataset.s,e:+el.dataset.e}));
const fmt=t=>{t=Math.max(0,Math.floor(t));const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return(h?h+':'+String(m).padStart(2,'0'):m)+':'+String(s).padStart(2,'0')};
const pt=v=>{v=String(v||'').trim();if(!v)return null;if(/^\\d+(\\.\\d+)?$/.test(v))return+v;if(/^\\d+(:\\d{1,2}){1,2}$/.test(v))return v.split(':').reduce((a,p)=>a*60+ +p,0);const m=v.match(/^(?:(\\d+)h)?(?:(\\d+)m)?(?:(\\d+)s)?$/);return m&&(m[1]||m[2]||m[3])?(+m[1]||0)*3600+(+m[2]||0)*60+(+m[3]||0):null};
const pr=v=>{v=String(v||'').replace(/^#?t=/,'');if(!v)return null;const[a,b]=v.split(/[-,]/);const s=pt(a);if(s==null)return null;const e=pt(b);return{start:s,end:e!=null&&e>s?e:null}};
const range=pr(new URLSearchParams(location.search).get('t'))||pr((location.hash.slice(1).split('&').find(x=>x.startsWith('t='))||''));
let base=0,stopAt=null,clip=null,follow=true,cur=-1,lastTop=null;const fabBtn=$('.fab .pp'),folBtn=$('.fab .follow');
function idxAt(t){let lo=0,hi=words.length-1,r=-1;while(lo<=hi){const m=(lo+hi)>>1;if(words[m].s<=t){r=m;lo=m+1}else hi=m-1}return r}
if(range){for(const w of words)if(w.s>=range.start-0.05&&(range.end==null||w.e<=range.end+0.05))w.el.classList.add('rg');const i=idxAt(range.start);if(i>=0)setTimeout(()=>words[i].el.scrollIntoView({block:'center'}),50)}
async function load(t,end){if(M.playback==='full'){if(!audio.src){audio.src=audio.canPlayType('audio/ogg; codecs="opus"')?M.audio:M.audio.replace(/\\.ogg$/,'.m4a')}base=0;stopAt=end??null;return t}
if(M.playback!=='clips'||!M.clipUrl)throw new Error('no playback');const e=Math.min(end??t+M.clipCap,t+M.clipCap);
const r=await fetch(M.clipUrl+'?t='+t.toFixed(1)+'-'+e.toFixed(1)+(audio.canPlayType('audio/ogg; codecs="opus"')?'':'&fmt=m4a'));if(!r.ok)throw new Error('clip refused');const j=await r.json();
audio.src=j.url;clip=j;base=j.start;stopAt=j.end;return j.start}
async function playFrom(t,end){try{const at=await load(t,end);const go=()=>{audio.currentTime=Math.max(0,t-base);audio.play()};
if(audio.readyState>=1)go();else audio.addEventListener('loadedmetadata',go,{once:true});audio.load&&audio.readyState<1&&audio.load();follow=true;folBtn.classList.remove('show')}catch(e){alert(M.playback==='search'?'This recording is not available for playback here.':'Playback is not available: '+e.message)}}
function toggle(){if(audio.paused){if(!audio.src||audio.ended)playFrom(range?range.start:(cur>=0?words[cur].s:0),range?range.end:null);else audio.play()}else audio.pause()}
fabBtn.onclick=toggle;folBtn.onclick=()=>{follow=true;folBtn.classList.remove('show');lastTop=null;tick(true)};
document.addEventListener('click',e=>{const w=e.target.closest('.w');if(w&&!e.target.closest('a.ln')&&!window.getSelection().toString()){e.preventDefault();playFrom(+w.dataset.s,null)}
const b=e.target.closest('.play');if(b)playFrom(+b.dataset.t,null)});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!/input|textarea|button/i.test(e.target.tagName)){e.preventDefault();toggle()}
if(/PageUp|PageDown|ArrowUp|ArrowDown|Home|End/.test(e.key))manual()});
function manual(){if(!audio.paused){follow=false;folBtn.classList.add('show')}}
addEventListener('wheel',manual,{passive:true});addEventListener('touchmove',manual,{passive:true});
function tick(force){const t=base+audio.currentTime;if(stopAt!=null&&t>=stopAt-0.02&&!audio.paused){audio.pause()}
const i=idxAt(t);if(i!==cur||force){if(cur>=0)words[cur].el.classList.remove('on');cur=i;if(i>=0){const el=words[i].el;el.classList.add('on');
if(follow){const top=el.getBoundingClientRect().top;if(lastTop==null||Math.abs(top-lastTop)>2||force){const anchor=innerHeight*0.38;scrollBy({top:top-anchor,behavior:'smooth'});lastTop=anchor}}}}
fabBtn.textContent=(audio.paused?'▶ ':'❚❚ ')+fmt(t);if(!audio.paused)requestAnimationFrame(()=>tick())}
audio.addEventListener('play',()=>{tick();if('mediaSession'in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:M.title,artist:M.speaker||'',album:'SifterSearch',artwork:M.thumb?[{src:M.thumb}]:[]})}});
audio.addEventListener('pause',()=>tick(false));
if('mediaSession'in navigator){navigator.mediaSession.setActionHandler('play',()=>audio.play());navigator.mediaSession.setActionHandler('pause',()=>audio.pause());
navigator.mediaSession.setActionHandler('seekbackward',()=>playFrom(Math.max(0,base+audio.currentTime-15)));navigator.mediaSession.setActionHandler('seekforward',()=>playFrom(base+audio.currentTime+15))}
const sel=$('.sel');document.addEventListener('selectionchange',()=>{const s=window.getSelection();if(!s||s.isCollapsed){sel.style.display='none';return}
const a=s.anchorNode&&s.anchorNode.parentElement&&s.anchorNode.parentElement.closest('.w'),b=s.focusNode&&s.focusNode.parentElement&&s.focusNode.parentElement.closest('.w');if(!a||!b){sel.style.display='none';return}
const t0=Math.min(+a.dataset.s,+b.dataset.s),t1=Math.max(+a.dataset.e,+b.dataset.e);const r=s.getRangeAt(0).getBoundingClientRect();
sel.style.display='block';sel.style.left=(r.left+scrollX)+'px';sel.style.top=(r.bottom+scrollY+6)+'px';
sel.onclick=()=>{const u=new URL(M.pageUrl||location.href);u.search='?t='+t0.toFixed(1)+'-'+t1.toFixed(1);u.hash='';navigator.clipboard&&navigator.clipboard.writeText(u.toString());sel.textContent='Link copied';setTimeout(()=>{sel.textContent='Copy link to this passage'},1500)}});
tick(true)})();`;

/** The standalone page. data: { meta, paragraphs, quotes, crs, chapters, speakers, audio, clipUrl, pageUrl, thumb } */
export function pageHtml({ meta, paragraphs, quotes = [], links = [], crs = [], chapters = [], headings = [], speakers = {}, audio = null, clipUrl = null, pageUrl = null, thumb = null }) {
  const yt = youtubeAt(meta);
  // quote spans and name/work links on the spoken words (a quote wins where they overlap)
  const crBy = new Map();
  for (const c of crs) { if (!crBy.has(c.para)) crBy.set(c.para, []); crBy.get(c.para).push(c); }
  const hBy = new Map((headings || []).map((h) => [h.p, h]));
  const chs = hBy.size ? [] : [...chapters].sort((a, b) => a.t - b.t);
  let c = 0, lastSpk = null;
  const body = [];
  for (const p of paragraphs) {
    if (hBy.has(p.n)) body.push(`<h2 id="${esc(hBy.get(p.n).slug)}">${esc(hBy.get(p.n).text)}</h2>`);
    while (c < chs.length && chs[c].t <= p.t0 + 0.5) { body.push(`<h2 id="ch-${c + 1}">${esc(chs[c].title)}</h2>`); c++; }
    const qs = spansOf(p.n, quotes, links);
    const html = [];
    let qi = 0;
    for (let i = 0; i < p.words.length; i++) {
      const q = qs[qi];
      if (q && i === q.i0) html.push(q.kind === 'quote' ? `<a class="q" href="${esc(q.url)}" title="${esc(q.cite || 'Source')}" target="_blank" rel="noopener">`
        : `<a class="ln" href="${esc(q.url.startsWith('/') ? `https://siftersearch.com${q.url}` : q.url)}" title="${esc(q.kind === 'person' ? q.name : [q.title, q.section].filter(Boolean).join(', '))}"${q.kind === 'work' ? ' target="_blank" rel="noopener"' : ''}>`);
      const w = p.words[i];
      // a word the copy-edit pass dropped (a filler, a stutter) stays in the page for timing, never shown
      html.push(w.hide ? `<span class="w x" data-s="${w.s.toFixed(2)}" data-e="${w.e.toFixed(2)}" hidden></span>` : `<span class="w" data-s="${w.s.toFixed(2)}" data-e="${w.e.toFixed(2)}">${esc(w.w)}</span>`);
      if (q && i === q.i1 - 1) { html.push('</a>'); qi++; }
    }
    const name = speakers[p.spk] || null;
    const spk = name && name !== lastSpk && Object.keys(speakers).length > 1 ? `<span class="spk">${esc(name)}</span>` : '';
    lastSpk = name;
    body.push(`<p class="p" id="p${p.n}"><button class="play" data-t="${p.t0.toFixed(2)}" aria-label="Play from ${formatTime(p.t0)}">▶</button>${spk}${html.join(' ')}</p>`);
    for (const cr of crBy.get(p.n) || []) {
      body.push(`<aside class="cr"><span class="k">${cr.kind === 'concept' ? 'Cross-reference' : 'Quoted'}</span><div>“${esc(cr.excerpt)}”</div><cite>— ${cr.url ? `<a href="${esc(cr.url)}" target="_blank" rel="noopener">${esc(cr.cite || 'the source passage')}</a>` : esc(cr.cite || '')}</cite></aside>`);
    }
  }
  const toc = hBy.size ? `<nav class="toc" aria-label="Contents"><ol>${[...hBy.values()].map((h) => `<li><a href="#${esc(h.slug)}">${esc(h.text)}</a></li>`).join('')}</ol></nav>` : '';
  const data = { title: meta.title, speaker: meta.speaker, playback: meta.rights?.playback || 'clips', audio, clipUrl, clipCap: 180, pageUrl, thumb };
  const when = [meta.speaker, meta.event, meta.place, meta.date || meta.year, meta.duration_s ? formatTime(meta.duration_s) : null].filter(Boolean).map(esc).join(' · ');
  const note = data.playback === 'clips' ? '<p class="note">Play any paragraph (up to three minutes at a time).</p>' : data.playback === 'search' ? '<p class="note">The recording is not available for playback here.</p>' : '';
  return `<!doctype html><html lang="${esc(meta.language || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(meta.title)}${meta.speaker ? ` — ${esc(meta.speaker)}` : ''}</title><meta name="description" content="${esc(meta.summary || '')}"><style>${CSS}</style></head><body>
<header><h1>${esc(meta.title)}</h1><div class="meta">${when}</div>${yt ? `<a class="src" href="${esc(yt)}" target="_blank" rel="noopener">Source: ${esc(meta.source?.channel || 'YouTube')} on YouTube — watch the full talk</a>` : ''}${note}</header>
<main>${toc}${body.join('\n')}</main><button class="sel">Copy link to this passage</button>
<div class="fab"><button class="follow" aria-label="Follow the audio">Follow</button><button class="pp" aria-label="Play or pause">▶ 0:00</button></div>
<script>window.MEDIA=${JSON.stringify(data).replace(/</g, '\\u003c')}</script><script>${JS}</script></body></html>`;
}
