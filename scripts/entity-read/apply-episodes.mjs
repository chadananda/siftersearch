// EPISODE application (phase 2) — resolve each extracted episode's participants to entity ids and attach the
// episode to every resolved participant as a connection, stored in research_notes.episodes (SEPARATE from facts2 so
// it survives facts2 regeneration). Each stored connection: {slug, name, place, when, role, statement, quote (a
// verbatim span naming the person), source, paraId, url, co} where co = the other named participants. This makes
// "who met Bahá'u'lláh" a roster lookup over a real shared event. Reversible: stored under one key; WRITE clears it.
// Run ON tower-nas. Env: IN=/home/chad/sifter/episodes-db.json WRITE=1 MAXROSTER=20
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'node:fs';
const { query, queryAll } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const IN = process.env.IN || '/home/chad/sifter/episodes-db.json';
const MAXROSTER = Number(process.env.MAXROSTER || 20);  // skip catch-all "episodes" with huge rosters (over-broad headings)
const clean = (t) => String(t || '').replace(/\[\^[^\]]*\]/g, '').replace(/\[pg[^\]]*\]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim();
const HON = /\b(mírzá|mirza|mullá|mulla|siyyid|sayyid|ḥájí|haji|hájí|shaykh|s_hayḵh|sheikh|áqá|aqa|khán|khan|khánum|jináb|jinab|surnamed|the|mír|mir|ustád|hadrat|jenab|hájí)\b/gi;
const norm = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"]/g, '').toLowerCase().replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();
const key = (s) => { let n = ' ' + norm(s) + ' '; n = n.replace(HON, ' ').replace(/\s+/g, ' ').trim(); return n; };
const slugify = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// build resolver: normalized name/alias -> set of entity ids (person, grounded cast)
const people = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.aliases, er.research_notes
  FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person' AND ge.religion=''`);
const idx = new Map(); const byId = new Map();
for (const p of people) {
  byId.set(p.id, p);
  let aliases = []; try { aliases = JSON.parse(p.aliases || '[]'); } catch {}
  for (const nm of [p.cn, ...aliases]) { const k = key(nm); if (!k || k.length < 3) continue; if (!idx.has(k)) idx.set(k, new Set()); idx.get(k).add(p.id); }
}
const resolve = (name) => { const k = key(name); const s = idx.get(k); if (s && s.size === 1) return [...s][0]; return null; };  // unique match only (precision)

const eps = JSON.parse(readFileSync(IN, 'utf8'));
// fetch all episode paragraph texts (for verbatim proof spans)
const allPids = [...new Set(eps.flatMap((e) => e.paraIds || []))];
const txt = new Map();
for (let i = 0; i < allPids.length; i += 400) {
  const chunk = allPids.slice(i, i + 400);
  for (const r of await queryAll(`SELECT external_para_id pid, doc_id, text, (SELECT source_url FROM docs WHERE id=content.doc_id) url FROM content WHERE external_para_id IN (${chunk.map(() => '?').join(',')}) AND doc_id IN (21308,21310,57347)`, chunk)) txt.set(r.pid, { ct: clean(r.text), url: r.url, doc: r.doc_id });
}
const sentWith = (pids, name) => {  // a verbatim sentence from the episode passages that names this participant
  const nk = key(name).split(' ').filter((w) => w.length > 3);
  for (const pid of pids) { const t = txt.get(pid); if (!t) continue;
    for (const s of t.ct.split(/(?<=[.!?”’])\s+/)) { const sk = key(s); if (nk.length && nk.every((w) => sk.includes(w))) return { q: clean(s).slice(0, 300), pid, url: t.url }; } }
  for (const pid of pids) { const t = txt.get(pid); if (t) return { q: '', pid, url: t.url }; }   // fallback: cite the paragraph, no span
  return { q: '', pid: null, url: null };
};

const add = new Map();  // entity_id -> [connection,...]
let resolved = 0, unresolved = 0, skipped = 0;
const unres = new Map();
for (const e of eps) {
  if (!e.participants || e.participants.length > MAXROSTER) { skipped++; continue; }
  const slug = slugify(e.name);
  const roster = e.participants.map((p) => ({ ...p, id: resolve(p.name) }));
  for (const p of roster) {
    if (!p.id) { unresolved++; unres.set(key(p.name), (unres.get(key(p.name)) || 0) + 1); continue; }
    resolved++;
    const co = roster.filter((q) => q.name !== p.name).map((q) => q.name).slice(0, 12);
    const pv = sentWith(e.paraIds || [], p.name);
    const statement = clean(`${p.name} ${p.role || 'took part in ' + e.name}`).replace(/\s+/g, ' ');
    if (!add.has(p.id)) add.set(p.id, []);
    add.get(p.id).push({ slug, name: e.name, place: e.place || null, when: e.when || null, role: clean(p.role || ''),
      statement, quote: pv.q, source: e.source, paraId: pv.pid, url: pv.url && pv.pid ? `${pv.url}?paraId=${pv.pid}` : null, co });
  }
}
console.error(`episodes: ${eps.length} (skipped ${skipped} over-broad) · resolved ${resolved} participant-roles to ${add.size} persons · ${unresolved} unresolved`);
const topUn = [...unres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
console.error('top unresolved names: ' + topUn.map(([n, c]) => `${n}(${c})`).join(', '));

let wrote = 0;
for (const [id, conns] of add) {
  const p = byId.get(id); let notes = {}; try { notes = JSON.parse(p.research_notes || '{}'); } catch {}
  // dedup by slug
  const bySlug = new Map(); for (const c of conns) if (!bySlug.has(c.slug)) bySlug.set(c.slug, c);
  notes.episodes = [...bySlug.values()];
  if (WRITE) { await query(`UPDATE entity_research SET research_notes=?, updated_at=CURRENT_TIMESTAMP WHERE canonical_name=?`, [JSON.stringify(notes), p.cn]); wrote++; }
}
console.log(`${WRITE ? 'APPLIED' : 'DRY'} — ${add.size} persons given episode connections${WRITE ? ' (' + wrote + ' written)' : ''}`);
// show the Bahá'u'lláh-connected Letters as a spot check
for (const nm of ['Quddús', 'Ṭáhirih', 'Mullá Báqir-i-Tabrízí', 'Mullá Ḥusayn']) {
  const id = resolve(nm); if (!id) { console.log(`  ${nm}: UNRESOLVED`); continue; }
  const cs = add.get(id) || []; console.log(`  ${nm} (${cs.length}): ${cs.map((c) => c.name).slice(0, 8).join(' · ')}`);
}
process.exit(0);
