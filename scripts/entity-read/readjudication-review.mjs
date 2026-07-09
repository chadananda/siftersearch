// RE-ADJUDICATION REVIEW page. Runs the proven pipeline (scene-partition → conservative split → evidence-gated
// routing → hallucination/misattribution flags) over the problem records and PROPOSES ops — it never auto-applies
// (the AI is too noisy op-by-op). You confirm/flip each on the page, Copy the confirmed ops, and a separate apply
// step executes them reversibly. Default set = the AI-confirmed conflations; or IDS=... Run ON tower-nas; write HTML.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const OUT = process.env.OUT || 'tmp/siftersearch-readjudication-review.html';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const HON = new Set('mirza haji hajji mulla siyyid sayyid aqa shaykh sheikh ustad karbilai hajj the of son brother uncle a an'.split(' '));
const sig = (s) => new Set(nrm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)));

const docParas = new Map(); const pidPos = new Map();
for (const doc of [21308, 21310]) { const ps = await queryAll(`SELECT external_para_id pid, heading, text FROM content WHERE doc_id=? AND deleted_at IS NULL AND external_para_id IS NOT NULL ORDER BY paragraph_index`, [doc]);
  const arr = ps.map((r) => ({ pid: r.pid, heading: r.heading || '', text: String(r.text).replace(/\s+/g, ' ').trim() })); docParas.set(doc, arr); arr.forEach((p, i) => pidPos.set(`${doc}|${p.pid}`, i)); }
const scene = (doc, pid) => { const arr = docParas.get(doc); const pos = pidPos.get(`${doc}|${pid}`); if (pos == null) return '(paragraph not found)';
  return arr.slice(Math.max(0, pos - 3), pos + 2).map((p) => `${p.pid === pid ? '»CITED« ' : ''}${p.text.slice(0, p.pid === pid ? 280 : 150)}`).join(' ‖ '); };

