// A media item's two text renditions: transcript.md (clean Markdown for search ingestion — one block per paragraph with
// id="para_N" t0/t1/spk attributes, quotations as links on the speaker's own words) and page.html (standalone, no site
// chrome, self-contained: player + transcript + quotation links + cross-reference breakouts). Pure.
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
export function paragraphMarkdown(p, quotes = []) {
  const qs = quotes.filter((q) => q.para === p.n && q.url).sort((a, b) => a.i0 - b.i0);
  const out = [];
  let i = 0;
  for (const q of qs) {
    if (q.i0 < i) continue;
    while (i < q.i0) out.push(p.words[i++].w);
    out.push(`[${mdLinkText(p.words.slice(q.i0, q.i1).map((w) => w.w).join(' '))}](${q.url}${q.cite ? ` ${yq(q.cite)}` : ''})`);
    i = q.i1;
  }
  while (i < p.words.length) out.push(p.words[i++].w);
  return out.join(' ');
}

/** transcript.md: frontmatter (title, speaker as author, date, language, the media page as source) + chapters + paragraphs. */
export function transcriptMarkdown({ meta, paragraphs, quotes = [], chapters = [] }) {
  const fm = [['title', meta.title], ['author', meta.speaker], ['language', meta.language || 'en'], ['date', meta.date], ['year', meta.year],
    ['collection', 'Media'], ['media_slug', meta.slug], ['media_kind', meta.has_video ? 'video' : 'audio'], ['duration', meta.duration_s ? formatTime(meta.duration_s) : null],
    ['source_url', `https://siftersearch.com/media/${meta.slug}`], ['youtube_url', youtubeAt(meta)], ['event', meta.event], ['place', meta.place],
    ['needs_segmentation', 'false'], ['sentence_markers', 'defer']]
    .filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${/^(needs_segmentation|sentence_markers|year)$/.test(k) ? v : yq(v)}`);
  const lines = ['---', ...fm, '---', '', `# ${meta.title}`, ''];
  if (meta.summary) lines.push(`*${String(meta.summary).replace(/\*/g, '')}*`, '');
  const chs = [...chapters].sort((a, b) => a.t - b.t);
  let c = 0;
  for (const p of paragraphs) {
    while (c < chs.length && chs[c].t <= p.t0 + 0.5) { lines.push(`## ${chs[c].title}`, ''); c++; }
    lines.push(paragraphMarkdown(p, quotes), `{id="para_${p.n}" t0="${p.t0.toFixed(2)}" t1="${p.t1.toFixed(2)}" spk="${p.spk || ''}"}`, '');
  }
  return `${lines.join('\n').trim()}\n`;
}

