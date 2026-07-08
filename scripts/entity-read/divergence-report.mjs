// Emit a self-contained HTML review page for the alias STORE DIVERGENCE — surfaces present in er.aliases JSON but
// NOT in graph.db for that entity (the higher-risk set where the "Muṣṭafá" contamination lived). Each row is ranked
// by SUSPICION: a proper-name alias that shares no significant token with the entity (a possible different person) is
// flagged high; an epithet ("the …") or a token-sharing variant is likely legit. Read-only. Run ON tower-nas; pipe
// stdout to a local .html file to review:  ssh tower-nas '…divergence-report.mjs' > tmp/divergence-review.html
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync, existsSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const OUT = process.env.OUT || 'tmp/siftersearch-divergence-review.html';

const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const HON = new Set('mirza haji hajji mulla siyyid sayyid aqa shaykh sheikh ustad karbilai hajj the of a an son daughter known as one'.split(' '));
const sig = (s) => new Set(nrm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)));
const EPI = /^(the |a |an |known as )|(master|beloved|blessed|solace|consolation|forerunner|lieutenant|herald|leader|chief|governor|prince|king|queen|mother|father|wife|husband|uncle|dervish)/i;
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// load stores + entity context
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
  // identity token pool = canonical + all graph aliases + the entity's OTHER json aliases
  const pool = sig(r.cn); for (const a of (gListByEnt.get(r.entity_id) || [])) for (const t of sig(a)) pool.add(t);
  let summary = r.summary; if (!summary) { try { summary = (JSON.parse(r.rn || '{}').summary) || ''; } catch { /* */ } }
  for (const a of arr) {
    const n = nrm(a); if (!n || g.has(n)) continue;                       // only JSON-only aliases
    const toks = sig(a); const shares = [...toks].some((t) => pool.has(t));
    const isEpithet = EPI.test(a.trim()) || !toks.size;
    const level = shares ? 'variant' : (isEpithet ? 'epithet' : 'suspicious');   // no shared token + proper-name shape → suspicious
    rows.push({ entity_id: r.entity_id, cn: r.cn, alias: a, level, summary: (summary || '').slice(0, 240), gAliases: (gListByEnt.get(r.entity_id) || []).slice(0, 8) });
  }
}
const order = { suspicious: 0, epithet: 1, variant: 2 };
rows.sort((a, b) => order[a.level] - order[b.level] || a.cn.localeCompare(b.cn));
const counts = rows.reduce((m, r) => (m[r.level] = (m[r.level] || 0) + 1, m), {});

const rowHtml = (r) => `<tr class="lvl-${r.level}" data-level="${r.level}">
  <td class="badge ${r.level}">${r.level}</td>
  <td class="ent"><a href="https://siftersearch.com/biography#${r.entity_id}" target="_blank">${esc(r.cn)}</a><div class="eid">#${r.entity_id}</div></td>
  <td class="alias">${esc(r.alias)}</td>
  <td class="ctx"><div class="sum">${esc(r.summary)}</div><div class="ga">graph.db names: ${r.gAliases.map((x) => `<span>${esc(x)}</span>`).join(' · ') || '—'}</div></td>
</tr>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Alias divergence review (${rows.length})</title>
<style>
 :root{--sus:#b91c1c;--epi:#a16207;--var:#3f6212;--bg:#0b1220;--card:#111a2e;--line:#22304d;--ink:#e6edf7;--mut:#93a4c3}
 *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
 header{position:sticky;top:0;background:linear-gradient(#0b1220,rgba(11,18,32,.92));backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:1rem 1.5rem;z-index:5}
 h1{margin:0 0 .25rem;font-size:1.15rem} .lede{color:var(--mut);margin:0 0 .6rem;max-width:60rem}
 .filters button{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:.35rem .8rem;margin-right:.4rem;cursor:pointer;font-size:.85rem}
 .filters button.on{border-color:#3b82f6;color:#fff;background:#1e3a8a}
 table{border-collapse:collapse;width:100%} td{border-bottom:1px solid var(--line);padding:.6rem .8rem;vertical-align:top}
 .badge{text-transform:uppercase;font-size:.68rem;font-weight:700;letter-spacing:.04em;white-space:nowrap}
 .badge.suspicious{color:var(--sus)} .badge.epithet{color:var(--epi)} .badge.variant{color:var(--var)}
 tr.lvl-suspicious{background:rgba(185,28,28,.08)}
 .ent a{color:#7dd3fc;text-decoration:none;font-weight:600} .eid{color:var(--mut);font-size:.72rem}
 .alias{font-weight:600;font-size:1.02rem}
 .ctx{max-width:44rem} .sum{color:var(--ink)} .ga{color:var(--mut);font-size:.8rem;margin-top:.3rem} .ga span{color:#b8c6e0}
</style></head><body>
<header>
 <h1>Alias store divergence — ${rows.length} JSON-only aliases to review</h1>
 <p class="lede">Names in the entity-read <code>er.aliases</code> that are <b>absent</b> from the normalized <code>graph.db</code> store for that entity — the higher-risk set (where the "Muṣṭafá → Qurbán-‘Alí" contamination lived). <b>Suspicious</b> = a proper-name alias sharing no token with the entity (possible different person). <b>Epithet</b>/<b>variant</b> = likely legitimate (a descriptor or a token-sharing spelling variant).</p>
 <div class="filters">
  <button data-f="all" class="on">All (${rows.length})</button>
  <button data-f="suspicious">Suspicious (${counts.suspicious || 0})</button>
  <button data-f="epithet">Epithet (${counts.epithet || 0})</button>
  <button data-f="variant">Variant (${counts.variant || 0})</button>
 </div>
</header>
<table><tbody>
${rows.map(rowHtml).join('\n')}
</tbody></table>
<script>
 const btns=[...document.querySelectorAll('.filters button')], trs=[...document.querySelectorAll('tbody tr')];
 btns.forEach(b=>b.onclick=()=>{btns.forEach(x=>x.classList.remove('on'));b.classList.add('on');const f=b.dataset.f;
   trs.forEach(t=>t.style.display=(f==='all'||t.dataset.level===f)?'':'none');});
</script>
</body></html>`;
if (!existsSync('tmp')) mkdirSync('tmp', { recursive: true });
writeFileSync(OUT, html);
console.log(`wrote ${OUT} — ${rows.length} rows (suspicious ${counts.suspicious || 0}, epithet ${counts.epithet || 0}, variant ${counts.variant || 0})`);
process.exit(0);
