// Builds planning/anis-strategies.html (standalone artifact page, no html/head/body) from planning/anis-strategies.json.
// One card + compact SVG tier chart per strategy, activity cards with step flows. Style copied from the Anís Vision page.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const d = JSON.parse(fs.readFileSync(path.join(root, 'planning/anis-strategies.json'), 'utf8'));

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const anchor = id => id.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
const total = s => (s.test_questions.lead || 0) + (s.test_questions.also || 0);
const grounding = n => n >= 100 ? 'strong' : n >= 20 ? 'moderate' : n >= 3 ? 'few' : 'thin';
const llmSteps = s => s.tiers.reduce((n, t) => n + t.steps.filter(x => x.kind === 'llm').length, 0);
const statusChip = st => {
  const cls = /^exists|^partly live|^live/.test(st) ? 'live' : /^partial/.test(st) ? 'week' : 'later';
  return `<span class="chip ${cls}">${esc(st.split(' (')[0])}</span>`;
};
const toolName = Object.fromEntries(d.tools.map(t => [t.id, t.name]));

// ---- compact SVG: rows = tiers (cheapest on top), "no" drops to the next row, all rows end in one write box
function chart(s) {
  const X0 = 92, GAP = 24, BH = 28, ROW = 66, CW = 6.7;
  const rows = s.tiers.map((t, r) => {
    let x = X0;
    const boxes = t.steps.map(st => {
      const w = Math.max(54, Math.round(st.label.length * CW + 18));
      const b = { ...st, x, w };
      x += w + GAP;
      return b;
    });
    return { tier: t, boxes, end: x - GAP };
  });
  const single = rows.length === 1;
  const top = single ? 10 : 6;
  rows.forEach((r, i) => { r.y = top + i * ROW; });
  const WX = Math.max(...rows.map(r => r.end)) + 34, WW = 96;
  const lastY = rows.at(-1).y;
  const wy0 = single ? 0 : rows[0].y, wy1 = single ? 48 : lastY + BH;
  const W = WX + WW + 4, H = Math.max(wy1, lastY + BH) + 4;
  const out = [];
  out.push(`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(s.id)} strategy: ${rows.length} tier(s)">`);
  out.push(`<defs><marker id="ah-${s.id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z"/></marker></defs>`);
  const mk = `marker-end="url(#ah-${s.id})"`;
  rows.forEach((r, i) => {
    const cy = r.y + BH / 2;
    out.push(`<text class="s" x="0" y="${cy}">${esc(r.tier.cost)}</text>`);
    r.boxes.forEach((b, k) => {
      const cls = b.kind === 'jev' ? 'j' : b.kind === 'llm' ? 'l' : 't';
      const rx = b.kind === 'jev' ? 14 : 4;
      out.push(`<rect class="${cls}" x="${b.x}" y="${r.y}" width="${b.w}" height="${BH}" rx="${rx}"/>`);
      out.push(`<text x="${b.x + b.w / 2}" y="${cy}"${b.kind === 'use' ? ' font-weight="600"' : ''}>${esc(b.label)}</text>`);
      if (k > 0) {
        const p = r.boxes[k - 1];
        out.push(`<path d="M${p.x + p.w + 1} ${cy}H${b.x - 2}" ${mk}/>`);
      }
    });
    const last = r.boxes.at(-1);
    const isJev = last.kind === 'jev';
    out.push(`<path d="M${last.x + last.w + 1} ${cy}H${WX - 2}" ${mk}/>`);
    if (isJev && i < rows.length - 1) out.push(`<text class="yn" x="${last.x + last.w + 12}" y="${cy - 8}">yes</text>`);
    if (i < rows.length - 1) {
      const nx = rows[i + 1].boxes[0];
      const cx = last.x + last.w / 2, ny = rows[i + 1].y;
      out.push(`<path d="M${cx} ${r.y + BH}V${r.y + BH + 19}H${nx.x + nx.w / 2}V${ny - 2}" ${mk}/>`);
      out.push(`<text class="yn" x="${cx + 12}" y="${r.y + BH + 9}">no</text>`);
    }
  });
  out.push(`<rect class="w" x="${WX}" y="${wy0}" width="${WW}" height="${wy1 - wy0}" rx="4"/>`);
  const mid = (wy0 + wy1) / 2;
  ['Choose', 'format,', 'then write'].forEach((t, i) => out.push(`<text class="wt" x="${WX + WW / 2}" y="${mid + (i - 1) * 14}">${t}</text>`));
  out.push('</svg>');
  return `<div class="flow">${out.join('')}<div class="legend"><span><i style="background:var(--accent-soft);border-color:var(--accent);border-radius:7px"></i>Jev decision</span><span><i style="background:var(--warn-soft);border-color:var(--warn);border-style:dashed"></i>LLM step</span><span><i style="background:var(--paper);border-color:var(--line)"></i>tool, code, or another strategy (bold)</span><span>Each row is a tier; “no” drops to the next.</span></div></div>`;
}

