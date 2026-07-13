// entities/research-resolve — resolve UNCERTAIN identities by RESEARCH rather than punting them to a human
// review queue (holding "uncertain" just offloads the research onto the user). For each uncertain cluster:
// search the CORPUS first (all books, authority-ranked — authoritative + fast), then the WEB only when the
// corpus is thin; a model adjudicates link / create / other / hold on the gathered evidence. EVERY resolution
// carries its SOURCE provenance so it can be authority-ranked: in-corpus evidence keeps {sourceDocId, paraId,
// authorityTier}; external evidence keeps {url, sourceTitle, authorityTier:'external-web'} — the LOWEST tier,
// never allowed to outrank a corpus source. The entity-research methodology, as a pipeline stage.
import { pool } from '../kernel/run.js';

const CORPUS_THIN = 2;   // fewer than this many corpus hits from OTHER books → consult the web

export async function run(ctx, docId, opts = {}) {
  const clusters = opts.clusters || (await ctx.store.getUncertainClusters?.(docId, { limit: opts.limit })) || [];
  const route = { model: opts.model ?? ctx.config.models?.merge, fallback: opts.fallback ?? ctx.config.models?.mergeFallback };
  const stats = { clusters: clusters.length, webUsed: 0, adjudicated: 0, failed: 0, held: 0, written: 0, byKind: {} };
  const decisions = [];

  await pool(opts.concurrency ?? 3, clusters, async (cluster) => {
    // Corpus-first: evidence from OTHER books (this book is the one that raised the question), authority-ranked.
    const corpus = ((await ctx.store.searchCorpus?.(cluster.resolvedAs, { limit: 6 })) || []).filter((c) => c.docId !== docId);
    let web = null;
    if (corpus.length < CORPUS_THIN && ctx.web?.research) { web = await ctx.web.research(webQuery(cluster)); if (web) stats.webUsed++; }
    const { parsed } = await ctx.model.runLadder({ route, system: SYSTEM, user: buildUser(cluster, corpus, web), parse: parseResolve, maxTokens: 450 });
    if (!parsed) { stats.failed++; return; }
    stats.adjudicated++;
    const row = decisionRow(parsed, cluster, collectEvidence(parsed, corpus, web), docId);
    if (parsed.verdict === 'hold') stats.held++; else stats.byKind[row.kind] = (stats.byKind[row.kind] || 0) + 1;
    decisions.push(row);
  });

  if (!opts.dryRun && decisions.length) stats.written = await ctx.store.saveDecisions(decisions);
  ctx.log.info?.({ docId, ...stats }, 'entities/research-resolve');
  return opts.dryRun ? { ...stats, decisions } : stats;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export const SYSTEM = `You resolve the identity of an UNCERTAIN historical figure using RESEARCH EVIDENCE — do not guess, do not defer to a human.
You get the figure as a source resolved it, plus CORPUS EVIDENCE (passages from other books, each with an AUTHORITY tier — higher = more authoritative) and optionally EXTERNAL WEB evidence (lowest authority — corroboration only, never decisive over the corpus).
Decide:
• "link" — the figure IS a known entity the evidence identifies (give its id if a candidate id is shown).
• "create" — a real, named, distinct person the evidence identifies/corroborates (give canonical name).
• "other" — not a person (place/work/group/event) — give type.
• "hold" — evidence is genuinely too thin to resolve; stay uncertain (do NOT invent an identity).
Rules: CORPUS always outranks WEB; a resolution resting ONLY on external web is low-confidence. Prefer "hold" over a wrong resolution (a false identity fabricates a person). Cite which evidence items you used.
Return ONLY JSON: {"verdict":"link|create|other|hold","entity_id":<id|null>,"canonical":"<name|null>","type":"person|place|work|group|event","used_corpus":[<C-indices>],"used_web":[<W-indices>],"confidence":0.0-1.0,"reason":"<=25 words"}.`;

export function webQuery(cluster) {
  return `Who is "${cluster.resolvedAs}"? Historical identity, dates, and any connection to Bábí/Bahá'í history.`;
}

export function buildUser(cluster, corpus, web) {
  const c = corpus.map((e, i) => `  [C${i}] (${e.title || 'src'} · authority ${e.authorityTier ?? '?'}) "${String(e.snippet || '').slice(0, 160)}"${e.entityId ? ` → entity #${e.entityId}` : ''}`).join('\n') || '  (no corpus evidence)';
  const w = web ? `\nEXTERNAL WEB (lowest authority — corroboration only):\n${(web.sources || []).map((s, i) => `  [W${i}] ${s.title || s.url}`).join('\n')}\n  summary: ${String(web.answer || '').slice(0, 300)}` : '';
  return `UNCERTAIN FIGURE — resolved by source as: "${cluster.resolvedAs}" (${cluster.freq ?? '?'} mentions)\nCORPUS EVIDENCE (other books, authority-ranked):\n${c}${w}\n\nResolve the identity from the evidence.`;
}

export function parseResolve(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (!['link', 'create', 'other', 'hold'].includes(j.verdict)) return null;
    return { verdict: j.verdict, entityId: j.entity_id ?? null, canonical: j.canonical ?? null, type: j.type || 'person',
      usedCorpus: Array.isArray(j.used_corpus) ? j.used_corpus : [], usedWeb: Array.isArray(j.used_web) ? j.used_web : [],
      confidence: j.confidence ?? null, reason: j.reason || '' };
  } catch { return null; }
}

// Assemble the SOURCED evidence a resolution rests on — provenance is mandatory + authority-tiered. External
// evidence is always tier 'external-web' (the lowest), so downstream ranking can see exactly what it stands on.
export function collectEvidence(parsed, corpus, web) {
  const inCorpus = parsed.usedCorpus.map((i) => corpus[i]).filter(Boolean)
    .map((e) => ({ sourceDocId: e.docId, paraId: e.paraId ?? null, authorityTier: e.authorityTier ?? null, snippet: String(e.snippet || '').slice(0, 200) }));
  const external = (web ? parsed.usedWeb.map((i) => web.sources?.[i]).filter(Boolean) : [])
    .map((s) => ({ url: s.url, sourceTitle: s.title || null, authorityTier: 'external-web' }));
  return { inCorpus, external };
}

export function decisionRow(parsed, cluster, evidence, docId) {
  const kind = parsed.verdict === 'other' ? 'other-type' : parsed.verdict === 'hold' ? 'uncertain' : parsed.verdict;
  return {
    kind, targetKind: 'mention-cluster', targetIds: (cluster.paraIds || []).slice(0, 20),
    payload: { resolvedAs: cluster.resolvedAs, entityId: parsed.verdict === 'link' ? parsed.entityId : null,
      canonical: parsed.verdict === 'create' ? parsed.canonical : (parsed.canonical || cluster.resolvedAs),
      type: parsed.type, freq: cluster.freq, docId, via: 'research' },
    evidence,   // { inCorpus:[{sourceDocId,paraId,authorityTier,snippet}], external:[{url,sourceTitle,authorityTier:'external-web'}] }
    rationale: parsed.reason, actor: 'model', actorTier: 2, confidence: parsed.confidence ?? 0.6, status: 'proposed',
  };
}
