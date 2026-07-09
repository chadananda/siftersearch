// HALLUCINATION-CORRECTION review. Reads the sweep's hallucination flags (statement details CONTRADICTED by the cited
// scene — the "Tabríz→Ṭihrán" class), and for each has the AI state the value the SCENE actually establishes. Renders
// a small review page (claim, statement, wrong detail, scene-correct value, ¶ link, approve toggle default OFF). Does
// NOT auto-edit statements — the human approves. Read-only DB. Run ON tower-nas; write HTML.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const OUT = process.env.OUT || 'tmp/siftersearch-hallucination-review.html';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const docParas = new Map(); const pidPos = new Map();
for (const doc of [21308, 21310]) { const ps = await queryAll(`SELECT external_para_id pid, text FROM content WHERE doc_id=? AND deleted_at IS NULL AND external_para_id IS NOT NULL ORDER BY paragraph_index`, [doc]);
  const arr = ps.map((r) => ({ pid: r.pid, text: String(r.text).replace(/\s+/g, ' ').trim() })); docParas.set(doc, arr); arr.forEach((p, i) => pidPos.set(`${doc}|${p.pid}`, i)); }
const scene = (doc, pid) => { const arr = docParas.get(doc); const pos = pidPos.get(`${doc}|${pid}`); if (pos == null) return ''; return arr.slice(Math.max(0, pos - 3), pos + 2).map((p) => `${p.pid === pid ? '»CITED« ' : ''}${p.text.slice(0, p.pid === pid ? 320 : 200)}`).join(' ‖ '); };
const srcUrl = (doc, pid) => { const slug = doc === 21310 ? 'god-passes-by_shoghi-effendi' : doc === 21308 ? 'dawn-breakers_nabil' : null; return slug && pid ? `https://oceanlibrary.com/${slug}?paraId=${pid}` : null; };
const srcLabel = (doc, pid) => `${doc === 21310 ? 'GPB' : doc === 21308 ? 'DB' : 'doc' + doc} ${pid || ''}`.trim();

const sweep = JSON.parse(readFileSync('tmp/siftersearch-sweep-verdicts.json', 'utf8'));
const flags = [];
for (const [eid, v] of Object.entries(sweep)) for (const d of (v.drops || [])) if (/halluc/i.test(d.reason || '') && !d.auto) flags.push({ entity_id: +eid, cn: v.cn, claim_id: d.claim_id, issue: d.issue });
console.error(`hallucination flags: ${flags.length}`);
if (!flags.length) { console.log('no hallucination flags'); process.exit(0); }

const ids = flags.map((f) => f.claim_id);
const claims = new Map((await queryAll(`SELECT id, entity_id, relation, statement, doc_id, para_id FROM entity_claims WHERE id IN (${ids.map(() => '?').join(',')})`, ids)).map((c) => [c.id, c]));
const SYS = `Each item is a CLAIM whose statement asserts a detail (usually a PLACE, date, or fate) that its cited SCENE contradicts. State the CORRECT value the SCENE actually establishes for that detail. If the scene doesn't clearly establish a correct value, set correct to "unclear". Return ONLY JSON: {"items":[{"i":<index>,"wrong":"<the incorrect detail in the statement>","correct":"<value the scene establishes, or 'unclear'>","note":"<=14 words"}]}.`;
const items = flags.map((f, i) => { const c = claims.get(f.claim_id); return { i, statement: c ? c.statement : '', flagged: f.issue, scene: c ? scene(c.doc_id, c.para_id) : '' }; });
let verd = {};
for (let b = 0; b < items.length; b += 8) { const batch = items.slice(b, b + 8);
  try { const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: JSON.stringify(batch) }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 1400, responseFormat: { type: 'json_object' } });
    for (const v of (JSON.parse((res.content || '').match(/\{[\s\S]*\}/)[0]).items || [])) verd[v.i] = v; } catch (e) { console.error(`  batch ${b} fail ${e.message}`); }
  console.error(`  ${Math.min(b + 8, items.length)}/${items.length}`); }

