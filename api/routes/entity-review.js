// Entity review page — LIVE-BUILDS from the DB on every request (no cache).
// For manual review of the Dawn-Breakers (21308) + GPB (21310) entity graph.
// Tabs per entity_type; within each, sections per DB chapter (heading) listing entities
// FIRST INTRODUCED in that chapter (earliest mention, no repetition); each entity is a
// collapsible record (description, aliases, mention count, side/era, citations sample).
// Gated by the internal key (?key=... or X-Admin-Key header).
// Route: GET /api/admin/entity-review  →  served by api/server.js (prefix /api/admin)
// Deps: db.js (query/queryAll = sifter.db; graphQueryAll = graph.db sidecar).

import { query, queryAll, graphQueryAll, userQueryOne } from '../lib/db.js';
import { requireAdmin, verifyRefreshToken } from '../lib/auth.js';

const REFRESH_COOKIE = 'refresh_token';

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
// The Dawn-Breakers (doc 21308) chapter map. This edition doesn't mark chapters uniformly (only a
// few survived as ALL-CAPS headings), so boundaries are anchored to the document's own structural
// headings, aligned to Nabíl's published chapter sequence. Ranges are contiguous over idx 0–2081.
const DB_CHAPTERS = [
  { title: 'Introduction by George Townshend', start: 0, end: 89 },
  { title: "Nabíl's Preface; the Mission of S̱hayḵh Aḥmad-i-Aḥsá'í", start: 90, end: 129 },
  { title: 'The Mission of Siyyid Káẓim-i-Rashtí', start: 130, end: 155 },
  { title: "The Declaration of the Báb's Mission", start: 156, end: 229 },
  { title: "Mullá Ḥusayn's Journey to Ṭihrán", start: 230, end: 284 },
  { title: "The Báb's Pilgrimage to Mecca and Medina", start: 285, end: 346 },
  { title: 'The Spread of the Faith; the Conversion of Vaḥíd and Ḥujjat', start: 347, end: 406 },
  { title: "The Báb's Residence in Iṣfahán", start: 407, end: 430 },
  { title: "The Báb's Journey to Ádhirbáyján and Confinement at Máh-Kú", start: 431, end: 501 },
  { title: 'Ṭáhirih and the Conference of Badas̱ht', start: 502, end: 568 },
  { title: "The Báb's Incarceration in the Castle of C̱hihríq", start: 569, end: 608 },
  { title: 'The Mázindarán Upheaval (S̱hayḵh Ṭabarsí)', start: 609, end: 715 },
  { title: 'The Mázindarán Upheaval (Continued)', start: 716, end: 976 },
  { title: 'The Execution of the Seven Martyrs of Ṭihrán', start: 977, end: 1046 },
  { title: 'The Nayríz Upheaval', start: 1047, end: 1123 },
  { title: 'The Martyrdom of the Báb', start: 1124, end: 1170 },
  { title: 'The Zanján Upheaval', start: 1171, end: 1287 },
  { title: "Bahá'u'lláh's Journey to Karbilá", start: 1288, end: 1312 },
  { title: "Attempt on the S̱háh's Life, and its Consequences", start: 1313, end: 1407 },
  { title: 'Epilogue by Shoghi Effendi', start: 1408, end: 1475 },
  { title: 'Notes and Appendices', start: 1476, end: 100000 },
];
const dbChapter = (idx) => DB_CHAPTERS.find(c => idx >= c.start && idx <= c.end) || null;
// Book provenance: which source each mention comes from. Grows as more books are processed.
const BOOK_LABEL = { 21310: 'GPB', 21308: 'DB' };
const bookLabel = (id) => BOOK_LABEL[id] || ('#' + id);
// Processing order of books (GPB is the core seed, processed first; later books resolve against it).
const BOOK_ORDER = { 21310: 1, 21308: 2 };
const bookOrder = (id) => (BOOK_ORDER[id] != null ? BOOK_ORDER[id] : 99);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function buildModel() {
  // 1. all entities (sifter.db)
  const entities = await queryAll(`SELECT id, canonical_name, entity_type, religion, era, description, name_meaning, significance, research_notes FROM graph_entities ORDER BY canonical_name`);
  const byId = new Map(entities.map(e => [Number(e.id), { ...e, id: Number(e.id), aliases: [], relations: [], mentions: 0, firstDoc: null, firstHeading: null, firstIdx: Infinity, books: new Set() }]));

  // 2. display aliases — from the CURATED entity_research.aliases (genuinely distinct names/titles +
  // native-script spelling), NOT graph.db entity_aliases which holds ALL resolution surfaces
  // (transliteration variants, honorific/nisba partials) kept rich for matching but not for display.
  const erRows = await queryAll(`SELECT canonical_name, entity_type, aliases FROM entity_research`);
  const erAliasMap = new Map(erRows.map(r => [`${r.canonical_name}|${r.entity_type}`, r.aliases]));
  for (const e of byId.values()) {
    const raw = erAliasMap.get(`${e.canonical_name}|${e.entity_type || 'unknown'}`);
    if (!raw) continue;
    try { for (const a of JSON.parse(raw)) if (a && a !== e.canonical_name && !e.aliases.includes(a)) e.aliases.push(a); } catch { /* skip */ }
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
    if (c.doc_id != null) e.books.add(c.doc_id);
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

function render(ents, { embed = false } = {}) {
  const types = [...new Set(ents.map(e => e.entity_type || 'unknown'))].sort((a, b) => {
    const order = ['person', 'work', 'place', 'event', 'organization', 'concept', 'title', 'period'];
    return (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99);
  });
  const tabBtns = types.map((t, i) => `<button class="tab${i === 0 ? ' active' : ''}" onclick="showTab('${esc(t)}')" id="tab-${esc(t)}">${esc(t)} (${ents.filter(e => (e.entity_type || 'unknown') === t).length})</button>`).join('');

  // Per book, count the NEW people it introduced (a person's "introducing book" = its lowest-order book).
  const newByBook = {};
  for (const e of ents) { if (e.entity_type !== 'person' || !e.books.size) continue; const lab = bookLabel([...e.books].sort((a, b) => bookOrder(a) - bookOrder(b))[0]); newByBook[lab] = (newByBook[lab] || 0) + 1; }
  const booksOrdered = [...new Set(ents.flatMap(e => [...e.books]))].sort((a, b) => bookOrder(a) - bookOrder(b)).map(bookLabel);
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
        const ch = dbChapter(e.firstIdx);
        key = ch ? 'd' + ch.start : 'dbnone';
        label = ch ? `The Dawn-Breakers · ${ch.title}` : 'The Dawn-Breakers (not yet chapter-mapped)';
        // offset DB chapters past all GPB chapters so the combined "All" view shows them as a block
        // after GPB (in DB-paragraph order) rather than interleaving by raw paragraph number.
        order = 1e6 + (ch ? ch.start : 9e5);
      } else { key = 'none'; label = 'Not yet linked to a chapter'; order = 9e9; }
      if (!groups.has(key)) groups.set(key, { label, order, list: [] });
      groups.get(key).list.push(e);
    }
    const ordered = [...groups.values()].sort((a, b) => a.order - b.order);
    const body = ordered.map(g => {
      const title = esc(g.label);
      const items = g.list.sort((a, b) => a.canonical_name.localeCompare(b.canonical_name)).map(e => `
        <details class="ent" data-books="${[...e.books].map(bookLabel).join(' ')}"><summary>${[...e.books].map(bookLabel).filter(b => b !== 'GPB').map(b => `<span class="bk">${esc(b)}</span> `).join('')}${esc(e.canonical_name)}${e.name_meaning ? ` <span class="meaning">— “${esc(e.name_meaning)}”</span>` : ''}${e.significance === 'incidental' ? ' <span class="incid">· incidental</span>' : ''} <span class="meta">· ${e.mentions} mention${e.mentions === 1 ? '' : 's'}${e.firstHeading ? ' · § ' + esc(e.firstHeading) : ''}${e.religion ? ' · ' + esc(e.religion) : ''}${e.era ? ' · ' + esc(e.era) : ''}</span></summary>
          <div class="rec">
            ${e.description ? `<p class="desc">${esc(e.description)}</p>` : '<p class="nodesc">(no description yet)</p>'}
            ${e.aliases.length ? `<p class="al"><b>Aliases:</b> ${e.aliases.map(esc).join(' · ')}</p>` : ''}
            ${e.relations.length ? `<p class="rel"><b>Relationships:</b> ${e.relations.map(r => esc(r.type) + ' → ' + esc(r.target)).join(' · ')}</p>` : ''}
            ${e.research_notes ? `<p class="notes"><b>Notes:</b> ${esc(e.research_notes)}</p>` : ''}
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

  // When embedded in the admin SSR page the fragment's <style> is injected globally, so the GENERIC
  // element selectors (body/header/main/h1) must be scoped to the #er-root container — otherwise they
  // override the admin theme (e.g. repaint the page body white, restyle the navbar/main). ROOT is the
  // base/background element; S prefixes the in-content element selectors.
  const ROOT = embed ? '#er-root' : 'body';
  const S = embed ? '#er-root ' : '';
  // When embedded in the admin panel, follow the admin THEME on screen (it may be dark) via its CSS
  // tokens — light values are only fallbacks for the standalone page. Print stays white (the @media
  // print block, below, wins because this is @media screen).
  const screenEmbed = embed ? `
@media screen{
  /* text + surfaces use the admin theme tokens so contrast is whatever the theme guarantees
     (readable in light OR dark); interactive controls get a BRIGHT accent when active so the
     current selection is unmistakable, plus a hover state for affordance. */
  #er-root{background:transparent;color:var(--text-primary,#1a1a1a)}
  #er-root header{background:var(--surface-1,#fff);border-bottom:1px solid var(--border-default,#ddd)}
  #er-root h1{color:var(--text-primary,#1a1a1a)}
  #er-root .chap h3{color:var(--text-primary,#222);border-bottom-color:var(--border-default,#e5e5e5)}
  #er-root .cnt,#er-root .bfhint,#er-root .meta,#er-root .nodesc,#er-root .incid{color:var(--text-muted,#888)}
  #er-root .ent{background:var(--surface-2,#fff);border:1px solid var(--border-default,#e5e5e5)}
  #er-root .ent summary{color:var(--text-primary,#1a1a1a)}
  #er-root .desc,#er-root .al,#er-root .rel,#er-root .notes{color:var(--text-secondary,#444)}
  #er-root .meaning{color:var(--accent-primary,#a36)}
  #er-root .tab{background:var(--surface-1,#f0f0f0);border:1px solid var(--border-default,#ccc);color:var(--text-secondary,#333)}
  #er-root .tab:hover{background:var(--surface-3,#e8e8e8)}
  #er-root .tab.active{background:var(--accent-primary,#2563eb);border-color:var(--accent-primary,#2563eb);color:#fff}
  #er-root .bf{background:transparent;border:1px solid var(--border-default,#ccc);color:var(--text-secondary,#666)}
  #er-root .bf:hover{background:var(--surface-2,#eee)}
  #er-root .bf.active{background:var(--accent-primary,#2563eb);border-color:var(--accent-primary,#2563eb);color:#fff}
  #er-root .bf.active .newc{color:#fff}
  #er-root .flagbox textarea{background:var(--surface-0,#fffdf5);color:var(--text-primary,#1a1a1a);border-color:var(--border-default,#e0c98a)}
}` : '';
  const STYLE = `
${ROOT}{font:15px/1.5 -apple-system,Segoe UI,sans-serif;margin:0;background:#f7f7f8;color:#1a1a1a}
${S}header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:10px 16px;z-index:10}
${S}h1{font-size:18px;margin:0 0 8px}
.tabs{display:flex;flex-wrap:wrap;gap:4px}
.tab{padding:6px 12px;border:1px solid #ccc;background:#f0f0f0;border-radius:6px;cursor:pointer;font-size:13px}
.tab.active{background:#2563eb;color:#fff;border-color:#2563eb}
${S}main{padding:16px;max-width:980px;margin:0 auto}
.chap{margin:0 0 20px}
.chap h3{font-size:14px;color:#444;border-bottom:2px solid #e5e5e5;padding-bottom:4px;margin:18px 0 8px}
.cnt{color:#999;font-weight:normal}
.ent{background:#fff;border:1px solid #e5e5e5;border-radius:6px;margin:4px 0;padding:6px 10px}
.ent summary{cursor:pointer;font-weight:600}
.meta{color:#888;font-weight:normal;font-size:13px}
.meaning{color:#a36;font-weight:normal;font-size:14px;font-style:italic}
.incid{color:#aaa;font-weight:normal;font-size:12px;font-style:italic}
.bookfilter{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:8px;font-size:12px;color:#666}
.bf{padding:3px 10px;border:1px solid #ccc;background:#f5f5f5;border-radius:5px;cursor:pointer;font-size:12px}
.bf.active{background:#444;color:#fff;border-color:#444}
.bfhint{color:#aaa;font-size:11px;margin-left:6px}
.bks{display:inline-flex;gap:3px;vertical-align:middle}
.bk{display:inline-block;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:#e3edff;color:#1b4ea0;letter-spacing:.3px}
.newc{font-weight:700;color:#1b4ea0}
.bf.active .newc{color:#fff}
.rec{padding:8px 4px 2px}
.desc{margin:4px 0;color:#333}
.nodesc{color:#bbb;font-style:italic;margin:4px 0}
.al{font-size:13px;color:#555;margin:4px 0}
.rel{font-size:13px;color:#3b6;margin:4px 0}
.notes{font-size:13px;color:#615;margin:4px 0}
.printhead{display:none}
@media print{
  /* hide all page chrome — print ONLY the entity content for the active tab + book filter.
     The active typesec is display:block (inline) and inactive ones display:none, so we leave
     .typesec display alone; likewise book-filtered entities already carry inline display:none. */
  header,.tabs,.bookfilter,.flagwrap,.id,.er-bar{display:none !important}
  /* print each entity's full record (description, aliases, relationships, notes), not just the
     title — details are forced open by beforeprint JS — but clamp to ~20 lines so one long entry
     can't dominate a column. */
  .ent>.rec{display:-webkit-box !important;-webkit-box-orient:vertical;-webkit-line-clamp:20;line-clamp:20;overflow:hidden}
  .printhead{display:block;column-span:all;font:bold 12px/1.3 Georgia,serif;color:#000;margin:28px 0 10px;padding-bottom:4px;border-bottom:2px solid #000}
  ${embed ? '#er-root' : 'html,body'}{background:#fff !important}
  ${ROOT}{color:#000;font:9px/1.25 Georgia,serif}
  ${S}main{max-width:none;margin:0;padding:0 0.25in;column-count:2;column-gap:16px;box-sizing:border-box}
  .chap h3{font-size:10px;margin:6px 0 2px;break-after:avoid;color:#000;border-bottom:1px solid #999}
  .ent{border:none;background:none;margin:0 0 2px;padding:0;break-inside:avoid}
  .ent summary{font-weight:700;list-style:none}
  .rec{padding:0 0 0 7px}
  .desc,.al,.rel,.notes{font-size:8.5px;margin:1px 0;color:#000}
  .meta,.meaning,.incid{font-size:8px;color:#333}
  @page{margin:0.4in;size:letter portrait}
}
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
${screenEmbed}
`;
  const BODY = `
<header><h1>Entity Review — Dawn-Breakers + God Passes By <span style="font-weight:normal;color:#888;font-size:13px">· ${ents.length} entities · ${ents.filter(e => e.flagged).length} flagged · live from DB · ${new Date().toISOString()}</span></h1>
<div class="tabs">${tabBtns}</div>
<div class="bookfilter">Book: <button class="bf active" onclick="filterBook('all',this)">All</button>${booksOrdered.map(b => `<button class="bf" onclick="filterBook('${esc(b)}',this)">${esc(b)} <span class="newc">${newByBook[b] || 0}</span></button>`).join('')} <span class="bfhint">— number = new people that book adds; the filtered view is what prints</span></div></header>
<main><div class="printhead" id="printhead"></div>${sections}</main>`;
  const SCRIPT = `
var BOOKNAMES={all:'God Passes By + The Dawn-Breakers',GPB:'God Passes By',DB:'The Dawn-Breakers'};
var TYPEPLURAL={person:'persons',work:'works',place:'places',group:'groups',event:'events',organization:'organizations',concept:'concepts',title:'titles',period:'periods'};
var currentBook='all';
// Keep the print-only header in sync with what's actually selected on screen, e.g.
// "God Passes By, 540 persons" — book name + count of currently-visible entities of the active type.
function updatePrintHead(){
  var tab=document.querySelector('.tab.active'); var type=tab?tab.id.replace('tab-',''):'';
  var sec=document.getElementById('sec-'+type); var n=0;
  if(sec)sec.querySelectorAll('.ent').forEach(function(el){if(el.style.display!=='none')n++;});
  var word=TYPEPLURAL[type]||(type+'s'); if(n===1)word=word.replace(/s$/,'');
  document.getElementById('printhead').textContent=(BOOKNAMES[currentBook]||currentBook)+', '+n+' '+word;
}
function showTab(t){document.querySelectorAll('.typesec').forEach(s=>s.style.display='none');document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));document.getElementById('sec-'+t).style.display='block';document.getElementById('tab-'+t).classList.add('active');updatePrintHead();}
function filterBook(code,btn){
  currentBook=code;
  document.querySelectorAll('.bookfilter .bf').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  document.querySelectorAll('.ent').forEach(function(el){
    var bks=(el.getAttribute('data-books')||'').split(' ').filter(Boolean);
    var show = code==='all' ? true : bks.indexOf(code)>=0;
    el.style.display = show ? '' : 'none';
  });
  document.querySelectorAll('.chap').forEach(function(ch){
    var vis=false; ch.querySelectorAll('.ent').forEach(function(el){ if(el.style.display!=='none')vis=true; });
    ch.style.display = vis ? '' : 'none';
  });
  updatePrintHead();
}
updatePrintHead();
// Open every entity record before printing so its content (not just the title) prints — Chrome won't
// render a collapsed <details> from CSS alone. Restore the collapsed state afterward.
window.addEventListener('beforeprint',function(){document.querySelectorAll('details.ent:not([open])').forEach(function(d){d.setAttribute('data-reclose','1');d.open=true;});});
window.addEventListener('afterprint',function(){document.querySelectorAll('details.ent[data-reclose]').forEach(function(d){d.open=false;d.removeAttribute('data-reclose');});});
function fbox(id){return document.getElementById('fb-'+id);}
// reveal/hide the note box with the checkbox
document.addEventListener('change',function(e){
  if(!e.target.classList||!e.target.classList.contains('flagcb'))return;
  var id=e.target.dataset.id; var b=fbox(id); if(b)b.style.display=e.target.checked?'block':'none';
});
// Save the flag/note with a direct, credentialed POST. The refresh-token cookie authorizes the
// write (same origin when served standalone from the API; cross-origin with CORS when embedded on
// the edge — window.__ER_API_BASE is set by the host page in that case).
document.addEventListener('click',function(e){
  var btn=e.target.closest&&e.target.closest('button.flagsave'); if(!btn)return;
  var id=btn.dataset.id, b=fbox(id), cb=document.getElementById('fc-'+id);
  var st=b.querySelector('.saved'); st.textContent='saving…';
  fetch((window.__ER_API_BASE||'')+'/api/admin/entity-review/flag',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({entityId:Number(id),canonicalName:btn.dataset.name,entityType:btn.dataset.type,flagged:!!cb.checked,comment:b.querySelector('textarea').value})})
    .then(function(r){st.textContent=r.ok?'saved ✓':'error ✗';})
    .catch(function(){st.textContent='error ✗';});
});
`;
  if (embed) return `<style>${STYLE}</style>${BODY}<script>${SCRIPT}</script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Entity Review — Dawn-Breakers + GPB</title><style>${STYLE}</style></head><body>${BODY}<script>${SCRIPT}</script></body></html>`;
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
  // Auth (any one): internal key (cron/direct) · a valid admin SESSION via the refresh-token
  // cookie (forwarded by the SSR edge or sent by the browser with credentials) · admin Bearer JWT.
  // The session-cookie path is what lets the plain SSR /admin/entities page render without the
  // browser holding a token. Shared by the page + the flag write.
  const adminAuth = async (req, reply) => {
    const key = req.query?.key || req.headers['x-admin-key'];
    if (process.env.INTERNAL_API_KEY && key === process.env.INTERNAL_API_KEY) return;
    const tokenId = req.cookies?.[REFRESH_COOKIE];
    if (tokenId) {
      const token = await verifyRefreshToken(tokenId);
      if (token) {
        const u = await userQueryOne('SELECT tier FROM users WHERE id = ?', [token.user_id]);
        if (u && u.tier === 'admin') return;
      }
    }
    await requireAdmin(req, reply); // Bearer fallback; sends 401/403 otherwise
  };

  // Self-bootstrap the flag table at registration (write routes via the single-writer).
  try { await query(FLAG_DDL); } catch (e) { /* writer may be momentarily down; POST retries */ }

  server.get('/entity-review', { preHandler: adminAuth }, async (req, reply) => {
    const ents = await buildModel();
    reply.header('content-type', 'text/html; charset=utf-8').header('cache-control', 'no-store');
    const embed = req.query?.embed === '1' || req.query?.embed === 'true';
    return render(ents, { embed });
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
