// Emit a self-contained HTML review page for the alias STORE DIVERGENCE — surfaces present in er.aliases JSON but
// NOT in graph.db for that entity (the higher-risk set where the "Muṣṭafá" contamination lived). Each row is ranked
// by SUSPICION and has keep/remove buttons; "Copy removals" exports the decisions as JSON to paste back for quarantine.
// Read-only. Run ON tower-nas; the HTML is written to tmp/. Pull it local and open.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const OUT = process.env.OUT || 'tmp/siftersearch-divergence-review.html';
const ADJUDICATE = process.env.ADJUDICATE === '1';            // run the AI pass over the ambiguous set
const VERDICTS = 'tmp/siftersearch-alias-verdicts.json';

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

// A relative/other-role named in the summary ("father of X", "X's brother", "secretary of X") is a DIFFERENT
// person — machine-resolvable, auto-remove, don't ask the human. Detect the alias's core token near a kinship/role word.
const KIN = 'father|mother|son|daughter|wife|husband|brother|sister|uncle|aunt|cousin|nephew|niece|grandfather|grandmother|grandson|granddaughter|widow|father-?in-?law|son-?in-?law|brother-?in-?law|mother-?in-?law|disciple|servant|secretary|attendant|amanuensis|steward|companion of|teacher of|pupil of';
const KIN_RE = new RegExp(`\\b(${KIN})\\b`);
const relativeContext = (summary, alias) => {
  const s = nrm(summary); const toks = [...sig(alias)]; if (!toks.length || !s) return false;
  const a = toks.sort((x, y) => y.length - x.length)[0]; const i = s.indexOf(a); if (i < 0) return false;
  return KIN_RE.test(s.slice(Math.max(0, i - 48), i + a.length + 48));   // kinship/role word within ~48 chars of the alias
};

const rows = [];
for (const r of jRows) {
  let arr = []; try { arr = JSON.parse(r.al); } catch { continue; }
  const g = gByEnt.get(r.entity_id) || new Set();
  const pool = sig(r.cn); for (const a of (gListByEnt.get(r.entity_id) || [])) for (const t of sig(a)) pool.add(t);
  let rn = {}; try { rn = JSON.parse(r.rn || '{}'); } catch { /* */ }
  const summary = r.summary || rn.summary || '';
  // the record's cited facts — where a name appears here IS the context that tells us which person it is
  const facts = []; for (const k of ['facts2', 'episodes', 'characterizations', 'facts']) if (Array.isArray(rn[k])) for (const f of rn[k]) if (f && f.statement) facts.push({ text: f.statement, quote: f.quote || null, url: f.url || null });
  for (const a of arr) {
    const n = nrm(a); if (!n || g.has(n)) continue;
    const toks = sig(a); const shares = [...toks].some((t) => pool.has(t));
    const isEpithet = EPI.test(a.trim()) || !toks.size;
    const level = shares ? 'variant' : isEpithet ? 'epithet' : relativeContext(summary, a) ? 'relative' : 'ambiguous';
    const at = [...toks].sort((x, y) => y.length - x.length)[0] || n;             // distinctive token to find in context
    const ctx = facts.filter((f) => nrm(`${f.text} ${f.quote || ''}`).includes(at)).slice(0, 3);
    rows.push({ entity_id: r.entity_id, cn: r.cn, alias: a, level, summary: (summary || '').slice(0, 300), gAliases: (gListByEnt.get(r.entity_id) || []).slice(0, 10), ctx });
  }
}
// ---- AI adjudication of the AMBIGUOUS set (world + corpus knowledge; suggests, human confirms) ----
const keyOf = (r) => `${r.entity_id}|${nrm(r.alias)}`;
const SYS = `You disambiguate ALIASES in a Bábí/Bahá'í historical entity database. Each item gives an ENTITY (canonical name + summary + confirmed names), a SUSPECT ALIAS attached to it, and CONTEXT (verbatim snippets from the record's cited sources where that name appears — this is the primary evidence). A bare name or title is NOT determinative on its own; DECIDE FROM THE CONTEXT — if the context shows the name refers to a brother/father/other individual, it is a different person; if it refers to the record themselves, it is the same. If the CONTEXT is empty, the alias has no textual basis here → strongly prefer "different" or "uncertain", never "same". Classify the alias's relation to the entity as exactly one of:
- "same": another name/title/spelling/known equivalent of THIS SAME person (e.g. Temüjin = Genghis Khan = Chengíz Khán) → keep.
- "different": a DIFFERENT person, e.g. a same-given-name namesake → remove.
- "relative": a relative/associate/other role of the entity (father, son, secretary…), not the entity → remove.
- "uncertain": evidence + knowledge do not clearly decide → escalate to a human.
Rules (Rule — Why — Example):
- A SHARED NAME IS NOT PROOF OF SAMENESS. "same" requires POSITIVE, CONSISTENT evidence across era, nisba, role, place, associates, and fate. A bare given name — ESPECIALLY WITHOUT A DISTINGUISHING NISBA — never justifies a merge on its own. Why: a common name causes false conflation, the worst error here. Example: two men both named "Fatḥu'lláh" are NOT the same absent corroboration.
- If ANY evidence conflicts (different nisba, era, role, or fate), answer "different" EVEN IF THE NAMES MATCH. Example: Fatḥu'lláh-i-Qumí (a boy, killed after the 1852 attempt on the Sháh) ≠ Fatḥu'lláh Big (a combatant at Fort Ṭabarsí, ~1849) → different.
- Be CONFIDENT on world-historically famous figures — there is only ONE person with that set of names, so mark them "same" with high confidence and DO NOT answer "uncertain". Example: Temüjin = Chingíz/Chengíz Khán = Genghis Khan is a single Mongol conqueror → same.
- Otherwise, with no positive proof of sameness for an obscure name: answer "different" if any distinguishing signal exists, else "uncertain". Never merge just to resolve the row.
For EACH item give both sides so a human can review: the strongest case they ARE the same, and the strongest case they are DIFFERENT.
Return ONLY JSON: {"verdicts":[{"i":<index>,"relation":"same|different|relative|uncertain","confidence":0-1,"for_same":"<=16 words, strongest case they are the SAME person>","for_diff":"<=16 words, strongest case they are DIFFERENT people>"}]}.`;

