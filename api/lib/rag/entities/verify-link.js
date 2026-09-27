// entities/verify-link — deterministic CONFLICT VETO for an identity link (record linkage: any conflicting exclusive
// attribute blocks a merge; absence of evidence is neutral). Pure, no ports. Facts are production-shaped claims:
// { statement: "<subject> — <relation> <object>", relation, when: year, basis: 'pin'|'estimate'|null }.
// Vetoes only on attributes a person has ONE of (nisba set, death year, lifespan, named parent) — and only when the
// claim's verbatim proof carries the value.
// Offices and allegiance are FLAGS (a man governs Zanján, later Shíráz; a Bábí becomes a Bahá'í) — never a veto.
// 2026-09-27 rewrite: the old gate read any name word ending in -í as a nisba (Ḥájí, ‘Alí, Mihdí), compared offices
// by whole statements INCLUDING the subject's name (vetoed "Mullá Ḥusayn" vs "Mullá Ḥusayn-i-Bushrú'í"), and never
// ran its kinship/death-place/side axes (it expected a relation vocabulary production does not use).

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ʼʻ'‘’`´]/g, '').toLowerCase();
const skeleton = (s) => fold(s).replace(/[^a-z]/g, '').replace(/[aeiouy]/g, '').replace(/(.)\1+/g, '$1');

// Given names and honorifics that END in -í but are not nisbas (a nisba names a place/tribe of origin).
const NOT_NISBA = new Set(['ali', 'aliy', 'mihdi', 'mahdi', 'taqi', 'naqi', 'hadi', 'vali', 'quli', 'haji', 'ghani', 'zaki', 'ruhi']);
// Honorifics and titles — never identity-bearing in a parent's name.
const HONORIFIC = new Set(['mirza', 'mulla', 'haji', 'hajj', 'siyyid', 'sayyid', 'shaykh', 'aqa', 'aqay', 'khan', 'karbilai', 'mashhadi', 'ustad', 'darvish', 'the', 'of', 'i', 'y']);

// Nisbas of a name: the parts of an iḍáfa chain after "-i-" that end in -í, plus a trailing standalone word ending in
// -í (not the first word, not a given name). "Mullá ‘Alíy-i-Basṭámí" → {bstm}; "Ḥájí Mírzá Ḥasan" → {}.
export function nisbas(name) {
  const out = new Set();
  const words = String(name || '').replace(/\([^)]*\)/g, ' ').split(/\s+/).filter(Boolean);
  words.forEach((w, wi) => {
    const parts = w.split(/-(?:i|yi|y)-/i);
    parts.forEach((p, pi) => {
      const f = fold(p).replace(/[^a-z]/g, '');
      if (!/i$/.test(f) || NOT_NISBA.has(f) || f.length < 4) return;
      if (pi > 0 || (wi > 0 && wi === words.length - 1 && parts.length === 1)) out.add(skeleton(f.replace(/i$/, '')));
    });
  });
  return out;
}

// The claim's object: text after "<subject> — <relation>". Bare statements (no dash) are all object.
export function objectOf(f) {
  const s = String(f.statement || '');
  const i = s.indexOf(' — ');
  if (i < 0) return s.replace(/^(son|daughter)\s+of\s+/i, '');
  const rest = s.slice(i + 3).trim();
  return f.relation && rest.toLowerCase().startsWith(f.relation.toLowerCase()) ? rest.slice(f.relation.length).trim() : rest;
}

