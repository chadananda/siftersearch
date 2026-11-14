// Versions of what the edge keeps between turns. TOOL_SHAPE: a tool whose result shape or resolution changed gets a new tag, so its R2 entries
// (index.js toolKey) are not served. RESEARCH_REV: bump when held research sets (research-store.js) should no longer be served — a tool
// fix that changes what research finds; every TOOL_SHAPE change does this too (researchVersion folds it in).
export const TOOL_SHAPE = { sourceOf: 'roles3', searchInWork: 'vol1', extractFromWork: 'vol1', findPassage: 'own1', ownSource: 'own1' };   // 11-14: volume-aware work resolution; the writer's own book over a compilation quoting him
export const RESEARCH_REV = 1;   // 1 (11-14): first versioned sets — every set held before volume-aware work search (vol1) stops being served
// short, stable tag (FNV-1a 32) stamped on each held passage; pure, sync
export const researchVersion = (shape = TOOL_SHAPE, rev = RESEARCH_REV) => {
  let h = 0x811c9dc5;
  for (const c of `${rev}|${JSON.stringify(shape)}`) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return `r${rev}.${h.toString(36)}`;
};
