// concepts/link — connect concepts ACROSS traditions even when the terminology differs entirely (the Primal
// Will / the Logos / the First Intellect). Two typed links: "authoritative-bridge" (an authority EXPLICITLY
// connects them — proof-gated) and "analogical" (a family resemblance, marked as such, NEVER asserting exact
// identity — the entities stay distinct, each keeping its tradition's meaning). Powers cross-tradition query.
export const SYSTEM = `You decide whether two CONCEPTS from (possibly) different traditions should be connected, and how. Options:
• "authoritative-bridge" — an authority EXPLICITLY connects them (e.g. the Kitáb-i-Íqán reinterprets a Qur'anic/Biblical concept). Give the authority + a verbatim proof.
• "analogical" — a genuine family resemblance / parallel role across traditions, but NOT the same entity. Mark it analogical; do NOT assert exact identity — each concept keeps its own tradition's meaning.
• "none" — no real connection (a superficial word-overlap is NOT a connection).
Return ONLY JSON: {"link_type":"authoritative-bridge|analogical|none","authority":"<or null>","proof":"<verbatim, for a bridge, or null>","rationale":"<=20 words"}`;

export async function link(ctx, a, b, opts = {}) {
  const [ca, cb] = await Promise.all([ctx.store.getConcept(a), ctx.store.getConcept(b)]);
  const route = { model: opts.model ?? ctx.config.models?.merge, fallback: opts.fallback ?? ctx.config.models?.mergeFallback };
  const { parsed } = await ctx.model.runLadder({ route, system: SYSTEM, user: buildUser(ca, cb), parse: parseLinkVerdict, maxTokens: 400 });
  if (!parsed || parsed.linkType === 'none') return { linked: false, verdict: parsed };
  if (!opts.dryRun) await ctx.store.saveConceptLinks([linkRow(parsed, a, b)]);
  return { linked: true, linkType: parsed.linkType, verdict: parsed };
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function parseLinkVerdict(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (!['authoritative-bridge', 'analogical', 'none'].includes(j.link_type)) return null;
    return { linkType: j.link_type, authority: j.authority ?? null, proof: j.proof ?? null, rationale: j.rationale || '' };
  } catch { return null; }
}

export function linkRow(v, aId, bId) {
  return { aConceptId: aId, bConceptId: bId, linkType: v.linkType, authority: v.authority || null, proofVerbatim: v.proof || null, rationale: v.rationale || '' };
}

export function buildUser(a = {}, b = {}) {
  const fmt = (c) => `#${c.id} "${c.canonical}"${c.tradition ? ` (${c.tradition})` : ''}${c.root ? ` [root: ${c.root}]` : ''}${c.summary ? ` — ${String(c.summary).slice(0, 100)}` : ''}`;
  return `CONCEPT A: ${fmt(a)}\nCONCEPT B: ${fmt(b)}\n\nShould these be connected (authoritative-bridge / analogical / none)?`;
}
