// DUBIOUS MERGES — find person entities that share a name (canonical or alias) and are therefore candidate
// merges (same person under variant names) OR namesake collisions (same name, different people). Adjudicate each
// pair by EVIDENCE — the two records' summaries + their cited claims from entity_claims — via AI (same/different/
// uncertain, with the case for each side). Emit an HTML review page: A [SAME | DIFFERENT] B, evidence + claims side
// by side, "Copy merges" export. Read-only. Run ON tower-nas; write HTML to tmp/, pull local.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const OUT = process.env.OUT || 'tmp/siftersearch-merge-review.html';
const VERD = 'tmp/siftersearch-merge-verdicts.json';
const ADJ = process.env.ADJUDICATE === '1';

const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const HON = new Set('mirza haji hajji mulla siyyid sayyid aqa shaykh sheikh ustad karbilai hajj the of son daughter'.split(' '));
const sigN = (s) => [...new Set(nrm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)))];
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// persons + their name keys (canonical + aliases). Claims (top, by entity) for evidence.
const persons = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.side, er.summary, er.aliases
  FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person'`);
const claimRows = await queryAll(`SELECT entity_id, relation, statement FROM entity_claims WHERE import_batch IN ('gpb-v1','db-v1')`);
const claimsBy = new Map(); for (const c of claimRows) { if (!claimsBy.has(c.entity_id)) claimsBy.set(c.entity_id, []); const a = claimsBy.get(c.entity_id); if (a.length < 6) a.push(`(${c.relation}) ${c.statement}`); }
const P = new Map();
for (const p of persons) { let al = []; try { al = JSON.parse(p.aliases || '[]'); } catch { /* */ }
  const keys = new Set([nrm(p.cn), ...al.map(nrm)].filter((k) => k && k.length >= 4));
  P.set(p.id, { id: p.id, cn: p.cn, imp: p.imp || 0, side: p.side || '', summary: (p.summary || '').slice(0, 300), keys, claims: claimsBy.get(p.id) || [] }); }

// candidate pairs = two DISTINCT entities sharing a full normalized name (canonical or alias)
const byKey = new Map();
for (const e of P.values()) for (const k of e.keys) { if (!byKey.has(k)) byKey.set(k, new Set()); byKey.get(k).add(e.id); }
const pairSet = new Map();
for (const [k, ids] of byKey) { if (ids.size < 2 || ids.size > 10) continue;    // skip singletons + very common names (handled elsewhere)
  const arr = [...ids]; for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const a = Math.min(arr[i], arr[j]), b = Math.max(arr[i], arr[j]); const pk = `${a}|${b}`;
    if (!pairSet.has(pk)) pairSet.set(pk, { a, b, key: k }); } }
// require the pair to have at least one entity with claims (grounded) and skip if the shared key is a lone common given-name with no other overlap
let pairs = [...pairSet.values()].filter(({ a, b }) => (P.get(a).claims.length || P.get(b).claims.length));
pairs.sort((x, y) => (P.get(y.a).imp + P.get(y.b).imp) - (P.get(x.a).imp + P.get(x.b).imp));
console.log(`persons ${P.size} · shared-name candidate pairs ${pairs.length}`);

