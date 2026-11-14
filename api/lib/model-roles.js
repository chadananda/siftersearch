// WHICH model does WHICH job — the ONE table (Chad 10-11: "when we use llms in search strategies, we need to periodically
// re-assess what models are targeted to use better, faster, cheaper newer models like haiku 5.5"). Call sites ask
// modelFor('<role>') instead of naming a model; scripts/ops/model-review.mjs reads this table weekly, flags roles whose model is
// deprecated, overdue for review, or beaten by a newer/cheaper registry model of the same kind, and every 2 weeks re-measures a
// flagged role that declares an `eval` (Chad 11-03) — the result is a choice in the weekly maintenance email, never a switch.
// Env override per role: MODEL_ROLE_<ROLE_IN_CAPS>="provider:model" (e.g. MODEL_ROLE_ANIS_ANSWER=anthropic:claude-haiku-5-5).

/** reviewed = when this choice was last measured against the alternatives (ISO date). needs = what the job requires.
 *  eval = the harness that measures it (EVALS in api/lib/model-review.js); evalMode = its --mode. No eval = can't be measured yet. */
export const MODEL_ROLES = {
  // ── search strategies (latency-critical) ──
  'search-planner': { provider: 'systemone', model: 'jev-latest', reviewed: '2026-09-24', needs: ['fast', 'json'],
    why: 'type battery 61/76 @0.18 s, zero paid LLM (project_search_type_battery_20260924)' },
  'book-match': { provider: 'systemone', model: 'jev-latest', reviewed: '2026-10-23', needs: ['classification'],
    why: 'book hunt: which of several catalogue records is the book we hold (only when deterministic matching ties)' },
  'assistant-triage': { provider: 'systemone', model: 'jev-latest', reviewed: '2026-10-07', needs: ['fast', 'classification'],
    why: 'gate before any paid call; ms latency' },
  'assistant-answer': { provider: 'gemini', model: 'gemini-3.5-flash-lite', reviewed: '2026-10-05', needs: ['fast', 'multilingual', 'grounded-writing'], eval: 'anis-writer-ab', evalMode: 'current',
    why: 'one fast call over raw search; ANIS_LLM env switches it (kept for compatibility)' },
  'assistant-term': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['fast', 'tiny-output'],
    why: 'extract the word a CTAI question is about (20 tokens)' },
  'anis-work-summary': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-09', needs: ['fast', 'tiny-output'],
    why: 'Chad 11-09: a bare book title → link + a short summary in ~2s; written ONCE per book from its opening pages, cached in data/run (title-answer.js)' },
  'anis-book-pick': { provider: 'systemone', model: 'jev-latest', reviewed: '2026-11-10', needs: ['fast', 'classification'],
    why: 'Chad 11-10: Jev chose the book strategy → ONE typed choice over the library\'s title + section candidates ("none fits" an option); the card follows at once (book-pick.js)' },
  'anis-book-name': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-10', needs: ['fast', 'tiny-output'],
    why: 'only when no candidate fits: the canonical title(s) of the work a message describes ("the main book of the Hindus" → Bhagavad Gita), then search again (book-pick.js)' },
  'anis-work-extract': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-12', needs: ['fast', 'json'],
    why: 'Chad 11-12 ("extract just the prayers … a table of links"): one call per chunk of a work names the pieces that fit a request made FROM it (work-extract.js)' },
  'anis-find-words': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-12', needs: ['fast', 'json', 'tiny-output'],
    why: 'Chad 11-12 ("maxwell birth … in Star of the West" searched the whole sentence): the subject to look for inside a work when nothing was quoted (find-in-work.js)' },
  'anis-understood': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-03', needs: ['fast', 'tiny-output'],
    why: 'the "what I understood" line: one noun phrase restating the resolved request from Jev\'s decision (System One has no free-text type)' },
  'anis-followups': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-12', needs: ['fast', 'json', 'tiny-output'],
    why: 'Chad 11-12: two or three short follow-up questions under each live reply, as tappable pills (mobile); same subject, never a new one' },
  'anis-share': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-13', needs: ['fast', 'json'],
    why: 'Chad 11-13 (shared discussions): before a reader publishes a conversation, the personal details they gave (names, circumstances) as exact redactions + a neutral title and one-line summary (worker/anis/share.js); after the deterministic scrub' },
  'anis-transcribe': { provider: 'cloudflare', model: '@cf/openai/whisper-large-v3-turbo', reviewed: '2026-11-13', needs: ['speech-to-text', 'multilingual'],
    why: 'Anís P5 voice: dictation and conversation mode where the browser has no live speech recognition; Workers AI at the edge ($0.0005/audio min), Bahá\'í names as the prompt hint (worker/anis/voice.js)' },
  'anis-speak': { provider: 'cloudflare', model: '@cf/deepgram/aura-1', reviewed: '2026-11-13', needs: ['text-to-speech'],
    why: 'Anís P5 voice: read-aloud and conversation replies, one sentence per call, cached in R2 by text hash; aura-1 is half aura-2\'s price ($0.015/1k chars) and melotts is deprecated 11-20 (worker/anis/voice.js)' },
  'anis-restate': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-13', needs: ['fast', 'tiny-output'],
    why: 'Chad 11-13: the reader\'s message → the canonical standalone question before the edge research-cache lookup (worker/anis/restate.js); always under the long-context price boundary' },
  'anis-unmatched-recheck': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-08', needs: ['fast', 'json', 'tiny-output'],
    why: 'Chad 11-08: before a new strategy is built for an Unmatched question, a fast model checks whether Jev simply failed to pick a good one (active strategies + pending candidates named; one name or null)' },
  'anis-tree-generator': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-09', needs: ['fast', 'json', 'tiny-output'],
    why: 'a strategy tree\'s light generators (judges.js generateList): the sub-topics a topic splits into, the points that would make a claim true or false, the periods a timeline holds; one call per plan.* step' },
  'assistant-phrases': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-01', needs: ['fast', 'tiny-output'],
    why: 'name the search phrase (wording, person, work, term) of a specific question that has no quote marks; Jev still routes' },
  'deep-research-rerank': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['ranking', 'json'],
    why: 'legacy choice — not measured against the 5.5 family' },
  'deep-research-hero-prompt': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['short-writing'],
    why: 'legacy choice' },
  'anis-jev-backup': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-10', needs: ['fast', 'json'],
    why: 'Jev triage/strategy timed out → the same typed options answered once from the history, so the turn never fails open to research (11-10)' },
  'anis-tree-generator-credit': { provider: 'gemini', model: 'gemini-3.5-flash-lite', reviewed: '2026-11-10', needs: ['fast', 'json'],
    why: 'the plan generators (phrasings, histories, sub-themes…) when Anthropic refuses for no credit (11-10 night); only then' },
  'anis-jev-backup-credit': { provider: 'gemini', model: 'gemini-3.5-flash-lite', reviewed: '2026-11-10', needs: ['fast', 'json'],
    why: 'the Jev backup when Anthropic refuses for no credit (11-10 night: every Jev timeout failed open while Haiku was unpaid); only then' },
  'turn-resolver': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-03', needs: ['fast', 'json'],
    why: 'short turn ("more", "and the Báb?") → one self-contained query from history + reader card; Jev decided it is a search (W2 11-03)' },
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
  'search-judge': { provider: 'anthropic', model: 'claude-opus-5-5', reviewed: '2026-11-04', needs: ['judgement', 'json'],
    why: 'Chad 11-04: every search trace and reply judged by Opus 5.5 (pass/weak + weakness classes); improve worker, rubric prompt-cached' },
  'improve-analysis': { provider: 'anthropic', model: 'claude-opus-5-5', reviewed: '2026-11-04', needs: ['judgement', 'code-reasoning', 'json'],
    why: 'Chad 11-04: deep analysis of weak items only → improvement suggestions (stage, file/fn, change, evidence)' },
  'strategy-design': { provider: 'anthropic', model: 'claude-opus-5-5', reviewed: '2026-11-04', needs: ['judgement', 'json'],
    why: 'Chad 11-04: strategy graph Phase 3 — Opus designs a candidate strategy (a graph of existing activities) for a ready gap cluster, and writes the fresh class questions its promotion replays; billed improve-strategy-*' },
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
  // batch: true → offline work, sent through the Message Batches API at half price (Chad 11-04: "yes, definitely use batch mode");
  // media/llm.js ask() routes it (batchRole below). media-people has no ask() call site yet, so it is not marked.
  'media-meta': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-21', batch: true, needs: ['json', 'multilingual', 'long-input'],
    why: 'names a recording from its path/tags, then describes it from the transcript (speakers, chapters, summary); 2 calls per item' },
  'media-correct': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-21', batch: true, needs: ['json', 'persian-arabic-names'],
    why: 'judges which misheard names are vocabulary terms; its edits pass a guard (vocabulary only, sounds-alike, ≤ 4 words) — never rewording' },
  'media-clean': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-22', batch: true, needs: ['json', 'english-editing'],
    why: 'copy-edit pass (Chad 10-22): fillers, stutters, ASR loops, hallucinations, spellings, homophones, capitals, sentence boundaries — every edit kind-checked by a guard, never rewording' },
  'media-clean-strong': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-22', batch: true, needs: ['json', 'english-editing', 'persian-arabic-names', 'long-input'],
    why: 'THE copy-edit pass (chosen 10-22 on the pilot, 5.3 h: 209 substantive fixes vs 161 for Haiku, precision 24/25 vs 25/25 on a 25-edit read, catches context errors Haiku misses — Van Cortlandt Park, "the Bahá’í movement", The Priceless Pearl; $0.23 vs $0.024 per audio hour); media-clean (Haiku) stays as the fallback via MEDIA_CLEAN_ROLE' },
  'media-assess': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-22', batch: true, needs: ['json', 'long-input', 'judgement'],
    why: 'whole-talk AUDIENCE (1–5, per section; tradition-agnostic rubric) and MOMENTS (verbatim excerptable spans) — Chad 10-22; one read per talk' },
  'image-outpaint': { provider: 'gemini', model: 'gemini-3.1-flash-image', reviewed: '2026-10-22', needs: ['image-in', 'image-out'],
    why: 'extended portrait masters (Chad 10-22: "fill in with gemini once"): fills only the margins of a 9:16 canvas around a speaker portrait; the original pixels are pasted back; ~$0.04 and ~12 s per person, once' },
  'media-headings': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-22', batch: true, needs: ['json', 'long-input'],
    why: 'topic subheaders (Chad 10-22): a statement or question at each subject shift; a guard keeps only well-spaced ones that share words with their section' },
  'media-content': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-14', batch: true, needs: ['json', 'long-input', 'judgement'],
    why: 'content map (Chad 11-14): marks which stretches of a recording are the talk itself and which are songs, prayers, readings, MC, introductions, thanks; deterministic code turns the marks into cuts (content-map.js)' },
  'media-people': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-22', needs: ['json', 'persian-arabic-names', 'judgement'],
    why: 'biography links (Chad 10-22): which historical person each name or title in a talk refers to, chosen from the identity layer\'s candidates; only high-confidence picks with a biography page are linked' },
  'media-quotes': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-21', batch: true, needs: ['json', 'long-input'],
    why: 'marks recited Writings and attributed teachings in a transcript; SourceHunt and the gates decide the links' },
  'media-verify': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-21', batch: true, needs: ['judgement', 'json'],
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
  'anis-agent': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-11-01', needs: ['tool-use', 'grounded-writing', 'multilingual'],
    why: 'one loop that researches AND writes (agent.js). Quality first, speed earned later (Chad 11-01: "start with quality answers that are slow and then have a mechanism to improve speed"); Haiku 5.5 wrote 3.1 vs Sonnet 7.45 on 10-19' },
  'anis-writer': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-19', needs: ['grounded-writing', 'multilingual'], eval: 'anis-writer-ab',
    why: 'battery 10-19 (10 real questions, Opus blind judge): Sonnet 5.5 writer mean 7.45, beat Perplexity 10/10; Haiku 5.5 writer 3.1 (blank/cut-off replies); old pipeline 5.0' },
  'anis-light-writer': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-03', needs: ['grounded-writing', 'fast'], eval: 'anis-writer-ab',
    why: 'writes LOOKUP replies only (a book, a quotation, a numbered reference: code finds the passage, the template is chosen, this writes it in his voice). Thinking OFF, cheap price tier (Chad 11-03); research answers stay on anis-writer (A/B 11-03: Haiku no-think 5 win / 24 loss vs Sonnet on research, fine for a one-passage lookup)' },
  'anis-read-attachment': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-23', needs: ['vision', 'multilingual', 'persian-arabic-script'],
    why: 'reads a photo a reader attaches to a letter (10-23 Liliane: a Persian prayer-book page in nastaliq was dropped unread) — verbatim transcription in its own script; one call per image, rare' },
  'anis-research-brief': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-19', needs: ['json', 'fast'],
    why: 'Anís plans a POSITION question: its themes, search phrasings and the authoritative works to search — where to look, never the answer; one call per such question' },
  'chat-light': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['fast'], why: 'legacy Jafar pipeline' },
  'publish-review': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-13', needs: ['judgement'], why: 'legacy publish pipeline' },
  'publish-light': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['fast'], why: 'legacy publish pipeline' },
  'bio-timeline': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-13', needs: ['json', 'long-input'], why: 'bio life pages' },
  'sbs-align': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-12', needs: ['fast', 'json', 'multilingual'],
    why: 'side-by-side documents: break an original paragraph and its English into equal sentence rows, text unchanged (sbs/align.js; code verifies, cached per text pair)' },
  'hype-judge': { provider: 'anthropic', model: 'claude-sonnet-4-6', reviewed: '2026-11-09', needs: ['judgement', 'json', 'multilingual'],
    why: 'grades HyPE question sets with the score-hype rubric (tests/quality/score-hype.mjs and the hype-program 1% sample); the model score-hype has always used, kept so grades stay comparable' },
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

/** Does this role go through the Message Batches API? Only roles marked `batch` whose model resolves to Anthropic;
 *  MEDIA_LLM_BATCH=0 is the kill switch (every call synchronous again). Interactive roles are never marked. */
/** The media pipeline's LLM roles go through Message Batches unless MEDIA_LLM_BATCH=0 (the kill switch). While batching, a
 *  request waits minutes to hours, so far more talks may wait at once (media-worker llm/pipeline lanes, media-jobs llmDepth,
 *  stages CLASSES.llm.concurrency): waiting costs nothing, and only the batch decides the rate. */
export const mediaLlmBatching = (env = process.env) => env.MEDIA_LLM_BATCH !== '0';
export function batchRole(role, env = process.env) {
  if (env.MEDIA_LLM_BATCH === '0' || !MODEL_ROLES[role]?.batch) return false;
  return modelFor(role).provider === 'anthropic';
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