if (ADJUDICATE) {
  const amb = rows.filter((r) => r.level === 'ambiguous');
  let cache = {}; try { cache = JSON.parse(readFileSync(VERDICTS, 'utf8')); } catch { /* fresh */ }
  const todo = amb.filter((r) => !(keyOf(r) in cache));
  console.error(`adjudicating ${todo.length} ambiguous (of ${amb.length}; ${amb.length - todo.length} cached)…`);
  for (let b = 0; b < todo.length; b += 12) {
    const batch = todo.slice(b, b + 12);
    const items = batch.map((r, i) => ({ i, entity: r.cn, summary: r.summary, names: r.gAliases.slice(0, 6), alias: r.alias, context: r.ctx.map((c) => c.text).slice(0, 3) }));
    try {
      const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: JSON.stringify(items) }],
        { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 1400, responseFormat: { type: 'json_object' } });
      const p = JSON.parse((res.content || '').match(/\{[\s\S]*\}/)[0]);
      for (const v of (p.verdicts || [])) { const r = batch[v.i]; if (r) cache[keyOf(r)] = { relation: v.relation, confidence: v.confidence, for_same: v.for_same, for_diff: v.for_diff }; }
    } catch (e) { console.error(`  batch ${b} failed: ${String(e.message).slice(0, 60)}`); }
    writeFileSync(VERDICTS, JSON.stringify(cache, null, 0));
    console.error(`  ${Math.min(b + 12, todo.length)}/${todo.length}`);
  }
  for (const r of amb) { const v = cache[keyOf(r)]; if (!v) continue; r.forSame = v.for_same; r.forDiff = v.for_diff; r.aiRel = v.relation;
    r.level = v.relation === 'same' ? 'ai-same' : (v.relation === 'different' || v.relation === 'relative') ? 'ai-diff' : 'ambiguous'; }
} else if (existsSync(VERDICTS)) {   // reuse cached verdicts without re-calling the LLM
  let cache = {}; try { cache = JSON.parse(readFileSync(VERDICTS, 'utf8')); } catch { /* */ }
  for (const r of rows) { if (r.level !== 'ambiguous') continue; const v = cache[keyOf(r)]; if (!v) continue; r.forSame = v.for_same; r.forDiff = v.for_diff; r.aiRel = v.relation;
    r.level = v.relation === 'same' ? 'ai-same' : (v.relation === 'different' || v.relation === 'relative') ? 'ai-diff' : 'ambiguous'; }
}

