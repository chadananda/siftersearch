// READING GUIDE — Anís reads a book with someone, a page per email, notes after each paragraph (Chad 10-12/13).
// ONE workflow, one file (Chad 10-13: "when functionality is closely related or shares a workflow, keep it together"):
//   1. MODEL CALL — llmJson: one JSON reply from any OpenAI-compatible provider, logged to ai_usage.
//   2. OUTLINE    — the book's OceanLibrary markdown → sections (Intro, Preface, chapters) + paragraphs (para_N, #3.4, topic).
//   3. REPLIES    — what a reader's message asks for: start / next / again / back / jump / where / stop / question, and a
//                   notes level; understood by meaning (small model) with keyword rules as the fallback.
//   4. RESEARCH   — what on a page deserves a note, and the cited evidence: entity dossiers, library passages; the web
//                   (Perplexity, Parallel.ai) only where the library cannot answer.
//   5. GUIDE      — readingTurn(): bookmark + pages + what is already explained per reader × book (reading_sessions),
//                   one page built, notes written (Sonnet 5.5), rendered as the email and as a structured page (audio).
// Deps: role-client (provider clients), model-roles + registry, ai-services (usage), repos/reading-repo, docs-repo, planned-search, hit-links,
// entity-api, perplexity, parallel-ai, config (library path). Every dependency is injectable for tests.
import { readFile } from 'fs/promises';
import { join } from 'path';
import { modelFor } from '../model-roles.js';
import { clientFor } from '../role-client.js';
import { getModel } from '../model-registry.js';
import { logAIUsage } from '../ai-services.js';
import { effectiveAuthor } from '../authorship/effective.js';

// ════ 1. MODEL CALL ═════════════════════════════════════════════════════════════════════════════════════════════════


/** The first JSON object in a model reply (fenced or bare). Pure. */
export function jsonOf(text) {
  const s = String(text || '');
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  for (const cand of [fenced, s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)]) {
    if (!cand) continue;
    try { return JSON.parse(cand); } catch { /* next */ }
  }
  return null;
}