const list = (arr, cls = '') => arr?.length ? `<ul${cls ? ` class="${cls}"` : ''}>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="note">none yet</span>';
const qlist = arr => arr?.length ? arr.map(x => `<q>${esc(x)}</q>`).join(' · ') : '<span class="note">none in the test sets yet</span>';
const ids = arr => arr?.length ? arr.map(x => /^[A-H]\d$/.test(x) ? `<a href="#${anchor(x)}">${x}</a>` : esc(x)).join(' · ') : '<span class="note">none</span>';

function jevBlock(j) {
  if (!j) return '';
  const near = j.near_misses?.length
    ? `<ul>${j.near_misses.map(n => `<li><q>${esc(n.text)}</q> → <b>${esc(n.goes_to)}</b> <span class="note">${esc(n.why)}</span></li>`).join('')}</ul>`
    : '<span class="note">none recorded yet</span>';
  return `<div class="full jev"><span class="k">For Jev: how to recognise it</span>
  <div class="jgrid">
    <div><span class="k2">Cues</span>${list(j.cues)}</div>
    <div><span class="k2">Real phrasings</span>${qlist(j.example_phrasings)}</div>
    <div class="full"><span class="k2">Near misses (look alike, go elsewhere)</span>${near}</div>
    <div><span class="k2">Required slots</span>${list(j.required_slots)}</div>
    <div><span class="k2">Disqualifiers</span>${list(j.disqualifiers)}</div>
    <div><span class="k2">Confusable with</span>${ids(j.confusable_with)}</div>
    <div><span class="k2">Composes with</span>${ids(j.composes_with)}</div>
  </div></div>`;
}

function card(s) {
  const sc = s.scenario || {};
  const n = total(s), g = grounding(n);
  const route = sc.route?.length ? `<ol class="tree">${sc.route.map(r => `<li${r.jev ? ' class="jev"' : ''}>${r.jev ? '◆ ' : ''}${esc(r.text)}</li>`).join('')}</ol>` : '';
  const tq = s.test_questions;
  return `<div class="scen" id="${anchor(s.id)}"><h3>${esc(s.id)} · ${esc(s.name)} ${statusChip(s.status)} <span class="chip g-${g}">${g === 'thin' ? 'needs questions' : g}</span></h3>
  <div><span class="k">Sounds like</span>${qlist(sc.sounds_like)}${sc.sounds_like_note ? ` <span class="note">${esc(sc.sounds_like_note)}</span>` : ''}</div>
  <div><span class="k">How often</span>${esc(sc.how_often || '')}${sc.often_with ? `<br><span class="note">Most often with: ${esc(sc.often_with)}</span>` : ''}</div>
  <div class="full"><span class="k">Test questions · ${tq.lead} lead · ${tq.also} also${tq.derived ? ` · ${esc(tq.derived)}` : ''}</span>${qlist(tq.examples)}</div>
  <div class="full"><span class="k">Ideal answer · target ${esc(s.target_time)}</span>${esc(sc.ideal_answer || '')}</div>
  ${route ? `<div class="full"><span class="k">Route in words</span>${route}</div>` : ''}
  <div class="full"><span class="k">Tiers, cheapest first</span>${chart(s)}</div>
  ${s.post ? `<div class="full"><span class="k">Then</span>${esc(s.post)}</div>` : ''}
  <div><span class="k">Format</span>${esc(s.format)}</div>
  <div><span class="k">Fallback</span>${esc(s.fallback === 'agent' ? 'the research agent' : s.fallback === 'deep_research' ? 'the deep-research job' : s.fallback)}</div>
  ${jevBlock(s.jev)}
  <div><span class="k">Open questions</span>${s.open_questions?.length ? `<ul>${s.open_questions.map(q => `<li><span class="open">open</span> ${esc(q)}</li>`).join('')}</ul>` : '<span class="note">none</span>'}</div>
  <div><span class="k">Measure</span>${esc(s.measure)}</div>