const order = { ambiguous: 0, 'ai-diff': 1, 'ai-same': 2, relative: 3, variant: 4, epithet: 5 };
rows.sort((a, b) => order[a.level] - order[b.level] || a.cn.localeCompare(b.cn));
const counts = rows.reduce((m, r) => (m[r.level] = (m[r.level] || 0) + 1, m), {});

// per-row two-sided evidence + the pre-selected verdict (is=same/keep, isnt=different/remove)
const ev = (r) => {
  if (r.level === 'ai-same') return { same: r.forSame || 'AI judged these the same person.', diff: r.forDiff || '—' };
  if (r.level === 'ai-diff') return { same: r.forSame || '—', diff: r.forDiff || 'AI judged these different people.' };
  if (r.level === 'ambiguous') return { same: r.forSame || 'no shared name with the record', diff: r.forDiff || 'no relationship stated in the summary' };
  if (r.level === 'relative') return { same: 'appears in the same summary text', diff: 'summary names this as a relative / other role — a different person' };
  if (r.level === 'variant') return { same: 'shares name-tokens with the record — a spelling/transliteration variant', diff: '—' };
  if (r.level === 'epithet') return { same: 'a descriptive epithet of the record, not a distinct name', diff: '—' };
  return { same: '', diff: '' };
};
const ctxHtml = (r) => (r.ctx && r.ctx.length)
  ? `<div class="ctxs"><b>where “${esc(r.alias)}” appears in this record’s cited sources:</b>${r.ctx.map((c) => `<div class="ctxi">“${esc(c.text)}”${c.url ? ` <a href="${esc(c.url)}" target="_blank">¶</a>` : ''}</div>`).join('')}</div>`
  : `<div class="ctxs nobasis">⚠ “${esc(r.alias)}” appears in NONE of this record’s cited facts — no textual basis for attaching it here.</div>`;
