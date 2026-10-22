// NAME AND WORK LINKS in transcripts (Chad 10-22: "when a historical person is mentioned … link the name to their
// /biography/<id> page"; "when books are mentioned, link the text to the book in OceanLibrary"). The copy-edit pass already
// returns MENTIONS (the words as spoken, kind person|work, the model's canonical name/title, a section if one is named, a
// confidence). Here each is resolved through our own layers — people against the biography set (names + aliases, then the
// identity lookup index), works through the document finder by title variants (Dewey's rules) and the section index —
// and linked only on a confident, unambiguous resolution, the FIRST mention per section (subheader) only. The mention
// text itself is the anchor. Pure; lookups injected.
import { keyOf } from './vocab.js';

export const MIN_CONF = 0.8;
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘'ʼ`]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The section (index of the subheader at or before the paragraph) a paragraph belongs to. */
export const sectionOf = (headings = [], p) => headings.filter((h) => h.p <= p).length;

/** First mention per (section, kind, canonical) — in transcript order. */
export function firstPerSection(mentions, headings = []) {
  const seen = new Set();
  return [...mentions].sort((a, b) => a.para - b.para || a.i0 - b.i0).filter((m) => {
    const k = `${sectionOf(headings, m.para)}|${m.kind}|${keyOf(m.canonical || m.text)}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

/** The biography set as a name index: key(name or alias) → [ids]. bio: [{ id, name, aliases }] (aliases: array or JSON). */
export function bioIndex(bio = []) {
  const idx = new Map();
  const add = (k, id) => { if (!k || k.length < 3) return; if (!idx.has(k)) idx.set(k, new Set()); idx.get(k).add(id); };
  for (const p of bio) {
    let al = p.aliases; if (typeof al === 'string') { try { al = JSON.parse(al); } catch { al = []; } }
    for (const n of [p.name, ...(Array.isArray(al) ? al : [])]) add(keyOf(typeof n === 'string' ? n : n?.name), p.id);
  }
  return { idx, byId: new Map(bio.map((p) => [p.id, p])) };
}

/** A person mention → { entity_id, name, basis } or { why }. lookup(name) → [{ id, canonical_match, shared_keys }]. */
export async function resolvePerson(m, { index, lookup = null }) {
  const names = [m.canonical, m.text].filter(Boolean);
  for (const n of names) {
    const ids = index.idx.get(keyOf(n));
    if (ids?.size === 1) { const id = [...ids][0]; return { entity_id: id, name: index.byId.get(id)?.name, basis: 'name' }; }
    if (ids?.size > 1) return { why: `ambiguous name (${ids.size} people)` };
  }
  if (lookup && m.canonical) {
    const hits = (await lookup(m.canonical)).filter((h) => index.byId.has(h.id) && (h.canonical_match || h.shared_keys >= 2));
    if (hits.length === 1) return { entity_id: hits[0].id, name: index.byId.get(hits[0].id)?.name, basis: 'lookup' };
    if (hits.length > 1) return { why: `ambiguous lookup (${hits.length})` };
  }
  return { why: 'no biography page' };
}

/** Title variants a work is searched under (as Dewey's holdings check: as given, main title, the bracketed one, bare). */
export function titleVariants(t) {
  const raw = String(t || '').trim();
  const main = raw.split(/\s*[:;(\[—]\s*/)[0];
  const alt = (raw.match(/\(([^)]{4,})\)/) || [])[1];
  const bare = main.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^(?:the|a|an)\s+/i, '');
  return [...new Set([raw, main, alt, bare].filter((x) => x && x.length >= 3))];
}
const mainKey = (t) => fold(String(t || '').split(/\s*(?:[:;(\[—]|,?\s+vol(?:ume)?\.?\s*\d)/i)[0]).replace(/^(?:the|a|an)\s+/, '');

/**
 * A work mention → { doc, section?, basis } or { why }. find(text) → docs [{ id, title, author, source_site, … }] (the
 * document finder); sections(text) → [{ doc_id, title, start_index, first_para_id }]. A doc matches when its main title is
 * one of the work's title variants; among matches the OceanLibrary copy wins, then the one by the named author.
 */
export async function resolveWork(m, { find, sections = null }) {
  const want = new Set([...titleVariants(m.canonical), m.text].filter(Boolean).map(mainKey).filter((k) => k.length >= 3));
  const seen = new Map();
  for (const v of titleVariants(m.canonical || m.text)) for (const d of (await find(v)) || []) if (!seen.has(d.id)) seen.set(d.id, d);
  const hits = [...seen.values()].filter((d) => want.has(mainKey(d.title)));
  if (!hits.length) return { why: 'no held copy by that title' };
  const ol = (d) => (d.source_site === 'oceanlibrary.com' || /oceanlibrary\.com/.test(d.source_url || '') ? 0 : 1);
  const en = (d) => (/^en/i.test(d.language || 'en') ? 0 : 1);   // a talk in English links the English copy first
  hits.sort((a, b) => ol(a) - ol(b) || en(a) - en(b) || (b.paragraph_count || 0) - (a.paragraph_count || 0));
  const doc = hits[0];
  let section = null;
  if (m.section && sections) section = ((await sections(`${m.section}`)) || []).find((s) => s.doc_id === doc.id) || null;
  return { doc, section, basis: hits.length > 1 ? `title (${hits.length} copies, ${ol(doc) ? 'best' : 'OceanLibrary'} chosen)` : 'title' };
}

/**
 * Resolve and select. → { links: [{ kind, para, i0, i1, text, entity_id|doc_id, section, url, confidence, basis }], unresolved }
 * deps: { bio: [...], lookup, find, sections, linkFor(doc, paragraphIndex) → { url } }
 */
export async function linkMentions(mentions, headings, deps, { minConf = MIN_CONF } = {}) {
  const index = bioIndex(deps.bio || []);
  const links = [], unresolved = [];
  const cache = new Map();
  for (const m of firstPerSection((mentions || []).filter((x) => x && x.text), headings)) {
    if ((m.confidence ?? 0) < minConf) { unresolved.push({ ...m, why: `low confidence (${m.confidence})` }); continue; }
    const key = `${m.kind}|${keyOf(m.canonical || m.text)}|${m.section || ''}`;
    if (!cache.has(key)) cache.set(key, m.kind === 'person' ? await resolvePerson(m, { index, lookup: deps.lookup }) : await resolveWork(m, deps));
    const r = cache.get(key);
    if (r.why) { unresolved.push({ ...m, why: r.why }); continue; }
    const base = { kind: m.kind, para: m.para, i0: m.i0, i1: m.i1, text: m.text, confidence: m.confidence, basis: r.basis };
    if (m.kind === 'person') links.push({ ...base, entity_id: r.entity_id, name: r.name, url: `/biography/${r.entity_id}` });
    else {
      const sec = r.section;
      const url = deps.linkFor(sec ? { ...r.doc, external_para_id: sec.first_para_id ?? r.doc.external_para_id } : r.doc, sec ? sec.start_index : undefined)?.url;
      if (!url) { unresolved.push({ ...m, why: 'no link for the copy' }); continue; }
      links.push({ ...base, doc_id: r.doc.id, title: r.doc.title, section: sec ? sec.title : null, url });
    }
  }
  return { links, unresolved };
}

/** Quotes and links for one paragraph as non-overlapping spans (a quote wins over a link on the same words). */
export function spansOf(n, quotes = [], links = []) {
  const qs = quotes.filter((q) => q.para === n && q.url).map((q) => ({ ...q, kind: 'quote' }));
  const ls = links.filter((l) => l.para === n && l.url && !qs.some((q) => l.i0 < q.i1 && q.i0 < l.i1));
  return [...qs, ...ls].sort((a, b) => a.i0 - b.i0);
}