</div>`;
}

function activity(a) {
  const week1 = /^week 1/.test(a.week);
  const flow = `<div class="aflow">${a.steps.map((st, i) => `${i ? '<span class="arr">→</span>' : ''}<span class="astep">${esc(st)}</span>`).join('')}</div>`;
  return `<div class="scen" id="act-${anchor(a.id)}"><h3>${esc(a.name)} <span class="chip ${week1 ? 'week' : 'later'}">${week1 ? 'week 1' : 'later'}</span> ${statusChip(a.status)}</h3>
  <div class="full"><span class="k">How it starts</span>${esc(a.start)}</div>
  <div class="full"><span class="k">Steps</span>${flow}</div>
  <div><span class="k">Schedule</span>${esc(a.schedule)}</div>
  <div><span class="k">Reuses</span>${a.reuses.map(r => /^[A-H]\d$/.test(r) ? `<a href="#${anchor(r)}">${r}</a>` : `<span class="mono">${esc(toolName[r] || r)}</span>`).join(' · ')}</div>
  <div><span class="k">Channels</span>${esc(a.channels.join(', '))}${a.later_channels?.length ? ` <span class="note">later: ${esc(a.later_channels.join(', '))}</span>` : ''}</div>
  <div><span class="k">Output</span>${esc(a.output)}</div>
  <div><span class="k">State kept</span>${esc(a.state)}</div>
  <div><span class="k">When</span>${esc(a.week)}</div>
  <div class="full"><span class="k">Status</span>${esc(a.status)}</div>
  ${jevBlock(a.jev)}
  <div><span class="k">Open questions</span><ul>${a.open_questions.map(q => `<li><span class="open">open</span> ${esc(q)}</li>`).join('')}</ul></div>
  <div><span class="k">Measure</span>${esc(a.measure)}</div>