// AI adjudication
const SYS = `You decide whether two ENTITY RECORDS from a Bábí/Bahá'í history database are the SAME person (merge) or DIFFERENT people who merely share a name (keep separate). You get each record's canonical name, side, summary, cited claims, and PROMINENCE (importance + how many claims — a proxy for how well-known that bearer is), plus which record is the more prominent bearer.
Two kinds of POSITIVE evidence can justify "same":
1. CONNECTING evidence — shared specific events, shared kin/associates, a continuous life-arc, matching nisba+role+era, or an explicit identity statement.
2. COMMON-REFERENCE / FAMILIARITY evidence — a name or title used BARE, assuming familiarity, normally denotes the MOST COMMONLY KNOWN bearer (bare "Vaḥíd" → Siyyid Yaḥyá-i-Dárábí; bare "Navváb" → Ásíyih Khánum). So if one record is the clearly PROMINENT bearer and the other is a THIN record whose references carry NO distinguishing detail, the thin record is most likely an under-specified duplicate of the prominent one → "same". The absence of disambiguation is itself evidence for the default referent.
For the CENTRAL FIGURES and extremely prominent bearers (Bahá'u'lláh, the Báb, ‘Abdu'l-Bahá, Shoghi Effendi, and other household names), a bare mention is UNAMBIGUOUS — a thin same-named record merges into them with NO further evidence required (only an explicit distinguishing detail could block it). You never need extra proof that "Bahá'u'lláh" means Bahá'u'lláh.
BUT the bar for "same" is still POSITIVE evidence, not mere absence of contradiction between two SUBSTANTIAL records. And any EXPLICIT distinguishing detail in the lesser record — a different nisba, era, role, or fate — BLOCKS the familiarity inference and makes them "different" (a genuine namesake). A real contradiction ⇒ "different". Reserve "uncertain" only for genuinely balanced evidence. Use world knowledge for famous figures.
Return ONLY JSON: {"verdicts":[{"i":<index>,"relation":"same|different|uncertain","confidence":0-1,"for_same":"<=18 words: the connecting OR familiarity link, or 'none'","for_diff":"<=16 words","keep":"<which canonical to keep if same, else null>"}]}.`;
let verd = {}; try { verd = JSON.parse(readFileSync(VERD, 'utf8')); } catch { /* */ }
if (ADJ) {
  const todo = pairs.filter((p) => !(`${p.a}|${p.b}` in verd));
  console.error(`adjudicating ${todo.length} pairs (of ${pairs.length})…`);
  for (let b = 0; b < todo.length; b += 8) {
    const batch = todo.slice(b, b + 8);
    const prom = (e) => (e.claims.length * 2) + (e.imp || 0);
    const items = batch.map((p, i) => { const A = P.get(p.a), B = P.get(p.b); const pA = prom(A), pB = prom(B);
      const side = (e, pr) => ({ name: e.cn, side: e.side, importance: e.imp || 0, n_claims: e.claims.length, prominence: pr, summary: e.summary, claims: e.claims.slice(0, 5) });
      return { i, prominent: pA === pB ? 'equal' : (pA > pB ? 'A' : 'B'), A: side(A, pA), B: side(B, pB) }; });
    try { const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: JSON.stringify(items) }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 2000, responseFormat: { type: 'json_object' } });
      const pj = JSON.parse((res.content || '').match(/\{[\s\S]*\}/)[0]); for (const v of (pj.verdicts || [])) { const p = batch[v.i]; if (p) verd[`${p.a}|${p.b}`] = v; }
    } catch (e) { console.error(`  batch ${b} fail: ${String(e.message).slice(0, 50)}`); }
    writeFileSync(VERD, JSON.stringify(verd)); console.error(`  ${Math.min(b + 8, todo.length)}/${todo.length}`);
  }
}

// bucket + render — a verdict below the confidence bar becomes UNCERTAIN (human decides), never auto-applied
const CONF = Number(process.env.CONF || 0.8);
for (const p of pairs) { const v = verd[`${p.a}|${p.b}`]; p.rel = v ? v.relation : 'uncertain'; p.conf = v?.confidence ?? null; p.fs = v?.for_same; p.fd = v?.for_diff;
  p.eff = (p.rel !== 'uncertain' && p.conf != null && p.conf >= CONF) ? p.rel : 'uncertain'; }
const lvl = { same: 'ai-same', different: 'ai-diff', uncertain: 'uncertain' };
const cnt = pairs.reduce((m, p) => (m[p.eff] = (m[p.eff] || 0) + 1, m), {});
const claimList = (id) => { const c = P.get(id).claims; return c.length ? c.slice(0, 5).map((x) => `<div class="ci">${esc(x)}</div>`).join('') : '<div class="ci none">— no cited claims —</div>'; };
const row = (p) => { const A = P.get(p.a), B = P.get(p.b); const def = p.eff === 'same' ? 'merge' : p.eff === 'different' ? 'keep' : '';
  const badge = p.eff === 'same' ? 'AI: same → merge' : p.eff === 'different' ? 'AI: different → keep' : `? uncertain — YOUR CALL${p.conf != null ? ` (AI conf ${p.conf}${p.rel !== 'uncertain' ? `, leaned ${p.rel}` : ''})` : ''}`;
  return `<tr data-a="${p.a}" data-b="${p.b}" data-level="${lvl[p.eff]}"${def ? ` data-default="${def}"` : ''}>
   <td class="pair">
     <div class="names"><span class="ent">${esc(A.cn)}<span class="eid">#${A.id} · ${esc(A.side)}</span></span>
       <span class="tog"><button class="t-same" title="same person — MERGE">MERGE</button><button class="t-diff" title="different people — keep separate">KEEP&nbsp;SEPARATE</button></span>
       <span class="ent">${esc(B.cn)}<span class="eid">#${B.id} · ${esc(B.side)}</span></span></div>
     <div class="tags"><span class="badge ${lvl[p.eff]}">${badge}</span></div>
   </td>
   <td class="ev">
     ${p.fs ? `<div class="ev-is"><span class="lbl is">SAME — because</span>${esc(p.fs)}</div>` : ''}
     ${p.fd ? `<div class="ev-isnt"><span class="lbl isnt">DIFFERENT — because</span>${esc(p.fd)}</div>` : ''}
     <div class="cols"><div class="col"><b>${esc(A.cn)}</b><div class="sum">${esc(A.summary)}</div>${claimList(A.id)}</div>
       <div class="col"><b>${esc(B.cn)}</b><div class="sum">${esc(B.summary)}</div>${claimList(B.id)}</div></div>
   </td></tr>`; };