// A year is a personal anchor when the paragraph stated it ('stated'; legacy 'pin'), not when it is the scene era.
const stated = (f) => f.basis !== 'estimate';
// PROVABLE: a fact vetoes only if its own verbatim proof carries the deciding value — the year, or a name of the
// parent. Measured 2026-09-27: "Ṣubḥ-i-Azal died 1853 / 1830" (he died 1912), "Laura Barney son-of Lady Blomfield",
// "Munírih Khánum son-of the subject (Nahrí family elder)" — misextracted claims were splitting one person into two.
const proofHasYear = (f, y) => String(f.proof ?? '').includes(String(y));
const KIN_CUE = /\b(son|daughter|child|children|father|mother|born|ibn|bint|zadih|pisar|dukhtar)\b/;
const proofNames = (f, name) => { const p = fold(f.proof ?? ''); return KIN_CUE.test(p) && fold(name).split(/[^a-z]+/).some((t) => t.length > 2 && !HONORIFIC.has(t) && p.includes(t)); };
const yearOf = (f) => { const m = String(f.when ?? '').match(/\b(1[0-9]{3})\b/); return m ? +m[1] : null; };
const DIED = new Set(['died', 'martyred', 'killed', 'executed']);
const isParentClaim = (f) => f.relation === 'son-of' || f.relation === 'daughter-of' || /^(son|daughter)\s+of\s+/i.test(String(f.statement || ''));
const nameTokens = (s) => new Set(fold(s).replace(/\([^)]*\)/g, ' ').split(/[^a-z]+/).filter((t) => t.length > 1 && !HONORIFIC.has(t)).map(skeleton).filter(Boolean));

function lifespan(facts) {
  let born = null, died = null;
  for (const f of facts) {
    const y = yearOf(f);
    if (y == null || !stated(f) || !proofHasYear(f, y)) continue;
    if (f.relation === 'born') born = y;
    if (DIED.has(f.relation)) died = y;
  }
  return { born, died };
}

export function verifyLink(cluster, candidate) {
  const cF = cluster.facts || [], eF = candidate.facts || [];
  const flags = [];
  // 1. nisba — both carry nisbas and share none
  const cn = nisbas(cluster.name), en = nisbas(candidate.name);
  if (cn.size && en.size && ![...cn].some((s) => en.has(s)))
    return { ok: false, axis: 'nisba', reason: `nisba conflict: ${[...cn]} vs ${[...en]} ('${cluster.name}' / '${candidate.name}')`, flags };
  // 2. lifespan + death — stated years only (a year copied from the scene's era is not a lifespan anchor); ±1 for calendar conversion
  const a = lifespan(cF), b = lifespan(eF);
  if ((a.born != null && b.died != null && a.born > b.died + 1) || (b.born != null && a.died != null && b.born > a.died + 1))
    return { ok: false, axis: 'era', reason: `impossible lifespan: born ${a.born ?? b.born} after death ${b.died ?? a.died}`, flags };
  if (a.died != null && b.died != null && Math.abs(a.died - b.died) > 1)
    return { ok: false, axis: 'death', reason: `death year conflict: ${a.died} vs ${b.died}`, flags };
  // 3. named parent — son-of/daughter-of objects share no identity-bearing name token
  const provenParent = (f) => isParentClaim(f) && proofNames(f, objectOf(f));
  for (const cp of cF.filter(provenParent)) for (const ep of eF.filter(provenParent)) {
    const x = nameTokens(objectOf(cp)), y = nameTokens(objectOf(ep));
    if (x.size && y.size && ![...x].some((t) => y.has(t)))
      return { ok: false, axis: 'kinship', reason: `parent conflict: '${objectOf(cp)}' vs '${objectOf(ep)}'`, flags };
  }
  // 4. flags (never vetoes): differing offices; believer vs opponent
  const offices = (F) => F.filter((f) => f.relation === 'held-office' || f.relation === 'governor-of' || f.relation === 'ruler-of').map(objectOf);
  const co = offices(cF), eo = offices(eF);
  if (co.length && eo.length && !co.some((x) => eo.some((y) => skeleton(x) === skeleton(y)))) flags.push({ axis: 'role', reason: `different offices: ${co[0]} / ${eo[0]}` });
  const sideOf = (F, side) => (F.some((f) => ['opponent', 'covenant-breaker'].includes(f.relation)) ? 'opponent' : F.some((f) => f.relation === 'believer') ? 'believer' : side || null);
  const cs = sideOf(cF), es = sideOf(eF, candidate.side === 'opponent' ? 'opponent' : null);
  if (cs && es && cs !== es) flags.push({ axis: 'side', reason: `side: ${cs} vs ${es}` });
  return { ok: true, axis: flags[0]?.axis ?? null, reason: flags.length ? flags.map((f) => f.reason).join('; ') + ' (flag)' : 'no contradiction', flags };
}