</div>`;
}

// ---- style: Vision page tokens, with body and muted text darkened to ≥ 7:1
const style = `<style>
:root{--bg:#f6f7f9;--paper:#ffffff;--ink:#0d141c;--text:#2c3640;--muted:#46515e;--line:#d9dee5;--accent:#0b5a5f;--accent-soft:#e2f1f1;--warn:#744300;--warn-soft:#fbf0de;--bar:#9cc9cb;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#11161c;--paper:#18202a;--ink:#f4f7fa;--text:#c9d2dc;--muted:#aeb8c4;--line:#2b3542;--accent:#6fd0d4;--accent-soft:#16343a;--warn:#ecb35e;--warn-soft:#3a2c14;--bar:#2f6f73;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#11161c;--paper:#18202a;--ink:#f4f7fa;--text:#c9d2dc;--muted:#aeb8c4;--line:#2b3542;--accent:#6fd0d4;--accent-soft:#16343a;--warn:#ecb35e;--warn-soft:#3a2c14;--bar:#2f6f73;color-scheme:dark}
body{background:var(--bg);color:var(--text);font:15px/1.65 "Public Sans",system-ui,sans-serif;padding:0 16px;margin:0}
b,strong,h1,h2,h3{color:var(--ink)} b,strong{font-weight:700}
a{color:var(--accent)}
main{max-width:900px;margin:0 auto;padding-block:40px 64px;display:flex;flex-direction:column;gap:40px}
h1,h2,h3{font-family:Literata,Georgia,serif;text-wrap:balance;margin:0;font-weight:650}
h1{font-size:2rem;line-height:1.2}
h2{font-size:1.35rem;margin-bottom:10px}
h3{font-size:1.05rem;margin-bottom:6px}
p{margin:0 0 10px;max-width:70ch}
section{display:flex;flex-direction:column;gap:14px}
section>p,section>ul{margin:0}
.lede{color:var(--muted);font-size:1.02rem}
.docnav{font:600 .74rem "JetBrains Mono",monospace;letter-spacing:.04em;color:var(--muted)} .docnav a{color:var(--accent);text-decoration:none} .docnav b{color:var(--ink)}
.eyebrow{font:600 .72rem/1 "JetBrains Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
header{display:flex;flex-direction:column;gap:10px}
.ww{background:var(--accent-soft);border-left:3px solid var(--accent);padding:10px 14px;border-radius:2px;font-size:.92rem;max-width:none}
.ww b{font-family:"JetBrains Mono",monospace;font-size:.75rem;color:var(--accent);margin-right:4px}
.wrap{overflow-x:auto;background:var(--paper);border:1px solid var(--line);border-radius:4px;margin-bottom:22px}
table{border-collapse:collapse;width:100%;font-size:.86rem}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font:600 .7rem "JetBrains Mono",monospace;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);background:var(--bg)}
tr:last-child td{border-bottom:0}
td.n{font-family:"JetBrains Mono",monospace;font-variant-numeric:tabular-nums;white-space:nowrap}
ul,ol{margin:0;padding-left:20px;max-width:70ch} li{margin-bottom:4px}
q{font-style:italic;quotes:"“" "”"}
.note{color:var(--muted);font-size:.85rem}
.mono{font-family:"JetBrains Mono",monospace;font-size:.82em}
.flow{background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:10px 12px;overflow-x:auto;margin:4px 0 22px}
.flow svg{display:block;max-width:none;font:12px "Public Sans",system-ui,sans-serif}
.flow text{fill:var(--ink);text-anchor:middle;dominant-baseline:central}
.flow .t{fill:var(--paper);stroke:var(--muted)} .flow .j{fill:var(--accent-soft);stroke:var(--accent)} .flow .l{fill:var(--warn-soft);stroke:var(--warn);stroke-dasharray:4 3}
.flow .w{fill:var(--accent);stroke:var(--accent)} .flow .wt{fill:var(--paper);font-weight:600}
.flow path{stroke:var(--muted);fill:none;stroke-width:1.2} .flow marker path{fill:var(--muted);stroke:none}
.flow .s{fill:var(--muted);font-size:10.5px;text-anchor:start} .flow .yn{fill:var(--muted);font-size:10.5px}
.flow .legend{display:flex;flex-wrap:wrap;gap:12px;font-size:.75rem;color:var(--muted);border-top:1px solid var(--line);padding-top:6px;margin-top:8px}
.flow .legend i{display:inline-block;width:12px;height:10px;border:1px solid;border-radius:3px;vertical-align:-1px;margin-right:4px}
.gtag{font:600 .72rem "JetBrains Mono",monospace;color:var(--accent);letter-spacing:.06em;text-transform:uppercase}
.scen{background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:14px 16px;display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;scroll-margin-top:12px}
.scen h3{grid-column:1/-1}
.k{font:600 .68rem "JetBrains Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:3px}
.k2{font:600 .64rem "JetBrains Mono",monospace;letter-spacing:.05em;text-transform:uppercase;color:var(--accent);display:block;margin-bottom:2px}
.scen>div{font-size:.9rem;min-width:0}
.scen .full{grid-column:1/-1}
.jev{background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:10px 12px}
.jgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px}
.jgrid ul{padding-left:16px}
.tree{margin:2px 0 4px;padding-left:22px}
.tree li{margin-bottom:3px}
.tree li.jev{list-style:none;margin-left:-14px;color:var(--accent);background:none;border:0;padding:0}
.chip{font:600 .62rem "JetBrains Mono",monospace;padding:2px 6px;border-radius:2px;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;vertical-align:2px}
.chip.live{background:var(--accent-soft);color:var(--accent)}
.chip.week{background:var(--warn-soft);color:var(--warn)}
.chip.later{background:var(--bg);color:var(--muted);border:1px solid var(--line)}
.chip.g-strong,.chip.g-moderate{background:var(--bg);color:var(--ink);border:1px solid var(--line)}
.chip.g-few,.chip.g-thin{background:var(--warn-soft);color:var(--warn)}
.open{font:600 .6rem "JetBrains Mono",monospace;background:var(--warn-soft);color:var(--warn);padding:1px 5px;border-radius:2px;text-transform:uppercase;letter-spacing:.05em}
.toc{background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:12px 16px;font-size:.9rem}
.toc ol{columns:2;column-gap:28px;max-width:none}
.toc li{break-inside:avoid}
.toc .fam{font-size:.8rem;color:var(--muted)}
.aflow{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.astep{background:var(--bg);border:1px solid var(--muted);border-radius:4px;padding:3px 8px;font-size:.82rem}
.arr{color:var(--muted)}
@media (max-width:640px){.scen,.jgrid{grid-template-columns:1fr}.toc ol{columns:1}}
</style>`;

const S = d.strategies;
const fams = d.families;
const nGround = S.filter(s => total(s) >= 20).length;
const thin = S.filter(s => total(s) < 20).map(s => `${s.id} (${total(s)})`);
const toBuild = d.tools.filter(t => t.status === 'to build');
const partial = d.tools.filter(t => t.status === 'partial');

const html = [];
html.push(`<title>Anís Strategies &amp; Activities</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,500;7..72,650&family=Public+Sans:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
${style}
<main>
<header>
  <span class="eyebrow">Strategies &amp; Activities · draft · ${esc(d.updated)}</span>
  <h1>Anís Strategies &amp; Activities</h1>
  <p class="lede">How Anís answers each kind of request: one strategy per type, built from shared tools, cheapest steps first, then the activities that run on top of him. Everything here is generated from one data file (<span class="mono">planning/anis-strategies.json</span>); every strategy is a self-contained record.</p>
  <nav class="docnav"><a href="#vision-doc">Vision</a> · <b>Strategies &amp; Activities</b> · <a href="#launch-doc">Launch Week</a></nav>
</header>
<nav class="toc" aria-label="Contents"><span class="k">Contents</span><ol>
  <li><a href="#intro">What a strategy is</a></li>
  <li><a href="#ladder">The cost ladder</a></li>
  <li><a href="#tools">Tools</a></li>
  <li><a href="#summary">All strategies at a glance</a></li>
  ${fams.map(f => `<li><a href="#family-${f.id.toLowerCase()}">${f.id} · ${esc(f.name)}</a> <span class="fam">${S.filter(s => s.family === f.id).map(s => `<a href="#${anchor(s.id)}">${s.id}</a>`).join(' ')}</span></li>`).join('\n  ')}
  <li><a href="#composition">Questions that need more than one strategy</a></li>
  <li><a href="#activities">Activities</a></li>
  <li><a href="#open">Open questions</a></li>
</ol></nav>`);

html.push(`<section id="intro">
  <h2>What a strategy is</h2>
  <p class="ww"><b>WHAT</b> A strategy is a small decision tree for one type of request: shared tools, in tiers, cheapest first, ending in one step: choose the answer's format, then write. <b>WHY</b> Most questions can be answered by code and fast tools in under a second; the expensive research agent should be the fallback, not the default.</p>
  <ul>
    <li><b>Jev</b>, a fast classifier (about 50 ms), reads each message with its thread and names its type: a lead type and any others. Jev also makes the small yes/no decisions inside a strategy (found? enough? which person?).</li>
    <li><b>Tiers.</b> Tier 1 uses only code, tools and Jev. A tier adds a light LLM step only when code cannot do the job, and only after the cheaper tier failed. If every tier fails, the research agent takes the question.</li>
    <li><b>One writing step.</b> The writing model writes once, from the evidence and the chosen format. Lookups (find a book, trace a quote, a reference) need no writer: a template lays out the answer.</li>
    <li><b>Switched on only when it matches the agent.</b> Each strategy is measured on fresh questions of its type, with Immerse's 61 held out, against the agent's answers and Perplexity's. It goes live for its type only when it matches or beats the agent within its target time. Until then the agent answers.</li>
    <li><b>Grounding.</b> Counts come from 12,808 real test messages labelled by type (lead · also). Strong ≥ 100, moderate 20–99, few 3–19, thin &lt; 3 (needs questions). The labels are a first pass, not checked gold.</li>
  </ul>
</section>
<section id="ladder">
  <h2>The cost ladder</h2>
  <p class="ww"><b>WHAT</b> What each kind of step costs. <b>WHY</b> A strategy is cheap because it climbs this ladder only as far as it must.</p>
  <div class="wrap"><table><tr><th>Step</th><th>Cost</th><th>Examples</th></tr>
  ${d.cost_ladder.map(c => `<tr><td><b>${esc(c.step)}</b></td><td class="n">${esc(c.cost)}</td><td>${esc(c.examples)}</td></tr>`).join('')}</table></div>
  <p class="note">Target times: a book, quote or reference ≤ 1 s · other lookups ≤ 3 s · understanding and comparing ≤ 12 s, first words within 2 s · assignments take minutes, with progress shown.</p>
</section>`);

html.push(`<section id="tools">
  <h2>Tools</h2>
  <p class="ww"><b>WHAT</b> The shared building blocks every strategy draws on, with where each lives in the code. <b>WHY</b> Strategies are recipes over these; building one tool improves every strategy that uses it.</p>
  <p>${d.tools.length} tools: ${d.tools.filter(t => t.status === 'exists').length} exist, ${partial.length} partial, ${toBuild.length} to build.</p>
  <div class="wrap"><table><tr><th>Tool</th><th>Does</th><th>Where</th><th>Cost</th><th>Status</th></tr>
  ${d.tools.map(t => `<tr><td><b>${esc(t.name)}</b><br><span class="mono">${esc(t.id)}</span></td><td>${esc(t.does)}</td><td class="mono">${esc(t.where)}</td><td class="n">${esc(t.cost)}</td><td>${statusChip(t.status)}</td></tr>`).join('\n  ')}</table></div>
</section>`);

html.push(`<section id="summary">
  <h2>All strategies at a glance</h2>
  <p class="ww"><b>WHAT</b> Every type, its test questions, how many tiers and paid LLM steps it has. <b>WHY</b> Shows where we are grounded and where we need questions before building.</p>
  <p>${S.length} strategies. ${nGround} are grounded (20 or more test questions). Thin or few: ${esc(thin.join(', '))}.</p>
  <div class="wrap"><table><tr><th>Type</th><th>Name</th><th class="n">Tests (lead · also)</th><th>Grounding</th><th class="n">Tiers</th><th class="n">LLM steps</th><th>Target</th><th>Status</th></tr>
  ${S.map(s => `<tr><td><a href="#${anchor(s.id)}"><b>${s.id}</b></a></td><td>${esc(s.name)}</td><td class="n">${s.test_questions.lead} · ${s.test_questions.also}</td><td>${grounding(total(s))}</td><td class="n">${s.tiers.length}</td><td class="n">${llmSteps(s)}</td><td>${esc(s.target_time)}</td><td>${esc(s.status)}</td></tr>`).join('\n  ')}</table></div>
</section>`);

for (const f of fams) {
  const famS = S.filter(s => s.family === f.id);
  const why = f.id === 'G'
    ? 'Follow-ups mostly reuse the last turn\'s evidence: they resolve what is meant from the thread first and search again only for what that evidence lacks.'
    : f.note;
  html.push(`<section id="family-${f.id.toLowerCase()}">
  <span class="gtag">${f.id} · ${esc(f.name)}</span>
  <p class="ww"><b>WHAT</b> ${esc(famS.map(s => `${s.id} ${s.name}`).join(' · '))}. <b>WHY</b> ${esc(why.charAt(0).toUpperCase() + why.slice(1))}.</p>
  ${famS.map(card).join('\n')}
</section>`);
}

const c = d.composition;
html.push(`<section id="composition">
  <h2>Questions that need more than one strategy</h2>
  <p class="ww"><b>WHAT</b> How strategies combine when one message is two or more types. <b>WHY</b> One message in four needs it, and almost every turn of a real conversation does.</p>
  <p>${esc(c.intro)}</p>
  <div class="wrap"><table><tr><th>Set</th><th class="n">Count</th><th>Real example</th><th>How they combine</th></tr>
  ${c.sets.map(x => `<tr><td><b>${esc(x.set)}</b></td><td class="n">${esc(x.count)}</td><td><q>${esc(x.example.replace(/[“”]/g, ''))}</q></td><td>${esc(x.how)}</td></tr>`).join('\n  ')}</table></div>
  <p><b>The rule for combining.</b> Jev names the lead type and the others in one classification.</p>
  ${list(c.rules)}
  <p class="note">${esc(c.note)}</p>
  <h3>Follow-up moves</h3>
  ${c.moves_note.map(p => `<p>${esc(p)}</p>`).join('')}
  <div class="wrap"><table><tr><th>Move</th><th>Sounds like</th><th>What Anís must do</th></tr>
  ${c.other_moves.map(m => `<tr><td><b>${esc(m.move)}</b></td><td>${esc(m.sounds_like)}</td><td>${esc(m.must_do)}</td></tr>`).join('')}</table></div>
</section>`);

html.push(`<section id="activities">
  <h2>Activities</h2>
  <p class="ww"><b>WHAT</b> Longer things Anís does with a person over time: reading, planning, researching, discussing, writing letters. <b>WHY</b> ${esc(d.activities_about)}</p>
  <p>Week 1 (chat and email): ${esc(d.activities.filter(a => /^week 1/.test(a.week)).map(a => a.name).join('; '))}. Later: ${esc(d.activities.filter(a => !/^week 1/.test(a.week)).map(a => a.name).join('; '))}.</p>
  ${d.activities.map(activity).join('\n')}
</section>`);

html.push(`<section id="open">
  <h2>Open questions</h2>
  <p class="ww"><b>WHAT</b> The decisions that shape the most strategies at once. <b>WHY</b> Each unblocks several types; per-strategy questions are on the cards.</p>
  <ul>${d.open_questions_for_chad.map(q => `<li><span class="open">open</span> ${esc(q)}</li>`).join('')}</ul>
</section>
</main>`);

const outPath = path.join(root, 'planning/anis-strategies.html');
fs.writeFileSync(outPath, html.join('\n') + '\n');
console.log(`wrote ${path.relative(root, outPath)}: ${S.length} strategies, ${d.activities.length} activities, ${d.tools.length} tools`);