const CSS = `:root{--bg:#fbfaf7;--fg:#1f1d1a;--muted:#6b665e;--line:#e6e1d8;--accent:#8a5a14;--hl:#fff4bf;--range:#f3ead6;--card:#f4f0e8;--quote:#2d5d8a}
@media (prefers-color-scheme:dark){:root{--bg:#141311;--fg:#e9e5dc;--muted:#a19a8d;--line:#2c2a26;--accent:#e0a94a;--hl:rgba(255,226,120,.16);--range:rgba(224,169,74,.12);--card:#1d1b18;--quote:#8fb8e0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:18px/1.7 Georgia,'Iowan Old Style',serif}
header{max-width:44rem;margin:0 auto;padding:1.5rem 1rem 0.5rem}h1{font-size:1.6rem;line-height:1.25;margin:.2rem 0}
.meta{color:var(--muted);font:14px/1.5 system-ui,sans-serif}.meta a{color:var(--accent)}
.src{display:inline-block;margin-top:.5rem;font:600 14px system-ui,sans-serif;color:var(--accent)}
main{max-width:44rem;margin:0 auto;padding:0 1rem 8rem}h2{font-size:1.15rem;margin:2rem 0 .5rem}
.p{position:relative;margin:0 0 1.1rem}.p .play{position:absolute;left:-2.4rem;top:.15rem;width:1.8rem;height:1.8rem;border-radius:50%;border:1px solid var(--line);background:var(--bg);color:var(--accent);cursor:pointer;font-size:.8rem;opacity:.55}
.p:hover .play,.p .play:focus{opacity:1}@media (max-width:52rem){.p .play{position:static;float:left;margin:.25rem .5rem 0 0}}
.spk{font:600 12px system-ui,sans-serif;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;display:block}
.w{cursor:pointer;border-radius:3px}.w.on{background:var(--hl);box-shadow:0 0 0 2px var(--hl)}.w.rg{background:var(--range)}
a.q{color:var(--quote);text-decoration:underline dotted;text-underline-offset:3px}
.cr{margin:.4rem 0 1.4rem 1rem;padding:.7rem 1rem;border-left:3px solid var(--accent);background:var(--card);font-size:.95rem;border-radius:0 6px 6px 0}
.cr .k{font:600 11px system-ui,sans-serif;color:var(--accent);text-transform:uppercase;letter-spacing:.06em}.cr cite{display:block;font:13px system-ui,sans-serif;color:var(--muted);margin-top:.3rem}.cr a{color:var(--accent)}
.fab{position:fixed;right:1rem;bottom:1rem;display:flex;gap:.5rem;align-items:center;font:600 14px system-ui,sans-serif}
.fab button{border:0;border-radius:999px;background:var(--accent);color:var(--bg);height:3.2rem;min-width:3.2rem;padding:0 1rem;font:inherit;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2)}
.fab .follow{background:var(--card);color:var(--fg);border:1px solid var(--line);height:2.4rem;display:none}.fab .follow.show{display:inline-block}
.sel{position:absolute;display:none;z-index:5;font:600 13px system-ui,sans-serif;background:var(--fg);color:var(--bg);border:0;border-radius:6px;padding:.35rem .6rem;cursor:pointer}
.note{color:var(--muted);font:14px system-ui,sans-serif;margin:.5rem 0}`;

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
async function load(t,end){if(M.playback==='full'){if(!audio.src){audio.src=M.audio}base=0;stopAt=end??null;return t}
if(M.playback!=='clips'||!M.clipUrl)throw new Error('no playback');const e=Math.min(end??t+M.clipCap,t+M.clipCap);
const r=await fetch(M.clipUrl+'?t='+t.toFixed(1)+'-'+e.toFixed(1));if(!r.ok)throw new Error('clip refused');const j=await r.json();
audio.src=j.url;clip=j;base=j.start;stopAt=j.end;return j.start}
async function playFrom(t,end){try{const at=await load(t,end);const go=()=>{audio.currentTime=Math.max(0,t-base);audio.play()};
if(audio.readyState>=1)go();else audio.addEventListener('loadedmetadata',go,{once:true});audio.load&&audio.readyState<1&&audio.load();follow=true;folBtn.classList.remove('show')}catch(e){alert(M.playback==='search'?'This recording is not available for playback here.':'Playback is not available: '+e.message)}}
function toggle(){if(audio.paused){if(!audio.src||audio.ended)playFrom(range?range.start:(cur>=0?words[cur].s:0),range?range.end:null);else audio.play()}else audio.pause()}
fabBtn.onclick=toggle;folBtn.onclick=()=>{follow=true;folBtn.classList.remove('show');lastTop=null;tick(true)};
document.addEventListener('click',e=>{const w=e.target.closest('.w');if(w&&!window.getSelection().toString()){e.preventDefault();playFrom(+w.dataset.s,null)}
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
export function pageHtml({ meta, paragraphs, quotes = [], crs = [], chapters = [], speakers = {}, audio = null, clipUrl = null, pageUrl = null, thumb = null }) {
  const yt = youtubeAt(meta);
  const qBy = new Map();
  for (const q of quotes.filter((x) => x.url)) { if (!qBy.has(q.para)) qBy.set(q.para, []); qBy.get(q.para).push(q); }
  const crBy = new Map();
  for (const c of crs) { if (!crBy.has(c.para)) crBy.set(c.para, []); crBy.get(c.para).push(c); }
  const chs = [...chapters].sort((a, b) => a.t - b.t);
  let c = 0, lastSpk = null;
  const body = [];
  for (const p of paragraphs) {
    while (c < chs.length && chs[c].t <= p.t0 + 0.5) { body.push(`<h2 id="ch-${c + 1}">${esc(chs[c].title)}</h2>`); c++; }
    const qs = (qBy.get(p.n) || []).sort((a, b) => a.i0 - b.i0);
    const html = [];
    let qi = 0;
    for (let i = 0; i < p.words.length; i++) {
      const q = qs[qi];
      if (q && i === q.i0) html.push(`<a class="q" href="${esc(q.url)}" title="${esc(q.cite || 'Source')}" target="_blank" rel="noopener">`);
      const w = p.words[i];
      html.push(`<span class="w" data-s="${w.s.toFixed(2)}" data-e="${w.e.toFixed(2)}">${esc(w.w)}</span>`);
      if (q && i === q.i1 - 1) { html.push('</a>'); qi++; }
    }
    const name = speakers[p.spk] || null;
    const spk = name && name !== lastSpk && Object.keys(speakers).length > 1 ? `<span class="spk">${esc(name)}</span>` : '';
    lastSpk = name;
    body.push(`<p class="p" id="p${p.n}"><button class="play" data-t="${p.t0.toFixed(2)}" aria-label="Play from ${formatTime(p.t0)}">▶</button>${spk}${html.join(' ')}</p>`);
    for (const cr of crBy.get(p.n) || []) {
      body.push(`<aside class="cr"><span class="k">${cr.kind === 'concept' ? 'Cross-reference' : 'Quoted'}</span><div>“${esc(cr.excerpt)}”</div><cite>${esc(cr.cite || '')}${cr.url ? ` · <a href="${esc(cr.url)}" target="_blank" rel="noopener">read in context</a>` : ''}</cite></aside>`);
    }
  }
  const data = { title: meta.title, speaker: meta.speaker, playback: meta.rights?.playback || 'clips', audio, clipUrl, clipCap: 180, pageUrl, thumb };
  const when = [meta.speaker, meta.event, meta.place, meta.date || meta.year, meta.duration_s ? formatTime(meta.duration_s) : null].filter(Boolean).map(esc).join(' · ');
  const note = data.playback === 'clips' ? '<p class="note">Play any paragraph (up to three minutes at a time).</p>' : data.playback === 'search' ? '<p class="note">The recording is not available for playback here.</p>' : '';
  return `<!doctype html><html lang="${esc(meta.language || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(meta.title)}${meta.speaker ? ` — ${esc(meta.speaker)}` : ''}</title><meta name="description" content="${esc(meta.summary || '')}"><style>${CSS}</style></head><body>
<header><h1>${esc(meta.title)}</h1><div class="meta">${when}</div>${yt ? `<a class="src" href="${esc(yt)}" target="_blank" rel="noopener">Source: ${esc(meta.source?.channel || 'YouTube')} on YouTube — watch the full talk</a>` : ''}${note}</header>
<main>${body.join('\n')}</main><button class="sel">Copy link to this passage</button>
<div class="fab"><button class="follow" aria-label="Follow the audio">Follow</button><button class="pp" aria-label="Play or pause">▶ 0:00</button></div>
<script>window.MEDIA=${JSON.stringify(data).replace(/</g, '\\u003c')}</script><script>${JS}</script></body></html>`;
}
