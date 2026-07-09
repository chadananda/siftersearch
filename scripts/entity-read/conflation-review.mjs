// CONFLATION review — one entity that bare-name matching fused from multiple people (the inverse of merge). Two-stage:
//   (1) cheap RECALL prefilter: entities whose name-sources carry ≥2 distinct nisbas (conflation-scan logic);
//   (2) precise AI COHERENCE adjudication: read the entity's claims — do they describe ONE person or several? If
//       several, partition the claims into sub-people (by era/nisba/role/fate) and say which is the prominent one.
// Emits a review page: flagged conflations with the AI's proposed split + each sub-person's claims. Read-only.
// Run ON tower-nas; ADJUDICATE=1 to run the AI stage (cached). Write HTML to tmp/, pull local.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const OUT = process.env.OUT || 'tmp/siftersearch-conflation-review.html';
const VERD = 'tmp/siftersearch-conflation-verdicts.json';
const ADJ = process.env.ADJUDICATE === '1';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const stem = (s) => { let t = nrm(s); if (t.length > 4 && t.endsWith('i')) t = t.slice(0, -1); return t; };
const STOP = new Set('the his her their god akka akká bahaullah bab cause faith lord one glory guidance gold power'.split(' '));
const nisbasOf = (t) => { const o = new Set(); for (const m of String(t).matchAll(/-i-([A-Za-zÀ-ÿ’']{4,})/g)) o.add(stem(m[1])); for (const m of String(t).matchAll(/\bof ([A-ZÀ-Ý][A-Za-zÀ-ÿ’']{3,})/g)) o.add(stem(m[1])); return new Set([...o].filter((n) => n && n.length >= 4 && !STOP.has(n))); };
const rosterSubj = (s) => { const m = String(s).match(/^\s*(.{2,70}?)\s+[-–—―−]\s+\S/); return m ? m[1] : null; };

const rows = await queryAll(`SELECT ge.id, ge.canonical_name cn, er.aliases FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person'`);
const claimRows = await queryAll(`SELECT id, entity_id, relation, statement, para_id FROM entity_claims WHERE import_batch IN ('gpb-v1','db-v1')`);
const claimsBy = new Map(); for (const c of claimRows) { if (!claimsBy.has(c.entity_id)) claimsBy.set(c.entity_id, []); claimsBy.get(c.entity_id).push(c); }

// (1) recall prefilter
const flagged = [];
for (const r of rows) { let al = []; try { al = JSON.parse(r.aliases || '[]'); } catch { /* */ }
  const cs = claimsBy.get(r.id) || []; const nameTexts = [r.cn, ...al, ...cs.map((c) => rosterSubj(c.statement)).filter(Boolean)];
  const nis = new Set(); for (const t of nameTexts) for (const n of nisbasOf(t)) nis.add(n);
  if (nis.size >= 2 && cs.length >= 2) flagged.push({ id: r.id, cn: r.cn, claims: cs }); }
console.log(`prefiltered (≥2 name-nisbas, ≥2 claims): ${flagged.length}`);

