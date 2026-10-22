// WHICH model does WHICH job — the ONE table (Chad 10-11: "when we use llms in search strategies, we need to periodically
// re-assess what models are targeted to use better, faster, cheaper newer models like haiku 5.5"). Call sites ask
// modelFor('<role>') instead of naming a model; scripts/ops/model-review.mjs reads this table monthly and flags roles whose
// model is deprecated, overdue for review, or beaten by a newer/cheaper registry model of the same kind.
// Env override per role: MODEL_ROLE_<ROLE_IN_CAPS>="provider:model" (e.g. MODEL_ROLE_ANIS_ANSWER=anthropic:claude-haiku-5-5).

/** reviewed = when this choice was last measured against the alternatives (ISO date). needs = what the job requires. */
export const MODEL_ROLES = {
  // ── search strategies (latency-critical) ──
  'search-planner': { provider: 'systemone', model: 'jev-latest', reviewed: '2026-09-24', needs: ['fast', 'json'],
    why: 'type battery 61/76 @0.18 s, zero paid LLM (project_search_type_battery_20260924)' },
  'assistant-triage': { provider: 'systemone', model: 'jev-latest', reviewed: '2026-10-07', needs: ['fast', 'classification'],
    why: 'gate before any paid call; ms latency' },
  'assistant-answer': { provider: 'gemini', model: 'gemini-3.5-flash-lite', reviewed: '2026-10-05', needs: ['fast', 'multilingual', 'grounded-writing'],
    why: 'one fast call over raw search; ANIS_LLM env switches it (kept for compatibility)' },
  'assistant-term': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['fast', 'tiny-output'],
    why: 'extract the word a CTAI question is about (20 tokens)' },
  'deep-research-rerank': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['ranking', 'json'],
    why: 'legacy choice — not measured against the 5.5 family' },
  'deep-research-hero-prompt': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['short-writing'],
    why: 'legacy choice' },
  'reading-targets': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['fast', 'json'],
    why: 'reading guide: list what on a page deserves a note (people, places, works, terms) — a small JSON list' },
  'reading-notes': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-12', needs: ['grounded-writing', 'persian-arabic-names', 'json'],
    why: 'reading guide notes: name meanings + cited timelines; quality over speed (one call per page, ~$0.05)' },
  // ── updated 10-13 (Chad: "update all model use"): routine work → Haiku 5.5 (registry: $0.10/$0.50 per 1M, multilingual,
  //    under its 100k long-context threshold); quality-critical interactive work → Sonnet 5.5 (≈ gpt-4o's price, better) ──
  'chat-answer': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-13', needs: ['grounded-writing', 'streaming'],
    why: 'legacy Jafar chat answer (was gpt-4o); an explicit llm option still overrides' },
  'doc-subagent': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['fast', 'tool-use'], why: 'single-document QA (was gpt-4o-mini)' },
  'translation-polish': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['multilingual'], why: 'CTAI-grounded translation polish (was gpt-4o-mini)' },
  'ai-balanced': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['fast'], why: 'ai-services balanced tier (was gpt-3.5-turbo)' },
  'ai-quality': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['quality'], why: 'ai-services quality tier (was deepseek-v4-flash)' },
  'ai-creative': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['writing'], why: 'ai-services creative tier (was deepseek-v4-flash)' },
  'grounding-judge': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-13', needs: ['judgement'], why: 'admin judge-hype endpoint (was sonnet-4-6)' },
  'exchange-audit': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-13', needs: ['judgement'], why: 'Anís strategy auditor (was sonnet-4-6)' },
  // ── text processing ──
  'segmentation': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-11', needs: ['arabic', 'index-output', 'batch'],
    why: 'best value for Arabic; batch half price; LM Studio retired (Chad 10-11)' },
  'episode-extract': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-17', needs: ['json', 'multilingual', 'grounded-writing'],
    why: 'one call per episode of a predigested history (heading = boundary): place, date, cited summary, participants, events, questions; ~550 calls for GPB + DB' },
  'dewey-chat': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-17', needs: ['tool-use', 'streaming', 'fast'],
    why: 'Dewey\'s streamed chat about adding works: checks holdings, puts works on the wanted list, attaches sources (tools); a few calls per turn' },
  'dewey-scout': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-18', needs: ['json'],
    why: 'Dewey\'s scouts turn web research into a structured list of important works (title, author, why); one call per list' },
  'dewey-identify': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-17', needs: ['vision', 'multilingual', 'json'],
    why: 'Dewey reads phone photos of covers, title pages and text pages (any script) into title/author/edition/printed lines; one call per check' },
  'toc-infer': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-17', needs: ['json', 'multilingual', 'long-input'],
    why: 'picks which candidate lines begin a section of a book (its Contents page and the work\'s standard structure as guidance); ~2 calls/book' },
  // ── media library (planning/media-library-plan.md; Chad 10-21: "post processing using fast cheap LLM like haiku 5.5") ──
  'media-meta': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-21', needs: ['json', 'multilingual', 'long-input'],
    why: 'names a recording from its path/tags, then describes it from the transcript (speakers, chapters, summary); 2 calls per item' },
  'media-correct': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-21', needs: ['json', 'persian-arabic-names'],
    why: 'judges which misheard names are vocabulary terms; its edits pass a guard (vocabulary only, sounds-alike, ≤ 4 words) — never rewording' },
  'media-clean': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-22', needs: ['json', 'english-editing'],
    why: 'copy-edit pass (Chad 10-22): fillers, stutters, ASR loops, hallucinations, spellings, homophones, capitals, sentence boundaries — every edit kind-checked by a guard, never rewording' },
  'media-clean-strong': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-22', needs: ['json', 'english-editing', 'persian-arabic-names', 'long-input'],
    why: 'THE copy-edit pass (chosen 10-22 on the pilot, 5.3 h: 209 substantive fixes vs 161 for Haiku, precision 24/25 vs 25/25 on a 25-edit read, catches context errors Haiku misses — Van Cortlandt Park, "the Bahá’í movement", The Priceless Pearl; $0.23 vs $0.024 per audio hour); media-clean (Haiku) stays as the fallback via MEDIA_CLEAN_ROLE' },
  'media-headings': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-22', needs: ['json', 'long-input'],
    why: 'topic subheaders (Chad 10-22): a statement or question at each subject shift; a guard keeps only well-spaced ones that share words with their section' },
  'media-people': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-22', needs: ['json', 'persian-arabic-names', 'judgement'],
    why: 'biography links (Chad 10-22): which historical person each name or title in a talk refers to, chosen from the identity layer\'s candidates; only high-confidence picks with a biography page are linked' },
  'media-quotes': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-21', needs: ['json', 'long-input'],
    why: 'marks recited Writings and attributed teachings in a transcript; SourceHunt and the gates decide the links' },
  'media-verify': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-21', needs: ['judgement', 'json'],
    why: 'strict yes/no: does a canonical passage state the teaching a speaker attributes (cross-reference breakouts)' },
  // ── evaluation ──
  'eval-recall': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-16', needs: ['fast', 'multilingual'],
    why: 'known-item test: writes the 2–4 words a reader half-remembers from a passage (one synonym, maybe a misspelling); ~300 calls/run' },
  'bakeoff-judge': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-11', needs: ['multilingual', 'judgement', 'json'],
    why: 'blind judge must be stronger than every flash candidate and read fa/ar/he/zh (anthropic-policy stage model-eval)' },
  // ── legacy chat / publishing / bios (call sites not yet on modelFor — see tests/api/model-literal-ratchet.test.js) ──
  'chat-research': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-13', needs: ['tool-use'], why: 'legacy Jafar pipeline' },
  'authorship-window': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-19', needs: ['classification', 'cheap', 'bulk'],
    why: 'names the speaker of a paragraph the window classifier escalates (was deepseek-v4-flash; DeepSeek retired 10-13); max_tokens >= 4000 (Haiku thinks first)' },
  'anis-researcher': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-19', needs: ['tool-use', 'planning', 'multilingual'],
    why: 'plans the research loop over the library tools (Chad 10-19: "Even Haiku 5.5 might be sufficient for planning research")' },
  'anis-writer': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-19', needs: ['grounded-writing', 'multilingual'],
    why: 'battery 10-19 (10 real questions, Opus blind judge): Sonnet 5.5 writer mean 7.45, beat Perplexity 10/10; Haiku 5.5 writer 3.1 (blank/cut-off replies); old pipeline 5.0' },
  'anis-research-brief': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-19', needs: ['json', 'fast'],
    why: 'Anís plans a POSITION question: its themes, search phrasings and the authoritative works to search — where to look, never the answer; one call per such question' },
  'chat-light': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['fast'], why: 'legacy Jafar pipeline' },
  'publish-review': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-13', needs: ['judgement'], why: 'legacy publish pipeline' },
  'publish-light': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['fast'], why: 'legacy publish pipeline' },
  'bio-timeline': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['json', 'long-input'], why: 'bio life pages' },
};

