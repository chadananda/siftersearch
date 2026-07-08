// Emit a self-contained HTML review page for the alias STORE DIVERGENCE — surfaces present in er.aliases JSON but
// NOT in graph.db for that entity (the higher-risk set where the "Muṣṭafá" contamination lived). Each row is ranked
// by SUSPICION and has keep/remove buttons; "Copy removals" exports the decisions as JSON to paste back for quarantine.
// Read-only. Run ON tower-nas; the HTML is written to tmp/. Pull it local and open.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync, existsSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const OUT = process.env.OUT || 'tmp/siftersearch-divergence-review.html';

const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const HON = new Set('mirza haji hajji mulla siyyid sayyid aqa shaykh sheikh ustad karbilai hajj the of a an son daughter known as one'.split(' '));
const sig = (s) => new Set(nrm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)));
const EPI = /^(the |a |an |known as )|(master|beloved|blessed|solace|consolation|forerunner|lieutenant|herald|leader|chief|governor|prince|king|queen|mother|father|wife|husband|uncle|dervish)/i;
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const gRows = await graphQueryAll(`SELECT entity_id, surface FROM entity_aliases`);
const gByEnt = new Map(); for (const r of gRows) { if (!gByEnt.has(r.entity_id)) gByEnt.set(r.entity_id, new Set()); gByEnt.get(r.entity_id).add(nrm(r.surface)); }
const gListByEnt = new Map(); for (const r of gRows) { if (!gListByEnt.has(r.entity_id)) gListByEnt.set(r.entity_id, []); gListByEnt.get(r.entity_id).push(r.surface); }
const jRows = await queryAll(`SELECT ge.id entity_id, ge.canonical_name cn, er.summary, er.aliases al, er.research_notes rn
  FROM graph_entities ge JOIN entity_research er ON er.canonical_name = ge.canonical_name
  WHERE er.aliases IS NOT NULL AND er.aliases NOT IN ('','[]')`);

const rows = [];
for (const r of jRows) {
  let arr = []; try { arr = JSON.parse(r.al); } catch { continue; }
  const g = gByEnt.get(r.entity_id) || new Set();
  const pool = sig(r.cn); for (const a of (gListByEnt.get(r.entity_id) || [])) for (const t of sig(a)) pool.add(t);
  let summary = r.summary; if (!summary) { try { summary = (JSON.parse(r.rn || '{}').summary) || ''; } catch { /* */ } }
  for (const a of arr) {
    const n = nrm(a); if (!n || g.has(n)) continue;
    const toks = sig(a); const shares = [...toks].some((t) => pool.has(t));
    const isEpithet = EPI.test(a.trim()) || !toks.size;
    const level = shares ? 'variant' : (isEpithet ? 'epithet' : 'suspicious');
    rows.push({ entity_id: r.entity_id, cn: r.cn, alias: a, level, summary: (summary || '').slice(0, 260), gAliases: (gListByEnt.get(r.entity_id) || []).slice(0, 10) });
  }
}
const order = { suspicious: 0, epithet: 1, variant: 2 };
rows.sort((a, b) => order[a.level] - order[b.level] || a.cn.localeCompare(b.cn));
const counts = rows.reduce((m, r) => (m[r.level] = (m[r.level] || 0) + 1, m), {});

