// Reading guide — the research behind one page's notes (Chad 10-12: "drill-downs about persons, places, tablets etc.").
// LIBRARY FIRST: what the page names (the disambiguated mentions + a small model's list of what deserves a note) → the
// entity dossier (summary, titles, dated cited claims) or library passages. The WEB (Perplexity, Parallel.ai) only where
// the library cannot answer: a target with no library evidence at all, or — on "again" (depth 2) — thin evidence and the
// background of places/events. Every fact carries a source label [S#]. Deps injectable.
import { modelFor } from '../../model-roles.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[‘’'`ʼ_-]/g, '').replace(/\s+/g, ' ').trim();
export const explainedKey = (t) => (t.id ? `e${t.id}` : `n:${fold(t.name)}`);

async function defaults() {
  const [{ pageMentions }, { entityLookup, entityDossier }, { plannedSearch }, { llmJson }, { perplexityFallback }, { parallelResearch }] = await Promise.all([
    import('../../repos/reading-repo.js'), import('../../entity-api.js'), import('../../planned-search.js'), import('./llm.js'),
    import('../../perplexity.js'), import('../../parallel-ai.js')]);
  return { pageMentions, entityLookup, entityDossier, search: (q, o) => plannedSearch(q, o), llmJson, perplexity: perplexityFallback, parallel: parallelResearch };
}

/** Pure: does an entity name match a target name (same folded words, or one contains the other)? */
export function sameName(a, b) {
  const x = fold(a).replace(/^(the|mulla|mirza|haji|siyyid|shaykh|aqa) /, ''), y = fold(b).replace(/^(the|mulla|mirza|haji|siyyid|shaykh|aqa) /, '');
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

const TARGETS_SYSTEM = `You prepare a reading guide. For each paragraph, list what a thoughtful reader would want explained:
people, places, works/tablets, events, groups, and unfamiliar terms or titles (e.g. "Shaykhí", "Qá'im", "mujtahid").
Skip common words and anything in ALREADY_EXPLAINED. At most 6 per paragraph, most important first.
Reply with JSON only: {"targets":[{"pid":"para_N","name":"exact form used in the text","kind":"person|place|work|event|group|term","why":"<10 words"}]}`;

/** The page's note targets with their evidence. depth 1 = library; depth 2 = deeper library + web where thin. */
export async function researchPage({ docId, title, items, explained = {}, depth = 1, deps } = {}) {
  const d = { ...(await defaults()), ...(deps || {}) };
  const pids = items.map((p) => p.pid);
  const mentions = await d.pageMentions(docId, pids).catch(() => []);
  const byPid = new Map(pids.map((p) => [p, mentions.filter((m) => m.pid === p)]));
  const known = Object.values(explained).map((e) => e.name).filter(Boolean);
  const role = modelFor('reading-targets');
  const ask = await d.llmJson({ ...role, caller: 'reading-targets', maxTokens: 1200, system: TARGETS_SYSTEM,
    user: `BOOK: ${title}\nALREADY_EXPLAINED: ${known.slice(-200).join('; ') || 'none'}\n\n${items.map((p) => `[${p.pid}] ${p.text}\nMENTIONED (resolved): ${(byPid.get(p.pid) || []).map((m) => m.name).join('; ') || '—'}`).join('\n\n')}` })
    .catch(() => ({ json: null }));
  const raw = Array.isArray(ask.json?.targets) ? ask.json.targets : [];
  // add resolved mentions the model skipped (the graph knows them; they are people/places of the story)
  for (const [pid, ms] of byPid) for (const m of ms.slice(0, 4)) if (!raw.some((t) => t.pid === pid && sameName(t.name, m.name))) raw.push({ pid, name: m.name, kind: m.type, why: 'named here' });

  const seen = new Set(), targets = [];
  for (const t of raw) {
    if (!t?.name || !pids.includes(t.pid)) continue;
    const m = (byPid.get(t.pid) || []).find((x) => sameName(x.name, t.name));
    let id = m?.id || null, canonical = m?.name || null;
    if (!id && ['person', 'place', 'group', 'event'].includes(t.kind)) {
      const hit = (await d.entityLookup(t.name, { limit: 3 }).catch(() => []))[0];
      if (hit && (hit.canonical_match || hit.shared_keys >= 2)) { id = hit.id; canonical = hit.name; }
    }
    const key = explainedKey({ id, name: t.name });
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ pid: t.pid, name: t.name, kind: t.kind || 'term', id, canonical, key, seenAt: explained[key]?.at || null });
  }

  const sources = [];
  const cite = (title, url, kind = 'library') => {
    const i = sources.findIndex((s) => s.url && s.url === url && s.title === title);
    if (i >= 0) return `S${i + 1}`;
    sources.push({ title, url: url || null, kind });
    return `S${sources.length}`;
  };
  const fresh = targets.filter((t) => !t.seenAt).slice(0, depth > 1 ? 24 : 16);
  const claimsN = depth > 1 ? 16 : 8, passagesN = depth > 1 ? 4 : 2;
  await Promise.all(fresh.map(async (t) => {
    const ev = { summary: null, aliases: [], claims: [], passages: [], web: [] };
    if (t.id) {
      const dz = await d.entityDossier(t.id).catch(() => null);
      if (dz) {
        ev.summary = dz.summary || null;
        ev.aliases = (dz.aliases || []).slice(0, 12);
        const dated = dz.claims.filter((c) => c.when).concat(dz.claims.filter((c) => !c.when));
        ev.claims = dated.slice(0, claimsN).map((c) => ({ text: c.statement, when: c.when, src: c.source ? cite(c.source, c.url) : null }));
      }
    }
    if (!ev.summary || ev.claims.length < 3 || ['work', 'term', 'event'].includes(t.kind)) {
      const q = t.kind === 'term' ? `What is ${t.name}?` : t.kind === 'work' ? `${t.name} (the work)` : t.canonical || t.name;
      const r = await d.search(q, { limit: passagesN + 2, budgetMs: 2500 }).catch(() => null);
      ev.passages = (r?.hits || []).filter((h) => h.doc_id !== docId).slice(0, passagesN)
        .map((h) => ({ text: String(h.text || '').replace(/⁅\/?s\d+⁆/g, '').slice(0, 500), src: cite(h.title || 'library', h.url || h.link?.url || null) }));
    }
    // WEB only where the library cannot answer (Chad 10-12): nothing at all on a first pass; thin on "again"
    if (depth > 1 ? (!ev.summary && ev.passages.length < 2) : (!ev.summary && !ev.claims.length && !ev.passages.length)) ev.webNeeded = true;
    t.evidence = ev;
  }));
  const webT = fresh.filter((t) => t.evidence?.webNeeded || (depth > 1 && ['place', 'event'].includes(t.kind))).slice(0, depth > 1 ? 4 : 2);
  await Promise.all(webT.map(async (t) => {
    const q = `${t.name} — in the context of "${title}" (19th-century Persia and the early Bábí/Bahá'í history): ${t.kind === 'place'
      ? 'what the place was like in the 1840s–1850s: population, economy, rulers, and why it mattered' : 'who or what this is, with dates'}. Be concise and factual.`;
    const [px, pa] = await Promise.all([d.perplexity(q, { caller: 'reading-web', maxTokens: 500 }).catch(() => null),
      t.kind === 'place' ? d.parallel(q, { processor: 'base', timeoutS: 75, caller: 'reading-web' }).catch(() => null) : Promise.resolve(null)]);
    for (const r of [px, pa].filter(Boolean)) {
      const c = r.citations?.[0];
      t.evidence.web.push({ text: r.text.slice(0, 1200), src: cite(c?.title || 'web search', c?.url || null, 'web') });
    }
  }));
  return { targets, sources };
}
