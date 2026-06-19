// Entity review page — LIVE-BUILDS from the DB on every request (no cache).
// For manual review of the Dawn-Breakers (21308) + GPB (21310) entity graph.
// Tabs per entity_type; within each, sections per DB chapter (heading) listing entities
// FIRST INTRODUCED in that chapter (earliest mention, no repetition); each entity is a
// collapsible record (description, aliases, mention count, side/era, citations sample).
// Gated by the internal key (?key=... or X-Admin-Key header).
// Route: GET /api/admin/entity-review  →  served by api/server.js (prefix /api/admin)
// Deps: db.js (query/queryAll = sifter.db; graphQueryAll = graph.db sidecar).

import { query, queryAll, graphQueryAll } from '../lib/db.js';
import { requireAdmin } from '../lib/auth.js';

const DOCS = { 21308: 'The Dawn-Breakers', 21310: 'God Passes By' };
// GPB (21310) chapter map — pre-mapped by paragraph_index from GPB's actual TOC
// (bahai.org). The `heading` column holds marginal SECTION summaries, NOT chapter
// titles, so chapters MUST be mapped by range. Period I = Foreword + Chapters I–V.
const GPB_CHAPTERS = [
  { ch: 0, title: 'Foreword', start: 0, end: 10 },
  { ch: 1, title: 'The Birth of the Bábí Revelation', start: 11, end: 34 },
  { ch: 2, title: "The Báb's Captivity in Ádhirbáyján", start: 35, end: 60 },
  { ch: 3, title: 'Upheavals in Mázindarán, Nayríz and Zanján', start: 61, end: 81 },
  { ch: 4, title: 'The Execution of the Báb', start: 82, end: 98 },
  { ch: 5, title: 'The Attempt on the Life of the Sháh and its Consequences', start: 99, end: 131 },
  { ch: 6, title: "The Birth of the Bahá'í Revelation", start: 132, end: 162 },
  { ch: 7, title: "Bahá'u'lláh's Banishment to 'Iráq", start: 163, end: 210 },
  { ch: 8, title: "Bahá'u'lláh's Banishment to 'Iráq (Continued)", start: 211, end: 256 },
  { ch: 9, title: "The Declaration of Bahá'u'lláh's Mission and His Journey to Constantinople", start: 257, end: 280 },
  { ch: 10, title: "The Rebellion of Mírzá Yaḥyá and the Proclamation of Bahá'u'lláh's Mission in Adrianople", start: 281, end: 317 },
  { ch: 11, title: "Bahá'u'lláh's Incarceration in 'Akká", start: 318, end: 359 },
  { ch: 12, title: "Bahá'u'lláh's Incarceration in 'Akká (Continued)", start: 360, end: 418 },
  { ch: 13, title: 'Ascension of Bahá’u’lláh', start: 419, end: 449 },
  { ch: 14, title: "The Covenant of Bahá'u'lláh", start: 450, end: 461 },
  { ch: 15, title: "The Rebellion of Mírzá Muḥammad-'Alí", start: 462, end: 476 },
  { ch: 16, title: 'The Rise and Establishment of the Faith in the West', start: 477, end: 496 },
  { ch: 17, title: "Renewal of 'Abdu'l-Bahá's Incarceration", start: 497, end: 519 },
  { ch: 18, title: "Entombment of the Báb's Remains on Mt. Carmel", start: 520, end: 532 },
  { ch: 19, title: "'Abdu'l-Bahá's Travels in Europe and America", start: 533, end: 558 },
  { ch: 20, title: 'Growth and Expansion of the Faith in East and West', start: 559, end: 586 },
  { ch: 21, title: "The Passing of 'Abdu'l-Bahá", start: 587, end: 612 },
  { ch: 22, title: 'The Rise and Establishment of the Administrative Order', start: 613, end: 663 },
  { ch: 23, title: 'Attacks on Bahá’í Institutions', start: 664, end: 686 },
  { ch: 24, title: 'Emancipation and Recognition of the Faith and its Institutions', start: 687, end: 713 },
  { ch: 25, title: 'International Expansion of Teaching Activities', start: 714, end: 771 },
  { ch: 26, title: 'Retrospect and Prospect', start: 772, end: 786, label: 'God Passes By · Retrospect and Prospect' },
];
const gpbChapter = (idx) => GPB_CHAPTERS.find(c => idx >= c.start && idx <= c.end) || null;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function buildModel() {
  // 1. all entities (sifter.db)
  const entities = await queryAll(`SELECT id, canonical_name, entity_type, religion, era, description, name_meaning FROM graph_entities ORDER BY canonical_name`);
  const byId = new Map(entities.map(e => [Number(e.id), { ...e, id: Number(e.id), aliases: [], relations: [], mentions: 0, firstDoc: null, firstHeading: null, firstIdx: Infinity }]));

  // 2. aliases (graph.db)
  for (const a of await graphQueryAll(`SELECT entity_id, surface FROM entity_aliases`)) {
    const e = byId.get(Number(a.entity_id)); if (e && a.surface && !e.aliases.includes(a.surface)) e.aliases.push(a.surface);
  }

  // 3. mentions (graph.db) → content_ids; content (sifter.db) gives doc/heading/paragraph_index
  const mentions = await graphQueryAll(`SELECT entity_id, content_id FROM entity_mentions`);
  const cids = [...new Set(mentions.map(m => parseInt(m.content_id, 10)).filter(Number.isFinite))];
  const cmap = new Map();
  for (let i = 0; i < cids.length; i += 800) {
    const chunk = cids.slice(i, i + 800);
    const rows = await queryAll(`SELECT id, doc_id, paragraph_index, heading FROM content WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
    for (const r of rows) cmap.set(Number(r.id), r);
  }
  for (const m of mentions) {
    const e = byId.get(Number(m.entity_id)); if (!e) continue;
    e.mentions++;
    const c = cmap.get(parseInt(m.content_id, 10)); if (!c) continue;
    // first-introduction = earliest mention in Dawn-Breakers (21308); fall back to GPB.
    const rank = (c.doc_id === 21308 ? 0 : c.doc_id === 21310 ? 1 : 2) * 1e9 + (c.paragraph_index ?? 0);
    const curRank = (e.firstDoc === 21308 ? 0 : e.firstDoc === 21310 ? 1 : 2) * 1e9 + (e.firstIdx === Infinity ? 1e9 : e.firstIdx);
    if (e.firstDoc === null || rank < curRank) { e.firstDoc = c.doc_id; e.firstHeading = c.heading || '(no heading)'; e.firstIdx = c.paragraph_index ?? 0; }
  }

  // 4. open review flags (sifter.db) — keyed by canonical_name+entity_type so the
  // reviewer's notes survive entity-graph rebuilds (ids change; name+type don't).
  let flagRows = [];
  try { flagRows = await queryAll(`SELECT canonical_name, entity_type, comment FROM entity_review_flags WHERE status='open'`); } catch { /* table not created yet */ }
  const flagMap = new Map(flagRows.map(f => [`${f.canonical_name} ${f.entity_type}`, f.comment || '']));
  for (const e of byId.values()) {
    const c = flagMap.get(`${e.canonical_name} ${e.entity_type || 'unknown'}`);
    e.flagged = c !== undefined;
    e.flagComment = c || '';
  }

  // 5. relationship edges (sifter.db graph_relations) — outgoing, resolved to names
  try {
    for (const r of await queryAll(`SELECT source_entity_id, target_entity_id, relation_type FROM graph_relations`)) {
      const e = byId.get(Number(r.source_entity_id)), t = byId.get(Number(r.target_entity_id));
      if (e && t) e.relations.push({ type: r.relation_type, target: t.canonical_name });
    }
  } catch { /* graph_relations may be absent */ }
  return [...byId.values()];
}

function render(ents) {
  const types = [...new Set(ents.map(e => e.entity_type || 'unknown'))].sort((a, b) => {
    const order = ['person', 'work', 'place', 'event', 'organization', 'concept', 'title', 'period'];
    return (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99);
  });
  const tabBtns = types.map((t, i) => `<button class="tab${i === 0 ? ' active' : ''}" onclick="showTab('${esc(t)}')" id="tab-${esc(t)}">${esc(t)} (${ents.filter(e => (e.entity_type || 'unknown') === t).length})</button>`).join('');

  const sections = types.map((t, i) => {
    const te = ents.filter(e => (e.entity_type || 'unknown') === t);
    // group by CHAPTER (pre-mapped by paragraph range); the marginal section-heading
    // is shown as a per-entity sub-label, never used as the group key.
    const groups = new Map();
    for (const e of te) {
      let key, label, order;
      if (e.firstDoc === 21310) {
        const ch = gpbChapter(e.firstIdx);
        key = ch ? 'g' + ch.ch : 'none';
        label = !ch ? 'Not yet linked to a chapter' : (ch.label || (ch.ch === 0 ? 'God Passes By · Foreword' : `God Passes By · Chapter ${ch.ch} — ${ch.title}`));
        order = ch ? ch.start : 9e9;
      } else if (e.firstDoc === 21308) {
        key = 'db'; label = 'The Dawn-Breakers (not yet chapter-mapped)'; order = 8e9;
      } else { key = 'none'; label = 'Not yet linked to a chapter'; order = 9e9; }
      if (!groups.has(key)) groups.set(key, { label, order, list: [] });
      groups.get(key).list.push(e);
    }
    const ordered = [...groups.values()].sort((a, b) => a.order - b.order);
    const body = ordered.map(g => {
      const title = esc(g.label);
      const items = g.list.sort((a, b) => a.canonical_name.localeCompare(b.canonical_name)).map(e => `
        <details class="ent"><summary>${esc(e.canonical_name)}${e.name_meaning ? ` <span class="meaning">— “${esc(e.name_meaning)}”</span>` : ''} <span class="meta">· ${e.mentions} mention${e.mentions === 1 ? '' : 's'}${e.firstHeading ? ' · § ' + esc(e.firstHeading) : ''}${e.religion ? ' · ' + esc(e.religion) : ''}${e.era ? ' · ' + esc(e.era) : ''}</span></summary>
          <div class="rec">
            ${e.description ? `<p class="desc">${esc(e.description)}</p>` : '<p class="nodesc">(no description yet)</p>'}
            ${e.aliases.length ? `<p class="al"><b>Aliases:</b> ${e.aliases.map(esc).join(' · ')}</p>` : ''}
            ${e.relations.length ? `<p class="rel"><b>Relationships:</b> ${e.relations.map(r => esc(r.type) + ' → ' + esc(r.target)).join(' · ')}</p>` : ''}
            <p class="id">entity #${e.id}</p>
            <div class="flagwrap${e.flagged ? ' on' : ''}">
              <label class="flag"><input type="checkbox" class="flagcb" id="fc-${e.id}" data-id="${e.id}"${e.flagged ? ' checked' : ''}> ⚑ Flag for review</label>
              <div class="flagbox" id="fb-${e.id}" style="display:${e.flagged ? 'block' : 'none'}">
                <textarea placeholder="Question or note about this entity…">${esc(e.flagComment)}</textarea>
                <div class="flagact"><button type="button" class="flagsave" data-id="${e.id}" data-name="${esc(e.canonical_name)}" data-type="${esc(e.entity_type || 'unknown')}">Save note</button><span class="saved"></span></div>
              </div>
            </div>
          </div>
        </details>`).join('');
      return `<div class="chap"><h3>${title} <span class="cnt">(${g.list.length})</span></h3>${items}</div>`;
    }).join('');
    return `<div class="typesec" id="sec-${esc(t)}" style="display:${i === 0 ? 'block' : 'none'}">${body}</div>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Entity Review — Dawn-Breakers + GPB</title>
<style>
body{font:15px/1.5 -apple-system,Segoe UI,sans-serif;margin:0;background:#f7f7f8;color:#1a1a1a}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:10px 16px;z-index:10}
h1{font-size:18px;margin:0 0 8px}
.tabs{display:flex;flex-wrap:wrap;gap:4px}
.tab{padding:6px 12px;border:1px solid #ccc;background:#f0f0f0;border-radius:6px;cursor:pointer;font-size:13px}
.tab.active{background:#2563eb;color:#fff;border-color:#2563eb}
main{padding:16px;max-width:980px;margin:0 auto}
.chap{margin:0 0 20px}
.chap h3{font-size:14px;color:#444;border-bottom:2px solid #e5e5e5;padding-bottom:4px;margin:18px 0 8px}
.cnt{color:#999;font-weight:normal}
.ent{background:#fff;border:1px solid #e5e5e5;border-radius:6px;margin:4px 0;padding:6px 10px}
.ent summary{cursor:pointer;font-weight:600}
.meta{color:#888;font-weight:normal;font-size:13px}
.meaning{color:#a36;font-weight:normal;font-size:14px;font-style:italic}
.rec{padding:8px 4px 2px}
.desc{margin:4px 0;color:#333}
.nodesc{color:#bbb;font-style:italic;margin:4px 0}
.al{font-size:13px;color:#555;margin:4px 0}
.rel{font-size:13px;color:#3b6;margin:4px 0}
.id{font-size:11px;color:#bbb;margin:2px 0}
.flagwrap{margin-top:6px;border-top:1px dashed #eee;padding-top:6px}
.flagwrap.on{border-top-color:#f0c36d}
.flag{font-size:12px;color:#a36b00;cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:5px}
.flag input{cursor:pointer}
.flagbox{margin-top:6px}
.flagbox textarea{width:100%;box-sizing:border-box;min-height:54px;font:13px/1.4 inherit;border:1px solid #e0c98a;border-radius:5px;padding:6px;background:#fffdf5;resize:vertical}
.flagact{display:flex;align-items:center;gap:10px;margin-top:5px}
.flagact button{padding:4px 12px;border:1px solid #d4a72c;background:#fbf3da;border-radius:5px;cursor:pointer;font-size:12px;color:#7a5200}
.saved{font-size:12px;color:#2e7d32}
</style></head><body>
<header><h1>Entity Review — Dawn-Breakers + God Passes By <span style="font-weight:normal;color:#888;font-size:13px">· ${ents.length} entities · ${ents.filter(e => e.flagged).length} flagged · live from DB · ${new Date().toISOString()}</span></h1>
<div class="tabs">${tabBtns}</div></header>
<main>${sections}</main>
<script>
function showTab(t){document.querySelectorAll('.typesec').forEach(s=>s.style.display='none');document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));document.getElementById('sec-'+t).style.display='block';document.getElementById('tab-'+t).classList.add('active');}
function fbox(id){return document.getElementById('fb-'+id);}
// reveal/hide the note box with the checkbox
document.addEventListener('change',function(e){
  if(!e.target.classList||!e.target.classList.contains('flagcb'))return;
  var id=e.target.dataset.id; var b=fbox(id); if(b)b.style.display=e.target.checked?'block':'none';
});
// Save → hand off to the parent admin app (it holds the session) to persist
document.addEventListener('click',function(e){
  var btn=e.target.closest&&e.target.closest('button.flagsave'); if(!btn)return;
  var id=btn.dataset.id, b=fbox(id), cb=document.getElementById('fc-'+id);
  var st=b.querySelector('.saved'); st.textContent='saving…';
  window.parent.postMessage({type:'er-flag',key:String(id),entityId:Number(id),canonicalName:btn.dataset.name,entityType:btn.dataset.type,flagged:!!cb.checked,comment:b.querySelector('textarea').value},'*');
});
// ack from the parent after the write
window.addEventListener('message',function(e){
  var d=e.data||{}; if(d.type!=='er-flag-ok'&&d.type!=='er-flag-err')return;
  var b=fbox(d.key); if(b)b.querySelector('.saved').textContent=d.type==='er-flag-ok'?'saved ✓':'error ✗';
});
</script></body></html>`;
}

const FLAG_DDL = `CREATE TABLE IF NOT EXISTS entity_review_flags (
  id INTEGER PRIMARY KEY,
  entity_id INTEGER,
  canonical_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  comment TEXT,
  status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(canonical_name, entity_type)
)`;

export default async function entityReviewRoutes(server) {
  // Auth: admin JWT (the auth-only admin panel uses this — no key needed) OR the
  // internal key (for direct/cron access). Shared by the page + the flag write.
  const adminAuth = async (req, reply) => {
    const key = req.query?.key || req.headers['x-admin-key'];
    if (process.env.INTERNAL_API_KEY && key === process.env.INTERNAL_API_KEY) return;
    await requireAdmin(req, reply); // sends 401 if not an admin
  };

  // Self-bootstrap the flag table at registration (write routes via the single-writer).
  try { await query(FLAG_DDL); } catch (e) { /* writer may be momentarily down; POST retries */ }

  server.get('/entity-review', { preHandler: adminAuth }, async (req, reply) => {
    const ents = await buildModel();
    reply.header('content-type', 'text/html; charset=utf-8').header('cache-control', 'no-store');
    return render(ents);
  });

  // Set/clear a review flag + note. Keyed by canonical_name+entity_type (durable across
  // entity rebuilds). flagged=false clears it (kept as status='cleared' for history).
  server.post('/entity-review/flag', { preHandler: adminAuth }, async (req, reply) => {
    const { entityId, canonicalName, entityType, comment, flagged } = req.body || {};
    if (!canonicalName || !entityType) return reply.code(400).send({ error: 'canonicalName + entityType required' });
    await query(FLAG_DDL);
    if (flagged) {
      await query(
        `INSERT INTO entity_review_flags (entity_id, canonical_name, entity_type, comment, status, updated_at)
         VALUES (?, ?, ?, ?, 'open', datetime('now'))
         ON CONFLICT(canonical_name, entity_type) DO UPDATE SET
           comment=excluded.comment, entity_id=excluded.entity_id, status='open', updated_at=datetime('now')`,
        [entityId ?? null, canonicalName, entityType, comment ?? '']
      );
    } else {
      await query(`UPDATE entity_review_flags SET status='cleared', updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?`, [canonicalName, entityType]);
    }
    return { ok: true };
  });
}