const rowHtml = (r) => `<tr class="lvl-${r.level}" data-level="${r.level}" data-eid="${r.entity_id}" data-alias="${esc(r.alias)}">
  <td class="decide"><button class="b-keep" title="legit — keep this alias">keep</button><button class="b-rm" title="wrong — remove this alias">remove</button></td>
  <td class="badge ${r.level}">${r.level}</td>
  <td class="ent"><a href="https://siftersearch.com/biography#${r.entity_id}" target="_blank">${esc(r.cn)}</a><div class="eid">#${r.entity_id}</div></td>
  <td class="alias">${esc(r.alias)}</td>
  <td class="ctx"><div class="sum">${esc(r.summary)}</div><div class="ga"><b>clean names already on this record:</b> ${r.gAliases.map((x) => `<span>${esc(x)}</span>`).join(' · ') || '—'}</div></td>
</tr>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Alias divergence review (${rows.length})</title>
<style>
 :root{--sus:#ef4444;--epi:#d1a10a;--var:#7bb35e;--bg:#0b1220;--card:#111a2e;--line:#22304d;--ink:#e6edf7;--mut:#93a4c3}
 *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
 header{position:sticky;top:0;background:linear-gradient(#0b1220,rgba(11,18,32,.94));backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:1rem 1.5rem;z-index:6}
 h1{margin:0 0 .3rem;font-size:1.15rem} .lede{color:var(--mut);margin:0 0 .7rem;max-width:64rem}
 .lede b{color:var(--ink)} code{background:#0e1830;padding:.05rem .35rem;border-radius:4px;color:#9ecbff}
 .bar{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
 .filters button,.tool button{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:.35rem .85rem;cursor:pointer;font-size:.85rem}
 .filters button.on{border-color:#3b82f6;color:#fff;background:#1e3a8a}
 .tool{margin-left:auto;display:flex;gap:.5rem;align-items:center} .tool #n{color:var(--sus);font-weight:700}
 .tool button.exp{background:#134e28;border-color:#1f7a3f;color:#dfffe9;font-weight:600}
 table{border-collapse:collapse;width:100%} th{position:sticky;top:0;text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);background:#0d1526;border-bottom:1px solid var(--line);padding:.5rem .8rem}
 td{border-bottom:1px solid var(--line);padding:.6rem .8rem;vertical-align:top}
 .decide{white-space:nowrap} .decide button{border:1px solid var(--line);background:var(--card);color:var(--mut);border-radius:6px;padding:.2rem .5rem;margin-right:.25rem;cursor:pointer;font-size:.75rem}
 tr.mark-keep{opacity:.45} tr.mark-keep .b-keep{background:#14532d;border-color:#22c55e;color:#dcfce7}
 tr.mark-rm{background:rgba(239,68,68,.14)} tr.mark-rm .b-rm{background:#7f1d1d;border-color:#ef4444;color:#fee2e2}
 .badge{text-transform:uppercase;font-size:.68rem;font-weight:700;letter-spacing:.04em;white-space:nowrap}
 .badge.suspicious{color:var(--sus)} .badge.epithet{color:var(--epi)} .badge.variant{color:var(--var)}
 tr.lvl-suspicious:not(.mark-keep):not(.mark-rm){background:rgba(239,68,68,.07)}
 .ent a{color:#7dd3fc;text-decoration:none;font-weight:600} .eid{color:var(--mut);font-size:.72rem}
 .alias{font-weight:700;font-size:1.05rem} .ctx{max-width:42rem} .sum{color:var(--ink)} .ga{color:var(--mut);font-size:.8rem;margin-top:.35rem} .ga span{color:#b8c6e0}
 #outwrap{display:none;padding:.75rem 1.5rem;background:#0d1526;border-bottom:1px solid var(--line)} #out{width:100%;height:8rem;background:#0b1220;color:#9ecbff;border:1px solid var(--line);border-radius:6px;font:12px/1.4 ui-monospace,Menlo,monospace;padding:.6rem}
</style></head><body>
<header>
 <h1>Alias divergence review — ${rows.length} names to confirm</h1>
 <p class="lede">Each row is one <b>Suspect alias</b> — a name currently attached to that <b>Entity</b> in the old <code>er.aliases</code> list but missing from the clean <code>graph.db</code> store. The one question per row: <b>does this name really refer to this entity?</b> If yes → <b>keep</b>. If it's actually a different person / a relative / a mistake (e.g. "Ḥujjat" filed under Ḥujjat's <i>father</i>) → <b>remove</b>. Only the <b>suspicious</b> set is likely to contain errors; epithets & variants are almost all legit. Mark the errors, then hit <b>Copy removals</b> and paste the result back to me.</p>
 <div class="bar">
  <div class="filters">
   <button data-f="all" class="on">All (${rows.length})</button>
   <button data-f="suspicious">Suspicious (${counts.suspicious || 0})</button>
   <button data-f="epithet">Epithet (${counts.epithet || 0})</button>
   <button data-f="variant">Variant (${counts.variant || 0})</button>
  </div>
  <div class="tool"><span><span id="n">0</span> marked remove</span><button class="exp" id="copy">Copy removals</button></div>
 </div>
</header>
<div id="outwrap"><textarea id="out" readonly></textarea></div>
<table>
 <thead><tr><th>Decision</th><th>Level</th><th>Entity (the record)</th><th>Suspect alias</th><th>Context — is the alias really THIS person?</th></tr></thead>
 <tbody>
${rows.map(rowHtml).join('\n')}
 </tbody>
</table>
<script>
 const KEY='sifter-div-decisions'; let dec=JSON.parse(localStorage.getItem(KEY)||'{}');
 const trs=[...document.querySelectorAll('tbody tr')];
 const idOf=t=>t.dataset.eid+'|'+t.dataset.alias;
 const paint=t=>{const s=dec[idOf(t)];t.classList.toggle('mark-keep',s==='keep');t.classList.toggle('mark-rm',s==='rm');};
 const countN=()=>document.getElementById('n').textContent=Object.values(dec).filter(v=>v==='rm').length;
 trs.forEach(t=>{paint(t);
   t.querySelector('.b-keep').onclick=()=>{dec[idOf(t)]=dec[idOf(t)]==='keep'?undefined:'keep';save(t);};
   t.querySelector('.b-rm').onclick=()=>{dec[idOf(t)]=dec[idOf(t)]==='rm'?undefined:'rm';save(t);};});
 function save(t){if(!dec[idOf(t)])delete dec[idOf(t)];localStorage.setItem(KEY,JSON.stringify(dec));paint(t);countN();}
 countN();
 const btns=[...document.querySelectorAll('.filters button')];
 btns.forEach(b=>b.onclick=()=>{btns.forEach(x=>x.classList.remove('on'));b.classList.add('on');const f=b.dataset.f;
   trs.forEach(t=>t.style.display=(f==='all'||t.dataset.level===f)?'':'none');});
 document.getElementById('copy').onclick=()=>{
   const out=trs.filter(t=>dec[idOf(t)]==='rm').map(t=>({entity_id:+t.dataset.eid,alias:t.dataset.alias}));
   const txt=JSON.stringify(out,null,0); const ta=document.getElementById('out');
   document.getElementById('outwrap').style.display='block'; ta.value=txt; ta.select();
   try{navigator.clipboard.writeText(txt);}catch(e){} };
</script>
</body></html>`;
if (!existsSync('tmp')) mkdirSync('tmp', { recursive: true });
writeFileSync(OUT, html);
console.log(`wrote ${OUT} — ${rows.length} rows (suspicious ${counts.suspicious || 0}, epithet ${counts.epithet || 0}, variant ${counts.variant || 0})`);
process.exit(0);
