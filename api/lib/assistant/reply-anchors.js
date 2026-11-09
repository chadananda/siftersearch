// Fresh-conversation memory: the previous assistant reply's OceanLibrary paragraph links (?paraId=) -> doc+paragraph refs (structure, no words) and their religions.
// Used when state.given is empty (widget turns arrive with history only in `messages`). Deps: docs-repo oceanParaRefs (injectable).
import { canonicalTradition } from './tradition-name.js';

const LINK = /https?:\/\/(?:www\.)?oceanlibrary\.com\/([^/?#\s"'<>)\]]+)\/?\?[^\s"'<>)\]]*?paraId=([A-Za-z0-9_.-]+)/g;
const MAX = 6;

/** [[slug, paraId]] of the LAST assistant message's links, in order, unique. Pure. */
export function replyLinkPairs(messages = []) {
  const last = [...messages].reverse().find((m) => m.role === 'assistant');
  const seen = new Set(), out = [];
  for (const m of String(last?.content || '').matchAll(LINK)) { const k = `${m[1]}|${m[2]}`; if (!seen.has(k)) { seen.add(k); out.push([decodeURIComponent(m[1]), m[2]]); } }
  return out.slice(0, MAX);
}

/** The previous reply's linked paragraphs, in link order -> [{ ref, document_id, paragraph_index, religion }]. A failed lookup is []. */
export async function replyAnchors(messages, { resolve = null } = {}) {
  const pairs = replyLinkPairs(messages);
  if (!pairs.length) return [];
  try {
    const rows = await (resolve || (await import('../docs-repo.js')).oceanParaRefs)(pairs);
    return pairs.map(([slug, pid]) => rows.find((r) => r.slug === slug && r.pid === pid)).filter(Boolean)
      .map((r) => ({ ref: `${r.document_id}:${r.paragraph_index}`, document_id: r.document_id, paragraph_index: r.paragraph_index, religion: r.religion ?? null }));
  } catch { return []; }
}

/**
 * Jev said the message refers back. Fill what a fresh conversation lacks, from the previous reply's links: state.given (so lastPassages / the anchor work)
 * and, when Jev named exactly ONE side of a comparison, the other side = the previous turn's tradition (state scope, else the linked passages' religion).
 * -> { ctx, choice } (unchanged objects when nothing applies). Structure only.
 */
export async function withReplyContext(choice, ctx = {}, io = {}) {
  if (!choice?.refersBack) return { ctx, choice };
  const st = ctx.state || { given: [], scope: {} };
  const needPassages = !(st.given || []).some((x) => x.kind === 'passage'), oneSide = (choice.sides || []).length === 1;
  if (!needPassages && !oneSide) return { ctx, choice };
  const anchors = await replyAnchors(ctx.messages || [], io);
  let out = ctx, ch = choice;
  if (needPassages && anchors.length) out = { ...ctx, state: { ...st, given: [...(st.given || []), ...anchors.map((a) => ({ kind: 'passage', ref: a.ref, turn: 0 }))] } };
  if (oneSide) {
    const scoped = Array.isArray(st.scope?.religions_specified) ? st.scope.religions_specified : [];
    const counts = new Map(); for (const a of anchors) { const t = a.religion ? canonicalTradition(a.religion) : null; if (t) counts.set(t, (counts.get(t) || 0) + 1); }
    const prev = [...scoped, ...[...counts.entries()].sort((x, y) => y[1] - x[1]).map(([t]) => t)].map((t) => canonicalTradition(String(t))).find((t) => t && t !== canonicalTradition(choice.sides[0]));
    if (prev) ch = { ...choice, sides: [prev, ...choice.sides] };   // the previous turn's tradition first: "how does THAT compare with the Gita"
  }
  return { ctx: out, choice: ch };
}