const envKey = (role) => `MODEL_ROLE_${role.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

/** → { provider, model } for a role (env override wins). Unknown role throws — a typo must not silently pick a model. */
export function modelFor(role) {
  const r = MODEL_ROLES[role];
  if (!r) throw new Error(`model-roles: unknown role "${role}"`);
  const o = process.env[envKey(role)];
  if (o && o.includes(':')) { const [provider, ...m] = o.split(':'); return { provider, model: m.join(':') }; }
  return { provider: r.provider, model: r.model };
}

// DEEPSEEK IS RETIRED (Chad 10-13: "give me an explanation for any use of deepseek? … Do I have to beg?"). Haiku 5.5 is
// cheaper ($0.10/$0.50, half that batched, vs flash $0.15/$0.60 off-peak + hidden reasoning output) and better. Dozens of
// workers and scripts still name a deepseek model, so the rule lives at the call chokepoints (ai.js chatCompletion,
// ai-services chat, role-client, the rag adapter): any deepseek request is served by Haiku and logged once per process.
// DEEPSEEK_ALLOWED=1 is the explicit escape hatch (none set anywhere).
export const RETIRED_TO = { provider: 'anthropic', model: 'claude-haiku-5-5' };
const warned = new Set();
export function retireDeepSeek({ provider, model } = {}, { env = process.env, log = null } = {}) {
  const isDs = String(provider || '') === 'deepseek' || String(model || '').startsWith('deepseek');
  if (!isDs || env.DEEPSEEK_ALLOWED === '1') return { provider, model, retired: false };
  if (log && !warned.has(model)) { warned.add(model); log(`deepseek retired: ${model || provider} → ${RETIRED_TO.model}`); }
  return { ...RETIRED_TO, retired: true };
}