const rows = flags.map((f, i) => { const c = claims.get(f.claim_id); const v = verd[i] || {}; const u = c ? srcUrl(c.doc_id, c.para_id) : null;
  return `<tr data-cid="${f.claim_id}" data-correct="${esc(v.correct || '')}"><td class="dec"><button class="y">fix ✓</button><button class="n">no</button></td>
   <td><div class="cn">${esc(f.cn)} <span class="eid">[claim ${f.claim_id}]</span> ${u ? `<a class="src" href="${u}" target="_blank">${esc(srcLabel(c.doc_id, c.para_id))} ¶</a>` : ''}</div>
   <div class="st">${esc(String(c ? c.statement : '').slice(0, 200))}</div>
   <div class="fix"><span class="wrong">${esc(v.wrong || '?')}</span> → <span class="right">${esc(v.correct || 'unclear')}</span> <span class="note">${esc(v.note || '')}</span></div>
   <div class="sc" title="${esc(c ? scene(c.doc_id, c.para_id) : '')}">scene ▸ hover</div></td></tr>`; }).join('\n');

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Hallucination corrections (${flags.length})</title><style>
 body{margin:0;background:#0b1220;color:#e6edf7;font:13.5px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
 header{position:sticky;top:0;background:#0b1220;border-bottom:1px solid #22304d;padding:1rem 1.5rem}h1{margin:0 0 .3rem;font-size:1.1rem}.lede{color:#93a4c3;max-width:60rem;margin:0}
 .tool{float:right}.tool #n{color:#7bb35e;font-weight:700}.tool button{background:#134e28;border:1px solid #1f7a3f;color:#dfffe9;border-radius:999px;padding:.35rem .85rem;cursor:pointer;font-weight:600}
 table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #22304d;padding:.6rem .8rem;vertical-align:top}
 .dec{white-space:nowrap}.dec button{border:1px solid #33507e;background:#1a2745;color:#cdd9f0;padding:.2rem .55rem;cursor:pointer;font-weight:800;font-size:.75rem}.dec .y{border-radius:5px 0 0 5px}.dec .n{border-radius:0 5px 5px 0;border-left:none}
 tr.on .y{background:#15803d;border-color:#22c55e;color:#fff}tr.no .n{background:#475569;color:#fff}
 .cn{font-weight:700}.eid{color:#93a4c3;font-weight:400;font-size:.78rem}.src{color:#8aa0c0;font-size:.72rem;text-decoration:none;margin-left:.3rem}.src:hover{color:#7dd3fc}
 .st{color:#cdd9f0;margin:.2rem 0;font-size:.86rem}.fix{margin:.15rem 0}.wrong{color:#f87171;text-decoration:line-through}.right{color:#4ade80;font-weight:700}.note{color:#93a4c3;font-size:.78rem;margin-left:.4rem}
 .sc{color:#7dd3fc;font-size:.75rem;cursor:help;margin-top:.15rem}</style></head><body>
<header><h1>Hallucination corrections — ${flags.length} claims with a detail contradicted by their source</h1>
<p class="lede">Each statement asserts a <span class="wrong">wrong</span> detail (place/date/fate) that the cited scene contradicts; the scene establishes the <span class="right">correct</span> value. <b>Nothing changes until you ✓.</b> Click <b>fix ✓</b> to approve the correction (leave "unclear" ones for manual review), then Copy — I'll apply the approved corrections reversibly. Hover "scene ▸" to read the source.</p>
<div class="tool"><span id="n">0</span> to fix <button id="copy">Copy corrections</button></div></header>
<table><tbody>${rows}</tbody></table>
<div id="outwrap" style="display:none;padding:.6rem 1.5rem;background:#0d1526"><textarea id="out" readonly style="width:100%;height:7rem;background:#0b1220;color:#9ecbff;border:1px solid #22304d;border-radius:6px;font:12px ui-monospace,monospace;padding:.6rem"></textarea></div>
<script>
 const KEY='sifter-halluc-v1';let dec=JSON.parse(localStorage.getItem(KEY)||'{}');const trs=[...document.querySelectorAll('tbody tr')];
 const paint=t=>{const s=dec[t.dataset.cid];t.classList.toggle('on',s==='y');t.classList.toggle('no',s==='n');};
 const persist=()=>localStorage.setItem(KEY,JSON.stringify(dec));const countN=()=>document.getElementById('n').textContent=trs.filter(t=>dec[t.dataset.cid]==='y').length;
 trs.forEach(t=>{paint(t);t.querySelector('.y').onclick=()=>{dec[t.dataset.cid]=dec[t.dataset.cid]==='y'?undefined:'y';if(!dec[t.dataset.cid])delete dec[t.dataset.cid];persist();paint(t);countN();};t.querySelector('.n').onclick=()=>{dec[t.dataset.cid]='n';persist();paint(t);countN();};});
 countN();
 document.getElementById('copy').onclick=()=>{const out=trs.filter(t=>dec[t.dataset.cid]==='y').map(t=>({op:'correct',claim:+t.dataset.cid,to:t.dataset.correct}));const ta=document.getElementById('out');document.getElementById('outwrap').style.display='block';ta.value=JSON.stringify(out);ta.select();try{navigator.clipboard.writeText(ta.value);}catch(e){}};
</script></body></html>`;
if (!existsSync('tmp')) mkdirSync('tmp', { recursive: true });
writeFileSync(OUT, html);
console.log(`wrote ${OUT} — ${flags.length} corrections`);
process.exit(0);