// (2) AI coherence
const SYS = `You are given ONE entity record from a Bábí/Bahá'í history database — a canonical name and its cited claims (each numbered). Because bare-name matching can FUSE several different people who share a name into one record, decide: do these claims describe ONE coherent person, or MULTIPLE people conflated?
Judge by internal consistency — a single person has ONE era, ONE nisba/place of origin, a consistent role and a single death/fate. Contradictions prove conflation: e.g. a martyr at Fort Ṭabarsí (1849) cannot also be active at ‘Akká (post-1868); nisba Iṣfahán vs Mans̱hád are different men. Places merely visited or associates' origins are NOT contradictions — only the person's OWN origin/era/fate.
If conflated, PARTITION the claim numbers into sub-people and label each (name+nisba/role/era).
Return ONLY JSON: {"coherent":<bool>,"n_people":<int>,"groups":[{"label":"<name / nisba / role / era>","claims":[<numbers>]}],"note":"<=20 words"}.`;
let verd = {}; try { verd = JSON.parse(readFileSync(VERD, 'utf8')); } catch { /* */ }
if (ADJ) {
  const todo = flagged.filter((f) => !(f.id in verd));
  console.error(`adjudicating ${todo.length} of ${flagged.length}…`);
  for (let b = 0; b < todo.length; b += 6) {
    const batch = todo.slice(b, b + 6);
    for (const f of batch) {
      const body = f.claims.map((c, i) => `${i}. (${c.relation}) ${String(c.statement).slice(0, 140)}`).join('\n');
      try { const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `ENTITY: ${f.cn}\nCLAIMS:\n${body}` }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 1200, responseFormat: { type: 'json_object' } });
        verd[f.id] = JSON.parse((res.content || '').match(/\{[\s\S]*\}/)[0]);
      } catch (e) { console.error(`  ${f.id} fail: ${String(e.message).slice(0, 40)}`); }
    }
    writeFileSync(VERD, JSON.stringify(verd)); console.error(`  ${Math.min(b + 6, todo.length)}/${todo.length}`);
  }
}

const conf = flagged.map((f) => ({ ...f, v: verd[f.id] })).filter((f) => f.v && f.v.coherent === false && (f.v.n_people || 0) >= 2);
conf.sort((a, b) => (b.v.n_people || 0) - (a.v.n_people || 0) || b.claims.length - a.claims.length);
console.log(`AI-confirmed CONFLATIONS: ${conf.length} (of ${flagged.length} prefiltered)`);