const order = { uncertain: 0, 'ai-same': 1, 'ai-diff': 2 };
pairs.sort((x, y) => (order[lvl[x.eff]] - order[lvl[y.eff]]) || ((P.get(y.a).imp + P.get(y.b).imp) - (P.get(x.a).imp + P.get(x.b).imp)));
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Dubious merges (${pairs.length})</title><style>
 :root{--bg:#0b1220;--card:#111a2e;--line:#22304d;--ink:#e6edf7;--mut:#93a4c3;--sus:#ef4444;--var:#7bb35e}
 *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
 header{position:sticky;top:0;background:linear-gradient(#0b1220,rgba(11,18,32,.94));backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:1rem 1.5rem;z-index:6}
 h1{margin:0 0 .3rem;font-size:1.15rem}.lede{color:var(--mut);margin:0 0 .7rem;max-width:64rem}
 .filters button,.tool button{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:.35rem .85rem;margin-right:.4rem;cursor:pointer;font-size:.85rem}.filters button.on{border-color:#3b82f6;background:#1e3a8a;color:#fff}
 .tool{float:right}.tool #n{color:var(--var);font-weight:700}.tool button.exp{background:#134e28;border-color:#1f7a3f;color:#dfffe9;font-weight:600}
 table{border-collapse:collapse;width:100%}th{text-align:left;font-size:.72rem;text-transform:uppercase;color:var(--mut);background:#0d1526;border-bottom:1px solid var(--line);padding:.5rem .8rem}
 td{border-bottom:1px solid var(--line);padding:.7rem .8rem;vertical-align:top}.pair{min-width:24rem}
 .names{display:flex;align-items:center;flex-wrap:wrap;gap:.4rem}.ent{font-weight:700}.eid{color:var(--mut);font-size:.72rem;font-weight:400;margin-left:.3rem}
 .tog{display:inline-flex;box-shadow:0 1px 3px rgba(0,0,0,.4)}.tog button{border:1px solid #33507e;background:#1a2745;color:#cdd9f0;padding:.35rem .7rem;cursor:pointer;font-weight:800;font-size:.78rem}
 .tog .t-same{border-radius:7px 0 0 7px}.tog .t-diff{border-radius:0 7px 7px 0;border-left:none}
 tr.mark-merge .t-same{background:#15803d;border-color:#22c55e;color:#fff}tr.mark-merge{background:rgba(34,197,94,.06)}
 tr.mark-keep .t-diff{background:#3730a3;border-color:#6366f1;color:#fff}
 .tags{margin-top:.35rem}.badge{font-size:.7rem;font-weight:700;padding:.1rem .45rem;border-radius:5px;border:1px solid var(--line)}.badge.ai-same{color:var(--var)}.badge.ai-diff{color:#818cf8}.badge.uncertain{color:#f59e0b}
 tr.lvl-uncertain:not(.mark-merge):not(.mark-keep){background:rgba(245,158,11,.08)}
 .ev-is,.ev-isnt{margin-bottom:.3rem}.lbl{font-size:.66rem;font-weight:800;text-transform:uppercase;padding:.08rem .4rem;border-radius:4px;margin-right:.45rem}.lbl.is{background:rgba(34,197,94,.16);color:#4ade80}.lbl.isnt{background:rgba(129,140,248,.16);color:#a5b4fc}
 .cols{display:flex;gap:1rem;margin-top:.4rem}.col{flex:1;min-width:0;background:#0d1526;border:1px solid var(--line);border-radius:8px;padding:.5rem .7rem}.col>b{color:#7dd3fc}
 .sum{color:var(--mut);font-size:.82rem;margin:.25rem 0 .4rem}.ci{font-size:.8rem;border-left:2px solid #33507e;padding:.1rem .5rem;margin:.15rem 0}.ci.none{color:var(--mut);border-color:var(--sus)}
</style></head><body>
<header><h1>Dubious merges — ${pairs.length} same-name pairs · <b>${cnt.uncertain || 0}</b> need your call</h1>
<p class="lede">Two records that share a name. <b>MERGE</b> = same person under variant names → combine · <b>KEEP SEPARATE</b> = a namesake. The <b>uncertain</b> tab (default) is where the AI's confidence was below ${CONF} — <b>those are yours to decide</b> (nothing pre-marked). The <b>AI: merge</b> / <b>AI: keep</b> tabs are its high-confidence calls — skim to spot-check, flip any wrong. Each pair shows both records' cited claims so you can verify the link (shared events/kin/arc) or the familiarity default (a bare name defaults to the prominent bearer). When done, <b>Copy merges</b> → paste back.</p>
<div class="bar"><span class="filters">
 <button data-f="uncertain" class="on">❓ your call (${cnt.uncertain || 0})</button>
 <button data-f="ai-same">AI: merge (${cnt.same || 0})</button>
 <button data-f="ai-diff">AI: keep separate (${cnt.different || 0})</button>
 <button data-f="all">all (${pairs.length})</button>
</span><span class="tool"><span id="n">0</span> marked merge <button class="exp" id="copy">Copy merges</button></span></div>
<div id="outwrap" style="display:none;padding:.6rem 1.5rem;background:#0d1526"><textarea id="out" readonly style="width:100%;height:7rem;background:#0b1220;color:#9ecbff;border:1px solid var(--line);border-radius:6px;font:12px ui-monospace,monospace;padding:.6rem"></textarea></div>
<table><thead><tr><th>Same person? MERGE / KEEP SEPARATE</th><th>Evidence + each record's cited claims</th></tr></thead><tbody>
${pairs.map(row).join('\n')}
</tbody></table>
<script>
 const KEY='sifter-merge-v1';let dec=JSON.parse(localStorage.getItem(KEY)||'{}');const trs=[...document.querySelectorAll('tbody tr')];
 const idOf=t=>t.dataset.a+'|'+t.dataset.b;const paint=t=>{const s=dec[idOf(t)];t.classList.toggle('mark-merge',s==='merge');t.classList.toggle('mark-keep',s==='keep');};
 const persist=()=>localStorage.setItem(KEY,JSON.stringify(dec));const countN=()=>document.getElementById('n').textContent=trs.filter(t=>dec[idOf(t)]==='merge').length;
 trs.forEach(t=>{if(!(idOf(t) in dec)&&t.dataset.default)dec[idOf(t)]=t.dataset.default;paint(t);
   t.querySelector('.t-same').onclick=()=>{dec[idOf(t)]='merge';persist();paint(t);countN();};
   t.querySelector('.t-diff').onclick=()=>{dec[idOf(t)]='keep';persist();paint(t);countN();};});
 persist();countN();
 const btns=[...document.querySelectorAll('.filters button')];const applyF=f=>trs.forEach(t=>t.style.display=(f==='all'||t.dataset.level===f)?'':'none');
 btns.forEach(b=>b.onclick=()=>{btns.forEach(x=>x.classList.remove('on'));b.classList.add('on');applyF(b.dataset.f);});applyF('uncertain');
 document.getElementById('copy').onclick=()=>{const out=trs.filter(t=>dec[idOf(t)]==='merge').map(t=>({merge:[+t.dataset.a,+t.dataset.b]}));const ta=document.getElementById('out');document.getElementById('outwrap').style.display='block';ta.value=JSON.stringify(out);ta.select();try{navigator.clipboard.writeText(ta.value);}catch(e){}};
</script></body></html>`;
if (!existsSync('tmp')) mkdirSync('tmp', { recursive: true });
writeFileSync(OUT, html);
console.log(`wrote ${OUT} — ${pairs.length} pairs | merge ${cnt.same || 0} · keep ${cnt.different || 0} · uncertain ${cnt.uncertain || 0}`);
process.exit(0);
