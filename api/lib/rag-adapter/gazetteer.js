// Gazetteer loader — the central-cast identity ANCHOR, consulted at candidate-recall time so a figure's
// TITLE/EPITHET/nisba forms recall the SAME entity as its name (anti-split) and ≠namesake guards never
// re-merge. Reads the JSON the build-gazetteer generator emits; app-side only (no rag-library imports).
// Graceful: a missing file yields an empty gazetteer so recall is simply unchanged.
import fs from 'node:fs';

const fold = (s) => String(s).toLowerCase().replace(/[‘’'`ʻʼ]/g, '').trim();

const cache = new Map(); // path → gazetteer (parsed once per path)

// Load + index the gazetteer at `path` (cached). Missing/unparseable file → empty gazetteer.
export function loadGazetteer(path) {
  if (cache.has(path)) return cache.get(path);
  let gaz = { entries: [], guards: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
    gaz = { entries: raw.entries || [], guards: raw.guards || [] };
  } catch { /* missing/bad file → empty (recall unchanged) */ }
  gaz._forms = new Map();     // folded form → {id, canonical}
  for (const e of gaz.entries) for (const f of e.forms || []) gaz._forms.set(fold(f), { id: e.id, canonical: e.canonical });
  gaz._guards = (gaz.guards || []).map((g) => [fold(g.a), fold(g.b)]);
  cache.set(path, gaz);
  return gaz;
}

// Apostrophe/case-folded lookup: name folds-equal to an entry's forms → its anchor, else null.
export function anchorFor(gaz, name) {
  return gaz?._forms?.get(fold(name)) || null;
}

// True if a ≠namesake guard lists this pair (either order, folded).
export function guardedPair(gaz, nameA, nameB) {
  const a = fold(nameA), b = fold(nameB);
  return (gaz?._guards || []).some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