const DEF = { 'ai-same': 'keep', variant: 'keep', epithet: 'keep', 'ai-diff': 'rm', relative: 'rm' };   // pre-selected verdict
const GRP = (lvl) => (lvl === 'variant' || lvl === 'epithet') ? 'auto' : 'review';
const BADGE = { ambiguous: '? AI unsure', 'ai-diff': 'AI: different', 'ai-same': 'AI: same', relative: 'relative', variant: 'variant', epithet: 'epithet' };
const rowHtml = (r) => { const e = ev(r); const def = DEF[r.level] || '';
  return `<tr class="lvl-${r.level}" data-level="${r.level}" data-group="${GRP(r.level)}" data-eid="${r.entity_id}" data-alias="${esc(r.alias)}"${def ? ` data-default="${def}"` : ''}>
  <td class="pair">
    <div class="names"><span class="alias">${esc(r.alias)}</span>
      <span class="tog"><button class="t-is" title="same person — keep this alias">IS</button><button class="t-isnt" title="different person — remove this alias">IS&nbsp;NOT</button></span>
      <a class="entity" href="https://siftersearch.com/biography#${r.entity_id}" target="_blank">${esc(r.cn)}</a><span class="eid">#${r.entity_id}</span></div>
    <div class="tags"><span class="badge ${r.level}">${BADGE[r.level] || r.level}</span></div>
  </td>
  <td class="ev">
    <div class="ev-is"><span class="lbl is">IS — because</span>${esc(e.same)}</div>
    <div class="ev-isnt"><span class="lbl isnt">IS NOT — because</span>${esc(e.diff)}</div>
    ${ctxHtml(r)}
    <div class="sum">${esc(r.summary)}</div>
    <div class="ga"><b>record’s confirmed names:</b> ${r.gAliases.map((x) => `<span>${esc(x)}</span>`).join(' · ') || '—'}</div>
  </td>
</tr>`; };

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
 .pair{min-width:22rem} .names{display:flex;align-items:center;flex-wrap:wrap;gap:.35rem;font-size:1.05rem}
 .alias{font-weight:700} .entity{color:#7dd3fc;text-decoration:none;font-weight:600} .eid{color:var(--mut);font-size:.72rem;margin-left:.25rem}
 .tog{display:inline-flex;margin:0 .5rem;box-shadow:0 1px 3px rgba(0,0,0,.4)}
 .tog button{border:1px solid #33507e;background:#1a2745;color:#cdd9f0;padding:.35rem .75rem;cursor:pointer;font-weight:800;font-size:.82rem;letter-spacing:.02em}
 .tog .t-is{border-radius:7px 0 0 7px} .tog .t-isnt{border-radius:0 7px 7px 0;border-left:none}
 .tog button:hover{background:#24345c}
 tr.mark-keep .t-is{background:#15803d;border-color:#22c55e;color:#fff} tr.mark-keep{background:rgba(34,197,94,.05)}
 tr.mark-rm .t-isnt{background:#b91c1c;border-color:#ef4444;color:#fff} tr.mark-rm{background:rgba(239,68,68,.09)}
 .tags{margin-top:.4rem} .badge{font-size:.7rem;font-weight:700;letter-spacing:.03em;padding:.1rem .45rem;border-radius:5px;border:1px solid var(--line)}
 .badge.ambiguous{color:#f59e0b;border-color:#f59e0b} .badge.ai-diff{color:var(--sus);border-color:#7f1d1d} .badge.ai-same{color:var(--var);border-color:#2f5122} .badge.relative{color:var(--sus)} .badge.epithet{color:var(--epi)} .badge.variant{color:var(--var)}
 tr.lvl-ambiguous:not(.mark-keep):not(.mark-rm){background:rgba(245,158,11,.09)}
 .ev{max-width:44rem} .ev-is,.ev-isnt{margin-bottom:.35rem}
 .lbl{display:inline-block;font-size:.66rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:.08rem .4rem;border-radius:4px;margin-right:.45rem}
 .lbl.is{background:rgba(34,197,94,.16);color:#4ade80} .lbl.isnt{background:rgba(239,68,68,.16);color:#f87171}
 .ctxs{margin:.45rem 0;font-size:.85rem} .ctxs>b{color:var(--mut);font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em}
 .ctxi{color:#cdd9f0;border-left:2px solid #33507e;padding:.15rem .6rem;margin:.25rem 0} .ctxi a{color:#7dd3fc;text-decoration:none}
 .nobasis{color:#fca5a5;border-left:2px solid var(--sus);padding-left:.6rem}
 .sum{color:var(--mut);margin-top:.4rem;font-size:.85rem} .ga{color:var(--mut);font-size:.8rem;margin-top:.35rem} .ga span{color:#b8c6e0}
 #outwrap{display:none;padding:.75rem 1.5rem;background:#0d1526;border-bottom:1px solid var(--line)} #out{width:100%;height:8rem;background:#0b1220;color:#9ecbff;border:1px solid var(--line);border-radius:6px;font:12px/1.4 ui-monospace,Menlo,monospace;padding:.6rem}
</style></head><body>
<header>
 <h1>Alias review — does each alias belong to its record?</h1>
 <p class="lede">Each row: the <b>alias</b> on the left, the <b>record</b> on the right, and <b>IS</b> / <b>IS NOT</b> between them. An AI pre-picked an answer (green <b>IS</b> = same person, keep · red <b>IS NOT</b> = different person, remove) and gives its evidence for <i>each</i> side — <b>click IS or IS NOT to confirm or flip it.</b> The <b>To review</b> tab shows the ${(counts.ambiguous || 0) + (counts['ai-diff'] || 0) + (counts['ai-same'] || 0) + (counts.relative || 0)} cases actually judged; token-variants &amp; epithets are auto-kept (separate tabs). When done, hit <b>Copy removals</b> and paste the JSON back to me.</p>
 <div class="bar">
  <div class="filters">
   <button data-f="review" class="on">✔ To review (${(counts.ambiguous || 0) + (counts['ai-diff'] || 0) + (counts['ai-same'] || 0) + (counts.relative || 0)})</button>
   <button data-f="ai-diff">AI: different → remove (${counts['ai-diff'] || 0})</button>
   <button data-f="ai-same">AI: same → keep (${counts['ai-same'] || 0})</button>
   <button data-f="ambiguous">AI unsure (${counts.ambiguous || 0})</button>
   <button data-f="relative">relatives (${counts.relative || 0})</button>
   <button data-f="variant">variants (${counts.variant || 0})</button>
   <button data-f="epithet">epithets (${counts.epithet || 0})</button>
   <button data-f="all">all (${rows.length})</button>
  </div>
  <div class="tool"><span><span id="n">0</span> marked remove</span><button class="exp" id="copy">Copy removals</button></div>
 </div>
</header>
<div id="outwrap"><textarea id="out" readonly></textarea></div>
<table>
 <thead><tr><th>Is this alias the same person as this record? &nbsp;(<span style="color:#4ade80">IS</span> = keep · <span style="color:#f87171">IS NOT</span> = remove)</th><th>Evidence for / against + context</th></tr></thead>
 <tbody>
${rows.map(rowHtml).join('\n')}
 </tbody>
</table>
<script>
 const KEY='sifter-div-v2'; let dec=JSON.parse(localStorage.getItem(KEY)||'{}');
 const trs=[...document.querySelectorAll('tbody tr')];
 const idOf=t=>t.dataset.eid+'|'+t.dataset.alias;
 const paint=t=>{const s=dec[idOf(t)];t.classList.toggle('mark-keep',s==='keep');t.classList.toggle('mark-rm',s==='rm');};
 const persist=()=>localStorage.setItem(KEY,JSON.stringify(dec));
 const countN=()=>document.getElementById('n').textContent=trs.filter(t=>dec[idOf(t)]==='rm').length;
 trs.forEach(t=>{ if(!(idOf(t) in dec) && t.dataset.default) dec[idOf(t)]=t.dataset.default; paint(t);
   t.querySelector('.t-is').onclick=()=>{dec[idOf(t)]='keep';persist();paint(t);countN();};
   t.querySelector('.t-isnt').onclick=()=>{dec[idOf(t)]='rm';persist();paint(t);countN();}; });
 persist(); countN();
 const btns=[...document.querySelectorAll('.filters button')];
 const applyF=f=>trs.forEach(t=>t.style.display=(f==='all'||t.dataset.level===f||t.dataset.group===f)?'':'none');
 btns.forEach(b=>b.onclick=()=>{btns.forEach(x=>x.classList.remove('on'));b.classList.add('on');applyF(b.dataset.f);});
 applyF('review');
 document.getElementById('copy').onclick=()=>{
   const out=trs.filter(t=>dec[idOf(t)]==='rm').map(t=>({entity_id:+t.dataset.eid,alias:t.dataset.alias}));
   const txt=JSON.stringify(out); const ta=document.getElementById('out');
   document.getElementById('outwrap').style.display='block'; ta.value=txt; ta.select();
   try{navigator.clipboard.writeText(txt);}catch(e){} };
</script>
</body></html>`;
if (!existsSync('tmp')) mkdirSync('tmp', { recursive: true });
writeFileSync(OUT, html);
console.log(`wrote ${OUT} — ${rows.length} rows | NEEDS-JUDGMENT ${counts.ambiguous || 0} · AI-remove ${counts['ai-diff'] || 0} · AI-keep ${counts['ai-same'] || 0} · relatives ${counts.relative || 0} · variants ${counts.variant || 0} · epithets ${counts.epithet || 0}`);
process.exit(0);