const SYS = `Repairing a database where bare-name matching fused several people under one record. Given the entity's claims (each with its SCENE = cited paragraph + neighbours; place/era/subject are often established earlier and not repeated), PARTITION the claims into the REAL distinct people. DEFAULT TO ONE PERSON — create a second only when a scene shows an INCOMPATIBLE LIFE (different death/fate, incompatible era, explicitly distinct individuals). Descriptive facets (uncle, guardian, merchant, martyr, host) are the SAME person; nisbas/places are SOFT (village vs province, governor of a province vs its city = one man). Judge by the WEIGHT of scene evidence, not the name. Also flag claims whose statement asserts a detail the scene CONTRADICTS or nowhere supports (hallucination) or whose scene is about a DIFFERENT person (misattributed).
Return ONLY JSON: {"people":[{"descriptor":"..","search_name":"..","claims":[idx]}],"drop":[{"claim":idx,"reason":"hallucination|misattributed","issue":".."}]}.`;
const MSYS = `A SUB-PERSON was split out of a conflated record. Given its descriptor+claims and CANDIDATE entities (name+sample claims), pick which candidate is the SAME person by EVIDENCE CONSISTENCY (era/role/nisba[soft]/associates/fate), NOT name similarity; a shared name is not enough. If none is evidently the same, answer "NEW". Return ONLY JSON: {"match": <id number or "NEW">, "reason":"<=12 words"}.`;
const claimText = async (eid, n = 3) => (await queryAll(`SELECT relation, statement FROM entity_claims WHERE entity_id=? AND import_batch IN ('gpb-v1','db-v1') LIMIT ?`, [eid, n])).map((c) => `(${c.relation}) ${String(c.statement).slice(0, 80)}`);
async function mapTarget(sub, subStmts, exclId) {
  const toks = [...sig(`${sub.search_name || ''} ${sub.descriptor || ''}`)]; if (!toks.length) return { id: 'NEW', cn: sub.search_name || sub.descriptor };
  const cands = new Map(); for (const t of toks.slice(0, 4)) for (const c of await queryAll(`SELECT id, canonical_name cn, importance imp FROM graph_entities WHERE entity_type='person' AND id<>? AND canonical_name LIKE ? LIMIT 15`, [exclId, `%${t}%`])) cands.set(c.id, c);
  const list = [...cands.values()].sort((a, b) => (b.imp || 0) - (a.imp || 0)).slice(0, 8); if (!list.length) return { id: 'NEW', cn: sub.search_name || sub.descriptor };
  const profiles = []; for (const c of list) profiles.push({ id: c.id, name: c.cn, claims: await claimText(c.id, 2) });
  try { const res = await chatCompletion([{ role: 'system', content: MSYS }, { role: 'user', content: `SUB: ${sub.descriptor}\nCLAIMS:\n${subStmts.join('\n')}\n\nCANDIDATES:\n${profiles.map((p) => `#${p.id} ${p.name}\n  ${p.claims.join('\n  ') || '(none)'}`).join('\n')}` }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 250, responseFormat: { type: 'json_object' } });
    const m = JSON.parse((res.content || '').match(/\{[\s\S]*\}/)[0]); if (m.match && String(m.match) !== 'NEW') { const h = list.find((c) => c.id === Number(m.match)); if (h) return { id: h.id, cn: h.cn, reason: m.reason }; } } catch { /* */ }
  return { id: 'NEW', cn: sub.search_name || sub.descriptor };
}

let ids = (process.env.IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (!ids.length) { try { const v = JSON.parse(readFileSync('tmp/siftersearch-sweep-verdicts.json', 'utf8')); ids = Object.entries(v).filter(([, x]) => x && x.nPeople > 1).map(([id]) => id); } catch { /* */ } }
if (!ids.length) { try { const v = JSON.parse(readFileSync('tmp/siftersearch-conflation-verdicts.json', 'utf8')); ids = Object.entries(v).filter(([, x]) => x && x.coherent === false && (x.n_people || 0) >= 2).map(([id]) => id); } catch { /* */ } }
console.error(`records to re-adjudicate: ${ids.length}`);
const ents = ids.length ? await queryAll(`SELECT id, canonical_name cn FROM graph_entities WHERE id IN (${ids.map(() => '?').join(',')})`, ids) : [];

const CACHE = 'tmp/siftersearch-readjudication-cache.json';
let records = [];
if (!process.env.FORCE && existsSync(CACHE)) { records = JSON.parse(readFileSync(CACHE, 'utf8')); console.error(`loaded ${records.length} cached records (FORCE=1 to re-adjudicate)`); }
else {
for (const e of ents) {
  const claims = await queryAll(`SELECT id, relation, statement, doc_id, para_id FROM entity_claims WHERE entity_id=? AND import_batch IN ('gpb-v1','db-v1') AND (status IS NULL OR status='supported') ORDER BY id`, [e.id]);
  if (claims.length < 2) continue;
  const body = claims.map((c, i) => `${i}. (${c.relation}) ${c.statement}\n   SCENE: ${scene(c.doc_id, c.para_id)}`).join('\n');
  let r; try { const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `ENTITY: ${e.cn}\nCLAIMS:\n${body}` }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 1700, responseFormat: { type: 'json_object' } }); r = JSON.parse((res.content || '').match(/\{[\s\S]*\}/)[0]); } catch { continue; }
  const dropSet = new Set((r.drop || []).map((d) => d.claim));
  const myTok = sig(e.cn); const people = (r.people || []).map((g) => ({ ...g, score: [...myTok].filter((t) => sig(`${g.descriptor} ${g.search_name || ''}`).has(t)).length })).sort((a, b) => b.score - a.score);
  const groups = [];
  for (let gi = 0; gi < people.length; gi++) { const g = people[gi]; const keep = gi === 0;
    const gClaims = (g.claims || []).map((ci) => claims[ci]).filter((c) => c && !dropSet.has((g.claims || []).indexOf((g.claims || [])[gi])) ); // keep only non-dropped
    const realClaims = (g.claims || []).filter((ci) => !dropSet.has(ci)).map((ci) => claims[ci]).filter(Boolean);
    let target = null; if (!keep) target = await mapTarget(g, realClaims.map((c) => `(${c.relation}) ${c.statement.slice(0, 90)}`), e.id);
    groups.push({ keep, descriptor: g.descriptor, target, claims: realClaims.map((c) => ({ id: c.id, relation: c.relation, statement: c.statement, scene: scene(c.doc_id, c.para_id) })) }); }
  const quarantines = (r.drop || []).map((d) => ({ ...claims[d.claim], reason: d.reason, issue: d.issue })).filter((q) => q.id);
  if (groups.length > 1 || quarantines.length) records.push({ id: e.id, cn: e.cn, nClaims: claims.length, groups, quarantines });
  console.error(`  [${e.id}] ${e.cn}: ${groups.length} people, ${quarantines.length} quarantine`);
}
writeFileSync(CACHE, JSON.stringify(records));
}

// source citation per claim — so each claim links to its exact paragraph (book + ¶) and can be verified
const claimSrc = new Map((await queryAll(`SELECT id, doc_id, para_id FROM entity_claims WHERE import_batch IN ('gpb-v1','db-v1')`)).map((c) => [c.id, c]));
const srcUrl = (id) => { const c = claimSrc.get(id); if (!c || !c.para_id) return null; const slug = c.doc_id === 21310 ? 'god-passes-by_shoghi-effendi' : c.doc_id === 21308 ? 'dawn-breakers_nabil' : null; return slug ? `https://oceanlibrary.com/${slug}?paraId=${c.para_id}` : null; };
const srcLabel = (id) => { const c = claimSrc.get(id); return c ? `${c.doc_id === 21310 ? 'GPB' : c.doc_id === 21308 ? 'DB' : 'doc' + c.doc_id} ${c.para_id || ''}`.trim() : ''; };
const srcTag = (id) => { const u = srcUrl(id); return u ? `<a class="src" href="${u}" target="_blank">${esc(srcLabel(id))} ¶</a>` : `<span class="src">${esc(srcLabel(id))}</span>`; };

const opRow = (rec) => {
  const groups = rec.groups.filter((g) => g.claims.length);   // never show an empty proposed person
  const nPeople = groups.length;
  const grp = (g, i) => `<div class="grp ${g.keep ? 'keep' : 'move'}" data-op="${g.keep ? 'keep' : 'move'}" data-rec="${rec.id}" data-gi="${i}" data-target="${g.target ? g.target.id : ''}">
     <div class="ghead">${g.keep ? '<span class="klbl">KEEP as-is</span>' : `<span class="tog"><button class="y">SPLIT ✓</button><button class="n">no</button></span><span class="mlbl">→ ${g.target && g.target.id !== 'NEW' ? `[${g.target.id}] ${esc(g.target.cn)}` : 'a NEW person'}</span>`} <b class="desc">${esc(g.descriptor)}</b> <span class="cn">· ${g.claims.length} claim${g.claims.length > 1 ? 's' : ''}</span></div>
     ${g.claims.map((c) => `<div class="ci" title="SCENE: ${esc(c.scene.slice(0, 380))}">[${c.id}] <span class="rel">${esc(c.relation)}</span> ${esc(String(c.statement).slice(0, 150))} ${srcTag(c.id)}</div>`).join('')}</div>`;
  return `<div class="rec"><div class="rh">[${rec.id}] <b>${esc(rec.cn)}</b> <span class="cn">— ${rec.nClaims} claims → ${nPeople} ${nPeople > 1 ? 'people' : 'person'}${rec.quarantines.length ? ` + ${rec.quarantines.length} to quarantine` : ''}</span></div>
   ${groups.map(grp).join('')}
   ${rec.quarantines.length ? `<div class="grp q"><div class="ghead"><span class="klbl q">QUARANTINE — wrong-scene / hallucinated claims</span></div>${rec.quarantines.map((q) => `<div class="ci qrow" data-op="quarantine" data-rec="${rec.id}" data-cid="${q.id}"><span class="tog"><button class="y">remove ✓</button><button class="n">keep</button></span> [${q.id}] <span class="rel">${esc(q.relation)}</span> ${esc(String(q.statement).slice(0, 120))} ${srcTag(q.id)} <span class="why">— ${esc(q.reason)}: ${esc(String(q.issue).slice(0, 90))}</span></div>`).join('')}</div>` : ''}
  </div>`;
};

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Re-adjudication (${records.length})</title><style>
 :root{--bg:#0b1220;--card:#111a2e;--line:#22304d;--ink:#e6edf7;--mut:#93a4c3;--sus:#ef4444;--var:#7bb35e}
 *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:13.5px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
 header{position:sticky;top:0;background:linear-gradient(#0b1220,rgba(11,18,32,.94));backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:1rem 1.5rem;z-index:6}
 h1{margin:0 0 .3rem;font-size:1.1rem}.lede{color:var(--mut);margin:0 0 .5rem;max-width:60rem}.tool{float:right}.tool #n{color:var(--var);font-weight:700}.tool button{background:#134e28;border:1px solid #1f7a3f;color:#dfffe9;border-radius:999px;padding:.35rem .85rem;cursor:pointer;font-weight:600}
 .rec{border:1px solid var(--line);border-radius:10px;margin:1rem 1.5rem;padding:.6rem .8rem;background:#0d1526}.rh{font-size:1rem;margin-bottom:.4rem;padding-bottom:.3rem;border-bottom:1px solid var(--line)}
 .grp{border-left:3px solid #33507e;padding:.4rem .7rem;margin:.5rem 0;border-radius:6px;background:#111a2e}.grp.keep{border-left-color:var(--var)}.grp.move{border-left-color:#f59e0b}.grp.q{border-left-color:var(--sus);background:#160f14}
 .ghead{margin-bottom:.3rem;font-size:.92rem}.desc{color:#dbe6f7}.cn{color:var(--mut);font-weight:400;font-size:.8rem}
 .klbl{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;background:rgba(34,197,94,.16);color:#4ade80;padding:.1rem .45rem;border-radius:5px;margin-right:.45rem}.klbl.q{background:rgba(239,68,68,.14);color:#f87171}
 .mlbl{color:#fbbf24;font-weight:700;margin:0 .45rem}
 .tog{display:inline-flex;margin-right:.5rem}.tog button{border:1px solid #33507e;background:#1a2745;color:#cdd9f0;padding:.18rem .55rem;cursor:pointer;font-weight:800;font-size:.74rem}.tog .y{border-radius:5px 0 0 5px}.tog .n{border-radius:0 5px 5px 0;border-left:none}
 .on-y .y{background:#15803d;border-color:#22c55e;color:#fff}.qrow.on-y .y{background:#b91c1c;border-color:#ef4444}.on-n .n{background:#475569;color:#fff}
 .ci{font-size:.84rem;padding:.18rem .45rem;margin:.12rem 0;border-left:2px solid #22304d}.ci:hover{background:#0e1830}.rel{color:#7dd3fc;font-size:.72rem;text-transform:uppercase;letter-spacing:.02em;margin-right:.25rem}
 .qrow{border-left-color:var(--sus)}.why{color:var(--mut);font-size:.78rem}
 .src{color:#8aa0c0;font-size:.72rem;text-decoration:none;margin-left:.35rem;white-space:nowrap}.src:hover{color:#7dd3fc;text-decoration:underline}
</style></head><body>
<header><h1>Claim re-adjudication — ${records.length} records proposed</h1>
<p class="lede">The pipeline read each claim <b>with its source scene</b> and proposes: <b style="color:#7bb35e">KEEP</b> the coherent group, <b style="color:#f59e0b">SPLIT OUT</b> other people (→ an existing entity or NEW), and <b style="color:#ef4444">QUARANTINE</b> hallucinated / mis-attributed claims. <b>Nothing is pre-selected.</b> Click <b>✓</b> ONLY on the ops you've verified — a good split, or a claim that really should be quarantined. <b>Copy ops exports only your ✓s</b> (leave the rest undecided). Do a few, Copy, paste back — repeat at your pace. I apply only what you confirmed, reversibly.</p>
<div class="tool"><span id="n">0</span> ops confirmed <button id="copy">Copy ops</button></div></header>
<div id="outwrap" style="display:none;padding:.6rem 1.5rem;background:#0d1526"><textarea id="out" readonly style="width:100%;height:8rem;background:#0b1220;color:#9ecbff;border:1px solid var(--line);border-radius:6px;font:12px ui-monospace,monospace;padding:.6rem"></textarea></div>
${records.map(opRow).join('\n')}
<script>
 const KEY='sifter-readj-v3';let dec=JSON.parse(localStorage.getItem(KEY)||'{}');const ops=[...document.querySelectorAll('.grp.move,.qrow')];
 const idOf=g=>g.classList.contains('qrow')?('q|'+g.dataset.cid):('m|'+g.dataset.rec+'|'+g.dataset.gi);
 const paint=g=>{const s=dec[idOf(g)];g.classList.toggle('on-y',s==='y');g.classList.toggle('on-n',s==='n');};
 const persist=()=>localStorage.setItem(KEY,JSON.stringify(dec));const countN=()=>document.getElementById('n').textContent=ops.filter(g=>dec[idOf(g)]==='y').length;
 ops.forEach(g=>{paint(g);   // DEFAULT OFF — nothing confirmed until you click; only ✓ is exported
   g.querySelector('.y').onclick=()=>{dec[idOf(g)]=dec[idOf(g)]==='y'?undefined:'y';if(!dec[idOf(g)])delete dec[idOf(g)];persist();paint(g);countN();};
   g.querySelector('.n').onclick=()=>{dec[idOf(g)]=dec[idOf(g)]==='n'?undefined:'n';if(!dec[idOf(g)])delete dec[idOf(g)];persist();paint(g);countN();};});
 countN();
 document.getElementById('copy').onclick=()=>{const out=ops.filter(g=>dec[idOf(g)]==='y').map(g=>g.dataset.op==='quarantine'?{op:'quarantine',claim:+g.dataset.cid}:{op:'move',from:+g.dataset.rec,gi:+g.dataset.gi,target:g.dataset.target||'NEW'});
   const ta=document.getElementById('out');document.getElementById('outwrap').style.display='block';ta.value=JSON.stringify(out);ta.select();try{navigator.clipboard.writeText(ta.value);}catch(e){}};
</script></body></html>`;
if (!existsSync('tmp')) mkdirSync('tmp', { recursive: true });
writeFileSync(OUT, html);
console.log(`wrote ${OUT} — ${records.length} records`);
process.exit(0);
