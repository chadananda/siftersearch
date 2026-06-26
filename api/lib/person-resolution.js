// Person resolution + reconciliation layer (master-data). EVERY entity add flows through this, so dedup, alias-
// learning, and split/merge detection are intrinsic — not re-implemented per ingestion script. As we refine across
// thousands of books, resolve-or-create + the split/merge backlog are the continuous maintenance loop.
//
//   buildIndex(people)        — one-time index of existing entities (canonical, aliases, folded tokens, kin, origin, importance)
//   resolve(index, candidate) — { action:'resolved'|'create'|'ambiguous', id?, confidence, matchedBy, learnAliases[], splitFlag? }
//   mergeCandidates(index)    — entity pairs that look like the same person (alias/kin overlap) for adjudication
//
// candidate = { names:[surface forms], origin?, nisba?, kin?:[{relation,who}], era?, roles?:[], importance? }

const HON = new Set(['mirza', 'mulla', 'siyyid', 'sayyid', 'haji', 'shaykh', 'aqa', 'khan', 'khanum', 'mir', 'the', 'son', 'of', 'and', 'his', 'her', 'karbilai', 'mashhadi', 'aqay', 'jinab', 'ustad', 'hajji']);
export const nkey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”]/g, '').toLowerCase().replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, '');
// transliteration-tolerant tokens (Marághihí≈Marághi'í; collapse doubled letters + fold trailing -ih/-iy/-i/-y)
export const toks = (s) => nkey(s).replace(/(.)\1+/g, '$1').split(/[ -]/).map((w) => w.replace(/(ih|iy|i|y)$/, 'i')).filter((w) => w.length >= 4 && !HON.has(w));
// strip parentheticals + appositive/relational descriptors → the core name (so "the Báb (Siyyid ‘Alí-Muḥammad)" → "the Báb")
export const coreName = (s) => String(s || '').replace(/\s*\([^)]*\)/g, '').replace(/,\s*(?:son|brother|father|sister|wife|nephew|uncle|daughter|mother|the|one of|companion|imám|known|surnamed|originally|as a child|image)\b.*$/i, '').replace(/\s+/g, ' ').trim() || String(s || '').trim();
const NISBA = (s) => [...String(s).matchAll(/[-y]i-([A-ZÁÉÍÓÚÀ-ÿ][A-Za-zÀ-ÿ’'-]{3,})/g)].map((m) => nkey(m[1]));

export function buildIndex(people) {
  const byId = new Map(), canon = new Map(), alias = new Map(), tokIdx = [];
  for (const p of people) {
    let aliases = []; try { aliases = JSON.parse(p.aliases || '[]'); } catch {}
    let kin = []; try { kin = JSON.parse(p.kinship || '[]'); } catch {}
    const forms = [p.cn, ...aliases];
    const tset = new Set(); for (const f of forms) for (const t of toks(f)) tset.add(t);
    const nis = new Set(forms.flatMap(NISBA));
    const rec = { id: p.id, cn: p.cn, imp: p.imp || 0, aliasKeys: new Set(forms.map(nkey)), tokens: tset, nisbas: nis, origin: nkey(p.origin || ''), kin };
    byId.set(p.id, rec);
    (canon.get(nkey(p.cn)) || canon.set(nkey(p.cn), new Set()).get(nkey(p.cn))).add(p.id);
    for (const f of forms) { const k = nkey(f); if (k.length >= 4) (alias.get(k) || alias.set(k, new Set()).get(k)).add(p.id); }
    tokIdx.push(rec);
  }
  return { byId, canon, alias, tokIdx };
}

// record a newly-seen surface form on an entity so the graph self-heals (next occurrence of this form resolves)
export function learnAlias(idx, id, name) {
  const rec = idx.byId.get(id); if (!rec) return; const k = nkey(name); if (!k || rec.aliasKeys.has(k)) return;
  rec.aliasKeys.add(k); for (const t of toks(name)) rec.tokens.add(t); for (const n of NISBA(name)) rec.nisbas.add(n);
  (idx.alias.get(k) || idx.alias.set(k, new Set()).get(k)).add(id);
}
const dominant = (idx, ids) => { const r = ids.map((id) => ({ id, imp: idx.byId.get(id)?.imp || 0 })).sort((a, b) => b.imp - a.imp); return r[0].imp > 0 && r[0].imp > (r[1]?.imp || 0) ? r[0].id : null; };
const learn = (idx, id, names) => names.map(coreName).filter((n) => n && !idx.byId.get(id)?.aliasKeys.has(nkey(n)));
// does this match's identity contradict the candidate (→ the match may be wrong OR the entity conflates two people)?
const splitFlag = (rec, cand) => { const cn = (cand.nisba ? [nkey(cand.nisba)] : []).concat(cand.names.flatMap(NISBA)); if (cn.length && rec.nisbas.size && !cn.some((x) => rec.nisbas.has(x))) return `nisba mismatch: candidate ${cn.join('/')} vs entity ${[...rec.nisbas].join('/')}`; return null; };

export function resolve(idx, cand) {
  const names = (cand.names || []).map((n) => n).filter(Boolean);
  const cores = [...new Set(names.flatMap((n) => [n, coreName(n)]))];
  // 1) exact canonical (core) match
  for (const n of cores) { const s = idx.canon.get(nkey(n)); if (s) { const ids = [...s]; const id = ids.length === 1 ? ids[0] : dominant(idx, ids); if (id) return { action: 'resolved', id, confidence: 0.97, matchedBy: 'canonical', learnAliases: learn(idx, id, names), splitFlag: splitFlag(idx.byId.get(id), cand) }; } }
  // 2) exact alias match (unique)
  for (const n of cores) { const s = idx.alias.get(nkey(n)); if (s && s.size === 1) { const id = [...s][0]; return { action: 'resolved', id, confidence: 0.9, matchedBy: 'alias', learnAliases: learn(idx, id, names), splitFlag: splitFlag(idx.byId.get(id), cand) }; } }
  // 3) transliteration-fold token subset (≥2 distinctive tokens), context-disambiguated
  const ct = [...new Set(cores.flatMap(toks))];
  if (ct.length >= 2) {
    let hits = idx.tokIdx.filter((r) => ct.every((w) => r.tokens.has(w)));
    if (hits.length > 1) {  // disambiguate by origin / kin / nisba
      const oc = nkey(cand.origin || ''); const kc = (cand.kin || []).map((k) => nkey(k.who));
      const scored = hits.map((r) => ({ r, s: (oc && r.origin && (r.origin.includes(oc) || oc.includes(r.origin)) ? 2 : 0) + r.kin.filter((k) => kc.includes(nkey(k.who))).length }));
      const best = scored.sort((a, b) => b.s - a.s); if (best[0].s > 0 && best[0].s > (best[1]?.s || 0)) hits = [best[0].r];
    }
    if (hits.length === 1) { const id = hits[0].id; return { action: 'resolved', id, confidence: 0.8, matchedBy: 'token-subset', learnAliases: learn(idx, id, names), splitFlag: splitFlag(hits[0], cand) }; }
    if (hits.length > 1) return { action: 'ambiguous', candidates: hits.map((h) => h.id), confidence: 0.4, matchedBy: 'token-subset' };
  }
  return { action: 'create', confidence: 0 };
}

// reconciliation: entity pairs that share a strong alias OR ≥2 distinctive tokens + overlapping kin → likely same person
export function mergeCandidates(idx) {
  const pairs = []; const seen = new Set();
  for (const [k, ids] of idx.alias) { if (ids.size > 1) { const a = [...ids]; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) { const key = a[i] + ':' + a[j]; if (!seen.has(key)) { seen.add(key); pairs.push({ a: a[i], b: a[j], shared: k, reason: 'shared alias' }); } } } }
  return pairs;
}