export async function llmJson({ provider, model, system, user, maxTokens = 3000, caller, timeoutMs = 120000 }) {
  const reg = getModel(model) || {};
  const res = await clientFor(provider).chat.completions.create({
    model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    [reg.maxTokensParam || 'max_tokens']: maxTokens,
    ...(reg.noTemperature ? {} : { temperature: 0.2 }),
    ...(provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
  }, { timeout: timeoutMs });
  const text = res.choices?.[0]?.message?.content || '';
  logAIUsage({ provider: provider === 'gemini' ? 'google' : provider, model, serviceType: 'chat', caller,
    promptTokens: res.usage?.prompt_tokens ?? Math.ceil((system.length + user.length) / 4), completionTokens: res.usage?.completion_tokens ?? Math.ceil(text.length / 4) });
  return { json: jsonOf(text), text, usage: res.usage || null };
}

// ════ 2. OUTLINE ════════════════════════════════════════════════════════════════════════════════════════════════════

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
export const romanToInt = (r) => [...String(r).toUpperCase()].reduce((n, c, i, a) => n + (ROMAN[c] < (ROMAN[a[i + 1]] || 0) ? -ROMAN[c] : ROMAN[c]), 0);

const NAMED = [[/^INTRODUCTION$/i, 'Intro'], [/^PREFACE$/i, 'Preface'], [/^EPILOGUE$/i, 'Epilogue'], [/^FOREWORD$/i, 'Foreword'], [/^PROLOGUE$/i, 'Prologue']];

/** Display text of one markdown line: attribute block, page marks, footnote refs, tags and emphasis removed. */
export function cleanLine(s) {
  return String(s).replace(/\s*\{[^{}]*\}\s*$/, '').replace(/\[pg [^\]]*\]/gi, '').replace(/\[\^[^\]]*\]/g, '')
    .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/(\*\*|__|\*|_)(\S[^*_]*?)\1/g, '$2')
    .replace(/\\([-*_[\]()#.!])/g, '$1').replace(/\s+/g, ' ').trim();
}

/** → { sections: [{ key, title }], paragraphs: [{ pid, section, n, topic, text }] } */
export function parseOutline(md) {
  const paragraphs = [], sections = [];
  let section = 'Front', sectionTitle = null, topic = null, n = 0, awaitTitle = false;
  const open = (key, title = null) => { section = key; sectionTitle = title; topic = null; n = 0; sections.push({ key, title }); };
  open('Front');
  let pending = [];   // text lines of a block whose attribute line comes AFTER it (lists, poems, block quotes)
  for (const line of String(md).split('\n')) {
    if (!line.trim()) continue;   // the attribute line may follow its text after a blank line (para_1143)
    const attrs = line.match(/\{([^{}]*)\}\s*$/)?.[1] || '';
    if (!attrs && !/^#/.test(line)) { pending.push(line); continue; }
    const pid = attrs.match(/\bid="(para_\d+)"/)?.[1];
    const type = attrs.match(/\btype="(\w+)"/)?.[1];
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      pending = [];
      const text = cleanLine(h[2]);
      const chapter = text.match(/^CHAPTER\s+([IVXLCDM]+)\b/i);
      const named = NAMED.find(([re]) => re.test(text));
      if (chapter) { open(String(romanToInt(chapter[1]))); awaitTitle = true; continue; }
      if (named) { open(named[1], text); awaitTitle = false; continue; }
      if (awaitTitle) { sectionTitle = text; sections[sections.length - 1].title = text; awaitTitle = false; continue; }
      if (section !== 'Front' && text) topic = text;
      continue;
    }
    const own = cleanLine(line);
    const body = [...pending.map(cleanLine), own].filter(Boolean).join(' ');
    pending = [];
    if (!pid || type !== 'par') continue;
    const text = body;
    if (!text) continue;
    paragraphs.push({ pid, section, n: ++n, topic: topic || sectionTitle, text });
  }
  return { sections: sections.filter((s) => paragraphs.some((p) => p.section === s.key)), paragraphs };
}

/** "#Intro.3" / "#5.7" — the subject-line address of a paragraph. */
export const addressOf = (p) => `#${p.section}.${p.n}`;

/** One page from `from` (index into paragraphs): whole paragraphs until ~`words`, never crossing into a new section
 *  once the page has content (a chapter starts its own email). Pure. */
export function pageFrom(paragraphs, from, { words = 450, max = 8 } = {}) {
  const out = [];
  let count = 0;
  for (let i = from; i < paragraphs.length && out.length < max; i++) {
    const p = paragraphs[i];
    if (out.length && p.section !== out[0].section) break;
    const w = p.text.split(/\s+/).length;
    if (out.length && count + w > words * 1.25) break;
    out.push({ ...p, index: i });
    count += w;
    if (count >= words) break;
  }
  return { items: out, next: out.length ? out[out.length - 1].index + 1 : from, words: count };
}

/** Where a reader asked to start ("the introduction", "chapter 5", "preface") → paragraph index, or null. */
export function startIndex(paragraphs, want) {
  const w = String(want || '').toLowerCase();
  if (!w) return null;
  const ch = w.match(/chapter\s+(\d+|[ivxlc]+)\b/i);
  const key = ch ? String(/^\d+$/.test(ch[1]) ? Number(ch[1]) : romanToInt(ch[1]))
    : /intro/.test(w) ? 'Intro' : /preface/.test(w) ? 'Preface' : /epilogue/.test(w) ? 'Epilogue' : /begin|start|first/.test(w) ? '__first' : null;
  if (!key) return null;
  if (key === '__first') return 0;
  const i = paragraphs.findIndex((p) => p.section === key);
  return i >= 0 ? i : null;
}

// ════ 3. REPLIES ════════════════════════════════════════════════════════════════════════════════════════════════════

const START = /\b(?:help me (?:study|read|go through)|(?:study|read|go through)\s+(.+?)\s+with me|(?:be|act as) my (?:reading|study) (?:companion|guide)(?: for)?|reading (?:companion|guide) for|let'?s (?:study|read))\b\s*(.*)/i;

/** The book a start message names: "help me study the Dawn-Breakers. Let's start from the introduction" → "Dawn-Breakers". */
export function bookFrom(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const m = t.match(START);
  if (!m) return null;
  const raw = (m[1] || m[2] || '').split(/[.!?;\n]| starting | start(?:ing)? (?:at|from|with)\b| from the | beginning /i)[0];
  const book = raw.split(/,\s*(?:and\s+)?(?:let'?s|starting|start|begin|beginning|from)\b/i)[0]
    .replace(/^(?:the book|book)\s+/i, '').replace(/^["“'‘]|["”'’]$/g, '').replace(/^(?:the\s+)(?=\S)/i, '').replace(/[\s,;:]+$/, '').trim();
  return book || null;
}

/** Where a start message asks to begin ("start from the introduction", "begin with chapter 3"). */
export function startFrom(text) {
  const t = String(text || '');
  const m = t.match(/\b(?:start|begin|starting|beginning)\b[^.?!]*?\b(?:from|with|at)\s+(?:the\s+)?([^.?!,;]+)/i);
  return m ? m[1].trim() : null;
}

/** A notes LEVEL the reader asks for, anywhere in the message (Chad 10-13: "use the advanced level of notes"). Pure. */
export function levelFrom(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(advanced|scholarly|scholar|expert|academic|in[- ]depth|more detailed|deeper)\b[^.?!]{0,30}\b(notes?|level|research)\b|\b(notes?|level)\b[^.?!]{0,20}\b(advanced|scholarly|expert|academic)\b/.test(t)) return 'advanced';
  if (/\b(simpler|simple|basic|beginner|introductory|lighter|less detail(ed)?)\b[^.?!]{0,30}\b(notes?|level)\b|\b(notes?|level)\b[^.?!]{0,20}\b(simpler|basic|beginner|introductory)\b/.test(t)) return 'introductory';
  if (/\b(normal|standard|default|regular)\b[^.?!]{0,10}\b(notes?|level)\b/.test(t)) return 'serious';
  return null;
}

/** → { kind, book?, from?, target?, level? }. `active` = the reader has a book open. Inside a reading thread replies are
 *  conversational ("good. next please. and use the advanced level of notes" — 10-13 this fell through to an ordinary
 *  answer): a navigation word anywhere counts; a bare acknowledgement means "next"; a level request rides along. */
export function readingIntent(text, { active = false } = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const book = bookFrom(t);
  if (book) return { kind: 'start', book, from: startFrom(t), level: levelFrom(t) };
  if (!active) return { kind: 'none' };
  const low = t.toLowerCase();
  const level = levelFrom(t);
  const withLevel = (o) => (level ? { ...o, level } : o);
  const asks = /\?/.test(low) || /^(who|what|why|how|when|where(?! are we)|which|is|was|were|did|does|do|can|could|tell me|explain)\b/.test(low);
  if (/\b(stop|pause|end) (reading|the book|the reading)\b/.test(low)) return { kind: 'stop' };
  if (/\bwhere (are|were) we\b|\bwhat page\b|\bbookmark\b/.test(low)) return { kind: 'where' };
  const jump = low.match(/\b(?:skip|jump|go|move|turn)\s+(?:ahead\s+)?to\s+([^.?!,;]+)/);
  if (jump && !/^the next\b/.test(jump[1])) return withLevel({ kind: 'jump', target: jump[1].trim() });
  if (/\b(try again|again|dig deeper|go deeper|not deep enough|redo)\b/.test(low) && !asks) return withLevel({ kind: 'again' });
  if (/\b(go back|previous page|last page)\b|^back\b/.test(low)) return withLevel({ kind: 'back' });
  if (/\b(next|continue|go on|keep going|carry on|proceed|onward|read on|more please)\b/.test(low)) return withLevel({ kind: 'next' });
  if (level && !asks) return { kind: 'again', level, relevel: true };   // "use simpler notes" alone → this page again at that level
  if (!low || /^(ok(ay)?|yes|good|great|thanks?|thank you|lovely|wonderful|beautiful|perfect|got it|nice)[\s.!,]*(thanks?|thank you)?[\s.!]*$/.test(low)) return { kind: 'next' };
  return { kind: 'question' };
}

// ── understanding a reply by MEANING (Chad 10-13: "you cannot control how a person responds and force them to use exactly
// one word") ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const UNDERSTAND_SYSTEM = `Someone is reading a book with a companion by email, one page at a time. They just replied to a page.
Decide what they want. Reply with JSON only:
{"kind":"next|again|back|jump|where|stop|question|start","level":"introductory|serious|advanced|null","target":"chapter/section/event to jump to, or null","book":"a different book to start, or null"}
- next: they want to keep reading (any wording: "carry on", "lovely, more", "ok", "thanks, onward", a comment with no request)
- again: the same page redone deeper or differently ("not enough detail", "dig deeper", "redo with more on X")
- back / where / stop: previous page / where are we / pause the reading
- jump: go to a named chapter, section or event
- question: they ask something about what they read (answer it; do not move on) — if they ALSO ask to continue, choose next
- start: they ask to read a different book
- level: only if they ask for simpler / more scholarly notes.`;

/** The reply's meaning, from a small model; falls back to the rules if the model is unavailable. Never throws. */
export async function understandReply(text, { active = false, page = '', llm } = {}) {
  const rules = readingIntent(text, { active });
  if (!active || rules.kind === 'start' || !llm) return rules;
  try {
    const r = await llm({ system: UNDERSTAND_SYSTEM, user: `PAGE THEY JUST READ: ${page || 'unknown'}\nTHEIR REPLY: ${String(text).slice(0, 1500)}` });
    const j = r?.json;
    const kinds = ['next', 'again', 'back', 'jump', 'where', 'stop', 'question', 'start'];
    if (!j || !kinds.includes(j.kind)) return rules;
    if (j.kind === 'start') return j.book ? { kind: 'start', book: j.book, from: startFrom(text) } : rules;
    const level = ['introductory', 'serious', 'advanced'].includes(j.level) ? j.level : rules.level || null;
    const out = { kind: j.kind, ...(level ? { level } : {}), ...(j.kind === 'jump' && j.target ? { target: j.target } : {}), by: 'model' };
    if (out.kind === 'jump' && !out.target) return rules;
    return out;
  } catch { return rules; }
}

// ════ 4. RESEARCH ═══════════════════════════════════════════════════════════════════════════════════════════════════

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[‘’'`ʼ_-]/g, '').replace(/\s+/g, ' ').trim();
export const explainedKey = (t) => (t.id ? `e${t.id}` : `n:${fold(t.name)}`);

async function researchDefaults() {
  const [{ pageMentions }, { entityLookup, entityDossier }, { plannedSearch }, { llmJson }, { perplexityFallback }, { parallelResearch }] = await Promise.all([
    import('../repos/reading-repo.js'), import('../entity-api.js'), import('../planned-search.js'), Promise.resolve({ llmJson }),
    import('../perplexity.js'), import('../parallel-ai.js')]);
  const { withLinks } = await import('../hit-links.js');
  return { pageMentions, entityLookup, entityDossier, search: (q, o) => plannedSearch(q, o), links: withLinks, llmJson, perplexity: perplexityFallback, parallel: parallelResearch };
}

/** Pure: does an entity name match a target name (same folded words, or one contains the other)? */
export function sameName(a, b) {
  const x = fold(a).replace(/^(the|mulla|mirza|haji|siyyid|shaykh|aqa) /, ''), y = fold(b).replace(/^(the|mulla|mirza|haji|siyyid|shaykh|aqa) /, '');
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

const TARGETS_SYSTEM = `You prepare a reading guide for a SERIOUS reader of this book (READER describes what they already know).
For each paragraph, choose what is genuinely worth a note for THIS reader: lesser-known people, places as they were then,
works and tablets, events, offices and titles, Persian/Arabic/Turkish terms, period customs, allusions, cross-references.
NEVER choose what READER already knows (for a Bahá'í history: Persia, the Báb, Bahá'u'lláh, 'Abdu'l-Bahá, the Bahá'í Faith,
Islam, Muḥammad … unless the paragraph says something unusual about them — then name exactly that).
Prefer the specific and the surprising over the general. Skip anything in ALREADY_EXPLAINED. 0–3 per paragraph; none is fine.
"name" must be the EXACT words as they appear in the paragraph (it will be highlighted there).
Reply with JSON only: {"targets":[{"pid":"para_N","name":"exact words from the text","kind":"person|place|work|event|group|term","why":"<10 words: what is interesting"}]}`;

/** The page's note targets with their evidence. depth 1 = library; depth 2 = deeper library + web where thin. */
export async function researchPage({ docId, title, religion = null, items, explained = {}, depth = 1, level = '', deps } = {}) {
  const d = { ...(await researchDefaults()), ...(deps || {}) };
  const pids = items.map((p) => p.pid);
  const mentions = await d.pageMentions(docId, pids).catch(() => []);
  const byPid = new Map(pids.map((p) => [p, mentions.filter((m) => m.pid === p)]));
  const known = Object.entries(explained).filter(([k]) => !k.startsWith('__')).map(([, e]) => e.name).filter(Boolean);
  const role = modelFor('reading-targets');
  const ask = await d.llmJson({ ...role, caller: 'reading-targets', maxTokens: 1200, system: TARGETS_SYSTEM,
    user: `BOOK: ${title}\nREADER: ${level || 'a serious, well-read adult reader of this book'}\nALREADY_EXPLAINED: ${known.slice(-200).join('; ') || 'none'}\n\n${items.map((p) => `[${p.pid}] ${p.text}\nMENTIONED (resolved): ${(byPid.get(p.pid) || []).map((m) => m.name).join('; ') || '—'}`).join('\n\n')}` })
    .catch(() => ({ json: null }));
  const raw = Array.isArray(ask.json?.targets) ? ask.json.targets : [];
  // resolved mentions are OFFERED to the model (above), never forced in: forcing them noted "Persia" and "the Báb" (Chad 10-12)

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
  const citeAll = (title, url, kind = 'library') => {
    const i = sources.findIndex((s) => s.url && s.url === url && s.title === title);
    if (i >= 0) return `S${i + 1}`;
    sources.push({ title, url: url || null, kind });
    return `S${sources.length}`;
  };
  const fresh = targets.filter((t) => !t.seenAt).slice(0, depth > 1 ? 16 : 10);
  const claimsN = depth > 1 ? 20 : 12, passagesN = depth > 1 ? 4 : 3;
  await Promise.all(fresh.map(async (t) => {
    const ev = { summary: null, aliases: [], claims: [], passages: [], web: [] };
    t.labels = new Set();   // the only sources a note on this target may cite (guide.js strips any other label)
    const cite = (title, url, kind) => { const l = citeAll(title, url, kind); t.labels.add(l); return l; };
    if (t.id) {
      const dz = await d.entityDossier(t.id).catch(() => null);
      if (dz) {
        ev.summary = dz.summary ? `${dz.summary} [${cite(`SifterSearch record: ${dz.name}`, null)}]` : null;
        ev.aliases = (dz.aliases || []).slice(0, 12);
        const dated = dz.claims.filter((c) => c.when).concat(dz.claims.filter((c) => !c.when));
        ev.claims = dated.slice(0, claimsN).map((c) => ({ text: c.statement, when: c.when, src: c.source ? cite(c.source, c.url) : null }));
      }
    }
    if (!ev.summary || ev.claims.length < 3 || ['work', 'term', 'event'].includes(t.kind)) {
      const q = t.kind === 'term' ? `What is ${t.name}?` : t.kind === 'work' ? `${t.name} (the work)` : t.canonical || t.name;
      // the book's own tradition only: an open search drew a Dīghanikāya parallel into a Dawn-Breakers note (10-12)
      const r = await d.search(q, { limit: passagesN + 2, budgetMs: 2500, ...(religion ? { given: { religion } } : {}) }).catch(() => null);
      const hits = await d.links((r?.hits || []).filter((h) => h.doc_id !== docId).slice(0, passagesN)).catch(() => []);
      ev.passages = hits
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
      const l = citeAll(c?.title || 'web search', c?.url || null, 'web');
      t.labels.add(l);
      t.evidence.web.push({ text: r.text.slice(0, 1200), src: l });
    }
  }));
  return { targets, sources };
}

// ════ 5. GUIDE ══════════════════════════════════════════════════════════════════════════════════════════════════════

const outlines = new Map();   // docId → { at, outline, byPid }

async function defaults() {
  const [repo, docs, { researchPage }, { llmJson }, { config }, { plannedSearch }, { withLinks }] = await Promise.all([
    import('../repos/reading-repo.js'), import('../docs-repo.js'), Promise.resolve({ researchPage }), Promise.resolve({ llmJson }), import('../config.js'),
    import('../planned-search.js'), import('../hit-links.js')]);
  return { ...repo, listDocs: docs.listDocs, getParagraphs: docs.getParagraphs, researchPage, llmJson, libraryBase: config.library.basePath, readFile,
    search: plannedSearch, links: withLinks };
}

/** The reader's own words in an email turn: the last user message, quoted history cut. Pure. */
export const ownWords = (t) => String(t || '').split(/\n(?:On .{0,200}wrote:|-{2,} ?Original Message|>)/)[0].trim();

/** A book title → its OceanLibrary copy (the reading outline comes from its file). */
async function findBook(d, name) {
  const { docs } = await d.listDocs({ title: name, fields: ['id', 'title', 'author', 'religion', 'file_path', 'source_site'], limit: 50, count: false });
  const f = (s) => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const want = f(name);
  const score = (x) => (x.source_site === 'oceanlibrary.com' ? 4 : 0) + (/\.md$/.test(x.file_path || '') ? 1 : 0) + (f(x.title) === want ? 3 : f(x.title).startsWith(want) ? 1 : 0);
  // the best-scoring copy whose file actually reads as a book (a title LIKE can match a letter that merely names it)
  for (const x of docs.filter((y) => y.file_path).sort((a, b) => score(b) - score(a)).slice(0, 5)) {
    const o = await outlineOf(d, x).catch(() => null);
    if (o?.outline.paragraphs.length) return x;   // a plain file (no OceanLibrary paragraph ids) reads as nothing
  }
  return null;
}

async function outlineOf(d, doc) {
  const c = outlines.get(doc.id);
  if (c && Date.now() - c.at < 6 * 3600e3) return c;
  const outline = parseOutline(await d.readFile(join(d.libraryBase, doc.file_path), 'utf8'));
  // OceanLibrary paragraph id → our row (content id + writer): the page's mentions and each section's author
  const rows = await d.getParagraphs(doc.id, { proseOnly: false }).catch(() => []);
  const byPid = new Map(rows.filter((r) => r.external_para_id).map((r) => [r.external_para_id, r]));
  const v = { at: Date.now(), outline, byPid };
  outlines.set(doc.id, v);
  return v;
}

const shortTitle = (t) => String(t || '').replace(/^the\s+/i, '').replace(/[:—–].*$/, '').trim();
const sectionName = (key, sections) => {
  const s = sections.find((x) => x.key === key);
  return /^\d+$/.test(key) ? `Chapter ${key}${s?.title ? ` — ${titleCase(s.title)}` : ''}` : (s?.title ? titleCase(s.title) : key);
};
const titleCase = (s) => String(s).toLowerCase().replace(/(^|[\s(‘“-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

/** The subject line (Chad 10-13): [📖 Reading] Dawn-Breakers #3.4, Mulla Husayn arrives in Shiraz. Pure. */
// "[📖 Reading] Dawn-Breakers #3.4, Mulla Husayn arrives in Shiraz" (Chad 10-13: an icon so it stands out in the list)
export const READING_TAG = '[📖 Reading]';
export const subjectFor = (book, first, topic) => `${READING_TAG} ${shortTitle(book)} ${addressOf(first)}, ${String(topic || first.topic || '').replace(/\s+/g, ' ').trim().slice(0, 80)}`;

const NOTES_SYSTEM = `You are Anís, a reading companion helping someone study a book one page at a time by email (on a phone; later read aloud).
After a paragraph you may add NOTES on the words chosen for it — only where a note rewards THIS reader (READER says what they
already know: never explain that; a paragraph with nothing worth a note gets none).
Aim at the level of the book: specific, surprising, illuminating — a name's literal meaning and who gave a title, a person's
arc in two or three dated beats (later fates welcome), what a place or office was in that period, what a term meant to people then,
where else the Writings or other histories speak of this, a connection the reader would not see. Never a dictionary definition.
Write from the EVIDENCE; cite its labels like [S3]. Certain general background (dates, name meanings, Hijri↔Gregorian) needs no label.
Something in ALREADY_EXPLAINED gets at most one short line pointing back ("met in #Intro.3") and only if this paragraph adds to it.
Use EVIDENCE only where it illuminates the noted words themselves; never talk about the evidence ("a letter calls it…",
"the sources say…"); never cite a source for something it does not say; never pad a note with loosely related works. If the
evidence does not help, write from certain knowledge — or leave the words without a note.
Illuminate the text, never grade it: no verdicts that the author exaggerates, is wrong or is "rhetorical"; where sources differ,
say what each says. Spell names exactly as the book does (Nabíl, S̱háh, Ṭihrán).
"name" must be the EXACT words from the paragraph (they are highlighted in the text).
STYLE (Chad 10-13: "extremely clear and terse, not verbose"): 1–2 short sentences per note, facts only — no framing ("This
is…", "Townshend means…"), no commentary on the author, no summary of the paragraph. Dates and names carry the weight.
Never invent a fact, a date or a quotation.
Reply with JSON only: {"topic":"what happens on this page, ≤8 words","paragraphs":[{"pid":"para_N","notes":[{"name":"…","note":"…"}]}]}`;

// The reader's chosen depth of notes (Chad 10-13: three levels; "use the advanced level of notes"). All levels stay terse.
export const NOTE_LEVELS = {
  introductory: 'INTRODUCTORY — a newcomer: only the names and words a first reading needs; 1–2 notes per paragraph.',
  serious: 'SERIOUS — a well-read reader of this book (the default).',
  advanced: 'ADVANCED — scholarly: transliteration and roots of Persian/Arabic terms, where other sources (God Passes By, Browne, Nicolas, Balyuzi…) differ, both calendars, cross-references in the Writings; up to 4 notes per paragraph — still terse: dense facts, not longer prose.',
};

const LEVEL_SYSTEM = `In 3–4 sentences, describe the typical serious reader of this book: what they already know well (so a reading guide
must NOT explain it — list the obvious people, places, terms and history), and what kind of detail would genuinely deepen their
reading. Reply with JSON only: {"level":"…"}`;

/** What a serious reader of this book already knows — computed once per book, kept in the session (Chad 10-12: "establish a
 *  level of notes based on the book"). */
async function readerLevel(d, doc, session) {
  if (session?.explained?.__level?.text) return session.explained.__level.text;
  const r = await d.llmJson({ ...modelFor('reading-targets'), caller: 'reading-level', maxTokens: 400, system: LEVEL_SYSTEM,
    user: `BOOK: ${doc.title}${doc.author ? ` by ${doc.author}` : ''}` }).catch(() => null);
  return r?.json?.level || `A serious reader of ${doc.title}, already familiar with its main figures and its religious background.`;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const sup = (n) => String(n).split('').map((c) => SUP[Number(c)]).join('');

/** Where each noted name first stands in its paragraph (longest names first; never inside another's span). Pure.
 *  → [{ name, start, end }] in text order. */
export function noteSpans(text, names) {
  const t = String(text), spans = [];
  for (const n of [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length)) {
    for (let at = t.indexOf(n); at >= 0; at = t.indexOf(n, at + 1)) {
      if (spans.some((s) => at < s.end && at + n.length > s.start)) continue;   // inside a longer name already marked
      spans.push({ name: n, start: at, end: at + n.length });
      break;
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** The paragraph with its noted words highlighted and numbered (Chad 10-13: "tie the highlighted text to the note").
 *  spans carry their number n. Pure. */
export function highlight(text, spans) {
  const t = String(text);
  let out = '', last = 0;
  for (const s of spans) { out += `${t.slice(last, s.start)}<mark>${t.slice(s.start, s.end)}</mark>${sup(s.n)}`; last = s.end; }
  return out + t.slice(last);
}

function evidenceBlock(targets) {
  return targets.map((t) => {
    const e = t.evidence;
    if (!e) return `- ${t.name} [${t.pid}] ALREADY_EXPLAINED at ${t.seenAt}`;
    const lines = [`- ${t.name} (${t.kind}${t.canonical && t.canonical !== t.name ? `; library name: ${t.canonical}` : ''}) [${t.pid}]`];
    if (e.summary) lines.push(`  summary: ${e.summary}`);
    if (e.aliases?.length) lines.push(`  other names: ${e.aliases.join('; ')}`);
    for (const c of e.claims || []) lines.push(`  • ${c.when ? `${c.when}: ` : ''}${c.text}${c.src ? ` [${c.src}]` : ''}`);
    for (const p of e.passages || []) lines.push(`  passage [${p.src}]: ${p.text}`);
    for (const w of e.web || []) lines.push(`  WEB [${w.src}]: ${w.text}`);
    return lines.join('\n');
  }).join('\n');
}

/** A note may cite only the sources gathered for ITS target (10-13: a fact about Nabíl's pilgrimage came back labelled with the
 *  Book of Revelation). Labels outside the target's evidence are removed; a note matching no target keeps none. Pure. */
export function ownCitations(notes, targets) {
  const fold = (x) => String(x || '').toLowerCase();
  const labelsFor = (name) => {
    const t = targets.find((x) => x.name === name) || targets.find((x) => fold(x.name).includes(fold(name)) || fold(name).includes(fold(x.name)));
    return t?.labels || new Set();
  };
  return { ...notes, paragraphs: (notes.paragraphs || []).map((p) => ({ ...p, notes: (p.notes || []).map((n) => {
    const ok = labelsFor(n.name);
    return { ...n, note: String(n.note || '').replace(/\s*\[(S\d+)\]/g, (m, l) => (ok.has(l) ? m : '')) };
  }) })), look_closer: String(notes.look_closer || '').replace(/\s*\[S\d+\]/g, '') };
}

/** Cited sources only, renumbered S1, S2 … in order of first citation; the notes' labels rewritten to match. Pure. */
export function renumber(notes, sources) {
  const order = [];
  JSON.stringify(notes || {}).replace(/\[(S\d+)\]/g, (m, l) => { if (!order.includes(l)) order.push(l); return m; });
  const map = new Map(order.map((l, i) => [l, `S${i + 1}`]));
  const re = (t) => String(t ?? '').replace(/\[(S\d+)\]/g, (m, l) => (map.has(l) ? `[${map.get(l)}]` : ''));
  const out = { ...notes, look_closer: re(notes?.look_closer), next: re(notes?.next),
    paragraphs: (notes?.paragraphs || []).map((p) => ({ ...p, notes: (p.notes || []).map((n) => ({ ...n, note: re(n.note) })) })) };
  return { notes: out, sources: order.map((l) => sources[Number(l.slice(1)) - 1]).filter(Boolean) };
}

/** Page + notes → the email body (Markdown, compact and speakable). Pure. */
export function renderPage({ book, sectionLabel, author, items, notes, sources, pageNo }) {
  const byPid = new Map((notes?.paragraphs || []).map((p) => [p.pid, p.notes || []]));
  const head = `**${book} · ${sectionLabel}**${author ? ` (${author})` : ''} — ${addressOf(items[0])}${items.length > 1 ? `–${items[items.length - 1].n}` : ''}${pageNo ? ` · page ${pageNo}` : ''}`;
  let num = 0;
  const body = items.map((p) => {
    const ns = byPid.get(p.pid) || [];
    // one number per note, running through the page: the highlight in the text and the note share it
    const spans = noteSpans(p.text, ns.map((n) => n.name)).map((x) => ({ ...x, n: ++num }));
    const numOf = (n) => spans.find((x) => x.name === n.name)?.n;
    const ordered = [...ns].sort((a, b) => (numOf(a) ?? 1e9) - (numOf(b) ?? 1e9));
    return [`**${addressOf(p)}** ${highlight(p.text, spans)}`,
      ...(ordered.length ? ['', ...ordered.map((n) => `- ${numOf(n) ? `${sup(numOf(n))} ` : ''}**${n.name}** — ${n.note}`)] : [])].join('\n');
  }).join('\n\n');
  const used = new Set([...JSON.stringify(notes || {}).matchAll(/\[(S\d+)\]/g)].map((m) => m[1]));
  const src = sources.map((s, i) => ({ ...s, label: `S${i + 1}` })).filter((s) => used.has(s.label));
  // the page and its notes only (Chad 10-13: "do not do this part. keep it to notes for now" — no look-closer, teaser
  // or reply instructions)
  return [head, '', body,
    ...(src.length ? ['', '**Sources**', ...src.map((s) => `[${s.label}] ${s.url ? `[${s.title}](${s.url})` : s.title}${s.kind === 'web' ? ' (web)' : ''}`)] : []),
  ].join('\n');
}

async function buildPage(d, { session, doc, from, depth = 1 }) {
  const noteLevel = NOTE_LEVELS[session?.explained?.__prefs?.level] ? session.explained.__prefs.level : 'serious';
  const { outline, byPid } = await outlineOf(d, doc);
  const page = pageFrom(outline.paragraphs, from, { words: 220, max: 4 });   // phone-sized (Chad 10-12: half the first target)
  if (!page.items.length) return { done: true };
  const items = page.items;
  const sectionLabel = sectionName(items[0].section, outline.sections);
  const writers = items.map((p) => byPid.get(p.pid)).filter(Boolean).map((r) => effectiveAuthor({ authors: r.authors, author: doc.author }));
  const own = writers.find((w) => !w.fromBook)?.author;
  const author = own && own !== doc.author ? `by ${own}` : null;
  const explained = { ...(session?.explained || {}) };
  const level = await readerLevel(d, doc, session);
  explained.__level = { text: level };
  const research = await d.researchPage({ docId: doc.id, title: doc.title, religion: doc.religion || null, items, explained, depth, level: `${level} Notes level: ${NOTE_LEVELS[noteLevel]}` });
  const role = modelFor('reading-notes');
  const user = `BOOK: ${doc.title} — ${sectionLabel}${author ? ` (${author}; this section is NOT by ${doc.author})` : ` (by ${doc.author})`}
READER: ${level}
NOTES LEVEL: ${NOTE_LEVELS[noteLevel]}
${depth > 1 ? 'The reader asked to go DEEPER on this page: fuller timelines, more context, more connections.\n' : ''}
PAGE:
${items.map((p) => `[${p.pid}] ${addressOf(p)} ${p.text}`).join('\n\n')}

EVIDENCE (cite with the labels):
${evidenceBlock(research.targets)}

ALREADY_EXPLAINED: ${research.targets.filter((t) => t.seenAt).map((t) => `${t.name} (${t.seenAt})`).join('; ') || 'none'}`;
  const r = await d.llmJson({ ...role, caller: 'reading-notes', system: NOTES_SYSTEM, user, maxTokens: depth > 1 ? 5000 : 3500 });
  const { notes, sources } = renumber(ownCitations(r.json || { paragraphs: [] }, research.targets), research.sources);
  // explained = what a note actually covered (a researched target the writer skipped stays available for later)
  const noted = (notes.paragraphs || []).flatMap((p) => (p.notes || []).map((n) => n.name));
  for (const t of research.targets) if (!t.seenAt && noted.some((n) => n === t.name || (n && t.name && (n.includes(t.name) || t.name.includes(n)))))
    explained[t.key] = { name: t.canonical || t.name, at: addressOf(items.find((p) => p.pid === t.pid) || items[0]) };
  const pageNo = (session?.pages?.length || 0) + 1;
  const byPidNotes = new Map((notes.paragraphs || []).map((p) => [p.pid, p.notes || []]));
  // STRUCTURED page for any caller (web, chat, audio — paragraph voice + notes voice): the email is one rendering of it
  const structured = { book: doc.title, docId: doc.id, section: sectionLabel, author, pageNo, topic: notes.topic || null,
    paragraphs: items.map((p) => ({ address: addressOf(p), pid: p.pid, topic: p.topic || null, text: p.text, highlights: noteSpans(p.text, (byPidNotes.get(p.pid) || []).map((n) => n.name)), notes: byPidNotes.get(p.pid) || [] })),
    sources: sources.map((x, i) => ({ label: `S${i + 1}`, ...x })) };
  return { items, next: page.next, notes, explained, page: structured, reply: renderPage({ book: doc.title, sectionLabel, author, items, notes, sources, pageNo }),
    subject: subjectFor(doc.title, items[0], notes.topic) };
}

function layoutReply(doc, outline) {
  const s = outline.sections.filter((x) => x.key !== 'Front');
  const list = s.map((x) => `- ${/^\d+$/.test(x.key) ? `Chapter ${x.key}` : x.key}${x.title && !/^\d+$/.test(x.key) ? '' : x.title ? ` — ${titleCase(x.title)}` : ''}`);
  return `Gladly — let's read **${doc.title}** together, a page at a time, with notes after each paragraph on the people, places, works and words it mentions.\n\nWhere would you like to begin?\n\n${list.slice(0, 40).join('\n')}\n\nFor a first reading I'd start with the **Introduction** — it sets the scene of Persia and Islam in the 1840s that the whole story moves through. Just reply with where you'd like to start.`;
}

/** One reading turn. → null (not reading: ordinary Anís) | { reply, subject } */
export async function readingTurn({ messages = [], participantId, reset = false, deps } = {}) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const text = ownWords(lastUser?.content);
  if (!text || !participantId) return null;
  const d = { ...(await defaults()), ...(deps || {}) };
  let session = await d.latestSession(participantId).catch(() => null);
  // a reply in a reading is understood by meaning (a small model, in the API: no waiting); the rules are the fallback
  const lastPage = session?.pages?.at(-1)?.subject || '';
  const intent = await understandReply(text, { active: !!session, page: lastPage,
    llm: d.understand ?? ((m) => d.llmJson({ ...modelFor('reading-targets'), caller: 'reading-understand', maxTokens: 200, ...m })) });
  // a notes level asked for anywhere ("…and use the advanced level of notes") is kept for the rest of the book
  if (intent.level && session) session = { ...session, explained: { ...(session.explained || {}), __prefs: { ...(session.explained?.__prefs || {}), level: intent.level } } };
  // a question about the page being read is answered IN the reading (10-13: it fell through to an ordinary answer)
  if (intent.kind === 'question' && session?.pages?.length) return answerInReading(d, { session, text });
  if (intent.kind === 'none' || intent.kind === 'question') {
    // a session waiting for its starting point: a reply naming one ("the introduction", "chapter 3") starts it
    if (session && !session.pages?.length && intent.kind === 'question') {
      const doc = { id: session.doc_id, title: session.title };
      const full = (await d.listDocs({ ids: [session.doc_id], fields: ['id', 'title', 'author', 'religion', 'file_path'], limit: 1, count: false })).docs[0];
      const { outline } = await outlineOf(d, full || doc);
      const at = startIndex(outline.paragraphs, text);
      if (at != null) return turnPage(d, { participantId, session, doc: full, from: at });
    }
    return null;
  }
  if (intent.kind === 'start') {
    const doc = await findBook(d, intent.book);
    if (!doc) return { reply: `I couldn't find "${intent.book}" in the library. Could you give me its exact title (or the author)?`, subject: null };
    session = await d.sessionFor(participantId, doc.id).catch(() => null);
    // reset: begin the book afresh — no pages, nothing explained (a re-read after the guide itself changed)
    if (reset && session) session = { ...session, pages: [], explained: {}, cursor: 0 };
    if (intent.level) session = { ...(session || { pages: [], explained: {} }), explained: { ...(session?.explained || {}), __prefs: { level: intent.level } } };
    const { outline } = await outlineOf(d, doc);
    const at = intent.from ? startIndex(outline.paragraphs, intent.from) : null;
    if (at == null && !session?.pages?.length) {
      await d.saveSession({ participantId, docId: doc.id, title: doc.title, cursor: 0, pages: [], explained: session?.explained || {} });
      return { reply: layoutReply(doc, outline), subject: `${READING_TAG} ${shortTitle(doc.title)}, where shall we begin?` };
    }
    return turnPage(d, { participantId, session: session || { pages: [], explained: {} }, doc, from: at ?? session.cursor });
  }
  const doc = (await d.listDocs({ ids: [session.doc_id], fields: ['id', 'title', 'author', 'religion', 'file_path'], limit: 1, count: false })).docs[0];
  if (!doc) return null;
  const pages = session.pages || [];
  if (intent.kind === 'where') {
    const { outline } = await outlineOf(d, doc);
    const p = outline.paragraphs[session.cursor];
    return { reply: p ? `We're in **${doc.title}**, at ${addressOf(p)} (${sectionName(p.section, outline.sections)}${p.topic ? ` · ${p.topic}` : ''}). Reply **next** to continue.` : `We've reached the end of **${doc.title}**.`, subject: null };
  }
  if (intent.kind === 'stop') {
    await d.saveSession({ participantId, docId: doc.id, title: doc.title, cursor: session.cursor, pages, explained: session.explained, status: 'paused' });
    return { reply: `I've kept our place in **${doc.title}**. Whenever you'd like to continue, write "help me study ${shortTitle(doc.title)}" and we'll pick up where we left off.`, subject: null };
  }
  if (intent.kind === 'again') return turnPage(d, { participantId, session, doc, from: pages.at(-1)?.from ?? session.cursor, depth: intent.relevel ? 1 : 2, redo: true });
  // back = the page before the last one sent; with only one page sent, that page again (never the front matter)
  if (intent.kind === 'back') return turnPage(d, { participantId, session, doc, from: pages.at(-2)?.from ?? pages.at(-1)?.from ?? session.cursor });
  if (intent.kind === 'jump') {
    const { outline } = await outlineOf(d, doc);
    let at = startIndex(outline.paragraphs, intent.target);
    if (at == null) {
      const words = String(intent.target).toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      at = outline.paragraphs.findIndex((p) => words.length && words.every((w) => `${p.topic} ${p.text}`.toLowerCase().includes(w)));
    }
    if (at == null || at < 0) return { reply: `I couldn't find "${intent.target}" in **${doc.title}**. Try a chapter number, or a name from the chapter you want.`, subject: null };
    return turnPage(d, { participantId, session, doc, from: at });
  }
  return turnPage(d, { participantId, session, doc, from: session.cursor });   // next
}

const ANSWER_SYSTEM = `You are Anís, reading a book with someone by email, one page at a time. They asked a question about the page they
just read. Answer it directly and warmly, at the level of the book, from the PAGE and the LIBRARY passages given; cite passages with
their labels like [S2]. Certain general background needs no label. Never invent a fact, date or quotation; if the library does not
answer it, say so briefly. 1–3 short paragraphs, speakable. Spell names as the book does.
Reply with JSON only: {"answer":"…"}`;

/** A question about the page just read — answered in the reading's context; the bookmark does not move. */
async function answerInReading(d, { session, text }) {
  const doc = (await d.listDocs({ ids: [session.doc_id], fields: ['id', 'title', 'author', 'religion', 'file_path'], limit: 1, count: false })).docs[0];
  if (!doc) return null;
  const { outline } = await outlineOf(d, doc);
  const last = session.pages.at(-1);
  const items = outline.paragraphs.slice(last.from, last.to + 1);
  const r = await d.search(text, { limit: 6, budgetMs: 3000, ...(doc.religion ? { given: { religion: doc.religion } } : {}) }).catch(() => null);
  const hits = await d.links((r?.hits || []).slice(0, 6)).catch(() => []);
  const sources = hits.map((h) => ({ title: h.title || 'library', url: h.url || null }));
  const out = await d.llmJson({ ...modelFor('reading-notes'), caller: 'reading-answer', maxTokens: 1500, system: ANSWER_SYSTEM,
    user: `BOOK: ${doc.title}\nPAGE:\n${items.map((p) => `${addressOf(p)} ${p.text}`).join('\n\n')}\n\nLIBRARY:\n${hits.map((h, i) => `[S${i + 1}] ${h.title}: ${String(h.text || '').replace(/⁅\/?s\d+⁆/g, '').slice(0, 700)}`).join('\n\n') || 'none'}\n\nQUESTION: ${text}` });
  const answer = out.json?.answer || out.text || '';
  const { notes, sources: used } = renumber({ paragraphs: [{ pid: 'a', notes: [{ name: 'a', note: answer }] }] }, sources);
  const body = notes.paragraphs[0].notes[0].note;
  return { reply: [body,
    ...(used.length ? ['', '**Sources**', ...used.map((x, i) => `[S${i + 1}] ${x.url ? `[${x.title}](${x.url})` : x.title}`)] : [])].join('\n'), subject: null };
}

async function turnPage(d, { participantId, session, doc, from, depth = 1, redo = false }) {
  const pg = await buildPage(d, { session, doc, from, depth });
  if (pg.done) return { reply: `We've reached the end of **${doc.title}**. It has been a joy reading it with you — what would you like to read next?`, subject: `${READING_TAG} ${shortTitle(doc.title)}, the end` };
  const pages = [...(session.pages || [])];
  if (redo && pages.length) pages.pop();
  pages.push({ from, to: pg.next - 1, subject: pg.subject, depth, at: new Date().toISOString() });
  await d.saveSession({ participantId, docId: doc.id, title: doc.title, cursor: pg.next, pages: pages.slice(-500), explained: pg.explained });
  return { reply: pg.reply, subject: pg.subject, page: pg.page, bookmark: { docId: doc.id, cursor: pg.next } };
}