const row = (f) => { const groups = f.v.groups || []; const url = (c) => c.para_id ? `https://oceanlibrary.com/${c.para_id.startsWith('para_') || c.para_id.startsWith('fn_') ? 'dawn-breakers_nabil' : ''}?paraId=${c.para_id}` : null;
  return `<tr data-id="${f.id}" data-level="conflation" data-default="split">
  <td class="pair"><div class="names"><span class="ent">${esc(f.cn)}<span class="eid">#${f.id} · ${f.claims.length} claims → ${f.v.n_people} people</span></span>
    <span class="tog"><button class="t-split" title="really multiple people — SPLIT">SPLIT</button><button class="t-ok" title="actually one person — keep as is">KEEP AS ONE</button></span></div>
    <div class="tags"><span class="badge">AI: ${esc(f.v.note || 'conflation')}</span></div></td>
  <td class="ev">${groups.map((g) => `<div class="grp"><b>${esc(g.label)}</b>${(g.claims || []).map((ci) => { const c = f.claims[ci]; return c ? `<div class="ci">(${esc(c.relation)}) ${esc(String(c.statement).slice(0, 150))}${url(c) ? ` <a href="${esc(url(c))}" target="_blank">¶</a>` : ''}</div>` : ''; }).join('')}</div>`).join('')}</td></tr>`; };

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Conflations (${conf.length})</title><style>
 :root{--bg:#0b1220;--card:#111a2e;--line:#22304d;--ink:#e6edf7;--mut:#93a4c3;--sus:#ef4444}
 *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
 header{position:sticky;top:0;background:linear-gradient(#0b1220,rgba(11,18,32,.94));backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:1rem 1.5rem;z-index:6}
 h1{margin:0 0 .3rem;font-size:1.15rem}.lede{color:var(--mut);margin:0 0 .6rem;max-width:64rem}
 .tool{float:right}.tool #n{color:var(--sus);font-weight:700}.tool button{background:#5b1111;border:1px solid #7f1d1d;color:#fee2e2;border-radius:999px;padding:.35rem .85rem;cursor:pointer;font-weight:600}
 table{border-collapse:collapse;width:100%}td{border-bottom:1px solid var(--line);padding:.7rem .8rem;vertical-align:top}
 .pair{min-width:22rem}.names{display:flex;align-items:center;flex-wrap:wrap;gap:.4rem}.ent{font-weight:700}.eid{color:var(--mut);font-size:.72rem;font-weight:400;margin-left:.3rem}
 .tog{display:inline-flex;box-shadow:0 1px 3px rgba(0,0,0,.4)}.tog button{border:1px solid #33507e;background:#1a2745;color:#cdd9f0;padding:.35rem .7rem;cursor:pointer;font-weight:800;font-size:.78rem}.tog .t-split{border-radius:7px 0 0 7px}.tog .t-ok{border-radius:0 7px 7px 0;border-left:none}
 tr.mark-split .t-split{background:#b91c1c;border-color:#ef4444;color:#fff}tr.mark-split{background:rgba(239,68,68,.08)}tr.mark-ok .t-ok{background:#15803d;border-color:#22c55e;color:#fff}
 .tags{margin-top:.35rem}.badge{font-size:.72rem;color:#fca5a5}
 .grp{background:#0d1526;border:1px solid var(--line);border-left:3px solid var(--sus);border-radius:6px;padding:.4rem .6rem;margin:.3rem 0}.grp>b{color:#fca5a5}
 .ci{font-size:.8rem;padding:.1rem .4rem;margin:.15rem 0;border-left:2px solid #33507e}.ci a{color:#7dd3fc;text-decoration:none}
</style></head><body>
<header><h1>Conflations — ${conf.length} records the AI reads as MULTIPLE people</h1>
<p class="lede">Bare-name matching fused several people into one record. Each row shows the AI's proposed <b>split into sub-people</b> (by era / nisba / role / fate), with each sub-person's claims. <b>SPLIT</b> = yes, break this record apart (pre-marked). <b>KEEP AS ONE</b> = the AI is wrong, it's really one person. Confirm/flip, then <b>Copy splits</b>. (Applying a split = mint/keep one record per sub-person, re-attach each group's claims — some may re-attach to an EXISTING entity like "Riḍá'r-Rúḥ".)</p>
<div class="tool"><span id="n">0</span> to split <button id="copy">Copy splits</button></div></header>
<div id="outwrap" style="display:none;padding:.6rem 1.5rem;background:#0d1526"><textarea id="out" readonly style="width:100%;height:8rem;background:#0b1220;color:#9ecbff;border:1px solid var(--line);border-radius:6px;font:12px ui-monospace,monospace;padding:.6rem"></textarea></div>
<table><thead><tr><th>Record → split?</th><th>AI's proposed sub-people + their claims</th></tr></thead><tbody>
${conf.map(row).join('\n')}
</tbody></table>
<script>
 const KEY='sifter-conflation-v1';let dec=JSON.parse(localStorage.getItem(KEY)||'{}');const trs=[...document.querySelectorAll('tbody tr')];
 const paint=t=>{const s=dec[t.dataset.id];t.classList.toggle('mark-split',s==='split');t.classList.toggle('mark-ok',s==='ok');};
 const persist=()=>localStorage.setItem(KEY,JSON.stringify(dec));const countN=()=>document.getElementById('n').textContent=trs.filter(t=>dec[t.dataset.id]==='split').length;
 trs.forEach(t=>{if(!(t.dataset.id in dec)&&t.dataset.default)dec[t.dataset.id]=t.dataset.default;paint(t);
   t.querySelector('.t-split').onclick=()=>{dec[t.dataset.id]='split';persist();paint(t);countN();};
   t.querySelector('.t-ok').onclick=()=>{dec[t.dataset.id]='ok';persist();paint(t);countN();};});
 persist();countN();
 document.getElementById('copy').onclick=()=>{const out=trs.filter(t=>dec[t.dataset.id]==='split').map(t=>+t.dataset.id);const ta=document.getElementById('out');document.getElementById('outwrap').style.display='block';ta.value=JSON.stringify(out);ta.select();try{navigator.clipboard.writeText(ta.value);}catch(e){}};
</script></body></html>`;
if (!existsSync('tmp')) mkdirSync('tmp', { recursive: true });
writeFileSync(OUT, html);
console.log(`wrote ${OUT} — ${conf.length} conflations`);
process.exit(0);
