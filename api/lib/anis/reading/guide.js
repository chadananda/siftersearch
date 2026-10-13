// Anís READING GUIDE (Chad 10-12: "help me study X book" — a page of the book per email, each paragraph followed by
// notes that drill into its people, places, tablets and terms; the reader replies "next", "again", or asks). One turn:
// the reader's message → (null = not a reading turn: ordinary Anís answers it) | { reply, subject }.
// State per reader × book in reading_sessions (bookmark, pages sent, what is already explained — never repeated).
// Deps: reading/{intent,outline,research,llm}, repos/reading-repo, docs-repo, config (library path). Injectable.
import { readFile } from 'fs/promises';
import { join } from 'path';
import { readingIntent, bookFrom } from './intent.js';
import { parseOutline, pageFrom, startIndex, addressOf } from './outline.js';
import { modelFor } from '../../model-roles.js';
import { effectiveAuthor } from '../../authorship/effective.js';

const outlines = new Map();   // docId → { at, outline, byPid }

async function defaults() {
  const [repo, docs, { researchPage }, { llmJson }, { config }] = await Promise.all([
    import('../../repos/reading-repo.js'), import('../../docs-repo.js'), import('./research.js'), import('./llm.js'), import('../../config.js')]);
  return { ...repo, listDocs: docs.listDocs, getParagraphs: docs.getParagraphs, researchPage, llmJson, libraryBase: config.library.basePath, readFile };
}

/** The reader's own words in an email turn: the last user message, quoted history cut. Pure. */
export const ownWords = (t) => String(t || '').split(/\n(?:On .{0,200}wrote:|-{2,} ?Original Message|>)/)[0].trim();

/** A book title → its OceanLibrary copy (the reading outline comes from its file). */
async function findBook(d, name) {
  const { docs } = await d.listDocs({ title: name, fields: ['id', 'title', 'author', 'religion', 'file_path', 'source_site'], limit: 50, count: false });
  const f = (s) => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const want = f(name);
  const score = (x) => (x.source_site === 'oceanlibrary.com' ? 4 : 0) + (/\.md$/.test(x.file_path || '') ? 1 : 0) + (f(x.title) === want ? 3 : f(x.title).startsWith(want) ? 1 : 0);
  return docs.filter((x) => x.file_path).sort((a, b) => score(b) - score(a))[0] || null;
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

/** The subject line: [Reading] Dawn-Breakers #5.7 - Bab's pilgrimage to Mecca (Chad 10-12). Pure. */
export const subjectFor = (book, first, topic) => `[Reading] ${shortTitle(book)} ${addressOf(first)} - ${String(topic || first.topic || '').replace(/\s+/g, ' ').trim().slice(0, 80)}`;

const NOTES_SYSTEM = `You are Anís, a reading companion helping someone study a book one page at a time by email (on a phone; later read aloud).
After a paragraph you may add NOTES on the words chosen for it — only where a note rewards THIS reader (READER says what they
already know: never explain that; a paragraph with nothing worth a note gets none).
Aim at the level of the book: specific, surprising, illuminating — a name's literal meaning and who gave a title, a person's
arc in two or three dated beats (later fates welcome), what a place or office was in that period, what a term meant to people then,
where else the Writings or other histories speak of this, a connection the reader would not see. Never a dictionary definition.
Write from the EVIDENCE; cite its labels like [S3]. Certain general background (dates, name meanings, Hijri↔Gregorian) needs no label.
Something in ALREADY_EXPLAINED gets at most one short line pointing back ("met in #Intro.3") and only if this paragraph adds to it.
Illuminate the text, never grade it: no verdicts that the author exaggerates, is wrong or is "rhetorical"; where sources differ,
say what each says. Spell names exactly as the book does (Nabíl, S̱háh, Ṭihrán).
"name" must be the EXACT words from the paragraph (they are highlighted in the text). Style: compact, warm, precise, speakable;
2–4 short sentences per note; no headings, no nested bullets. Never invent a fact, a date or a quotation.
Reply with JSON only: {"topic":"what happens on this page, ≤8 words","paragraphs":[{"pid":"para_N","notes":[{"name":"…","note":"…"}]}],
"look_closer":"one striking detail worth a second look (1–2 sentences, or empty)","next":"one line inviting the next page, no spoilers of its plot"}`;

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
  return [head, '', body,
    ...(notes?.look_closer ? ['', `**Look closer** — ${notes.look_closer}`] : []),
    '', `${notes?.next ? `${notes.next} ` : ''}Reply **next** to read on, **again** if you want me to dig deeper on this page, or ask me anything about it.`,
    ...(src.length ? ['', '**Sources**', ...src.map((s) => `[${s.label}] ${s.url ? `[${s.title}](${s.url})` : s.title}${s.kind === 'web' ? ' (web)' : ''}`)] : []),
  ].join('\n');
}

async function buildPage(d, { session, doc, from, depth = 1 }) {
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
  const research = await d.researchPage({ docId: doc.id, title: doc.title, religion: doc.religion || null, items, explained, depth, level });
  const role = modelFor('reading-notes');
  const user = `BOOK: ${doc.title} — ${sectionLabel}${author ? ` (${author}; this section is NOT by ${doc.author})` : ` (by ${doc.author})`}
READER: ${level}
${depth > 1 ? 'The reader asked to go DEEPER on this page: fuller timelines, more context, more connections.\n' : ''}
PAGE:
${items.map((p) => `[${p.pid}] ${addressOf(p)} ${p.text}`).join('\n\n')}

EVIDENCE (cite with the labels):
${evidenceBlock(research.targets)}

ALREADY_EXPLAINED: ${research.targets.filter((t) => t.seenAt).map((t) => `${t.name} (${t.seenAt})`).join('; ') || 'none'}`;
  const r = await d.llmJson({ ...role, caller: 'reading-notes', system: NOTES_SYSTEM, user, maxTokens: depth > 1 ? 5000 : 3500 });
  const { notes, sources } = renumber(r.json || { paragraphs: [] }, research.sources);
  // explained = what a note actually covered (a researched target the writer skipped stays available for later)
  const noted = (notes.paragraphs || []).flatMap((p) => (p.notes || []).map((n) => n.name));
  for (const t of research.targets) if (!t.seenAt && noted.some((n) => n === t.name || (n && t.name && (n.includes(t.name) || t.name.includes(n)))))
    explained[t.key] = { name: t.canonical || t.name, at: addressOf(items.find((p) => p.pid === t.pid) || items[0]) };
  const pageNo = (session?.pages?.length || 0) + 1;
  const byPidNotes = new Map((notes.paragraphs || []).map((p) => [p.pid, p.notes || []]));
  // STRUCTURED page for any caller (web, chat, audio — paragraph voice + notes voice): the email is one rendering of it
  const structured = { book: doc.title, docId: doc.id, section: sectionLabel, author, pageNo, topic: notes.topic || null,
    paragraphs: items.map((p) => ({ address: addressOf(p), pid: p.pid, topic: p.topic || null, text: p.text, highlights: noteSpans(p.text, (byPidNotes.get(p.pid) || []).map((n) => n.name)), notes: byPidNotes.get(p.pid) || [] })),
    lookCloser: notes.look_closer || null, next: notes.next || null, sources: sources.map((x, i) => ({ label: `S${i + 1}`, ...x })) };
  return { items, next: page.next, notes, explained, page: structured, reply: renderPage({ book: doc.title, sectionLabel, author, items, notes, sources, pageNo }),
    subject: subjectFor(doc.title, items[0], notes.topic) };
}

function layoutReply(doc, outline) {
  const s = outline.sections.filter((x) => x.key !== 'Front');
  const list = s.map((x) => `- ${/^\d+$/.test(x.key) ? `Chapter ${x.key}` : x.key}${x.title && !/^\d+$/.test(x.key) ? '' : x.title ? ` — ${titleCase(x.title)}` : ''}`);
  return `Gladly — let's read **${doc.title}** together, a page at a time, with notes after each paragraph on the people, places, works and words it mentions.\n\nWhere would you like to begin?\n\n${list.slice(0, 40).join('\n')}\n\nFor a first reading I'd start with the **Introduction** — it sets the scene of Persia and Islam in the 1840s that the whole story moves through. Just reply with where you'd like to start.`;
}

/** One reading turn. → null (not reading: ordinary Anís) | { reply, subject } */
export async function readingTurn({ messages = [], participantId, deps } = {}) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const text = ownWords(lastUser?.content);
  if (!text || !participantId) return null;
  const d = { ...(await defaults()), ...(deps || {}) };
  let session = await d.latestSession(participantId).catch(() => null);
  const intent = readingIntent(text, { active: !!session });
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
    const { outline } = await outlineOf(d, doc);
    const at = intent.from ? startIndex(outline.paragraphs, intent.from) : null;
    if (at == null && !session?.pages?.length) {
      await d.saveSession({ participantId, docId: doc.id, title: doc.title, cursor: 0, pages: [], explained: session?.explained || {} });
      return { reply: layoutReply(doc, outline), subject: `[Reading] ${shortTitle(doc.title)} - where shall we begin?` };
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
  if (intent.kind === 'again') return turnPage(d, { participantId, session, doc, from: pages.at(-1)?.from ?? session.cursor, depth: 2, redo: true });
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

async function turnPage(d, { participantId, session, doc, from, depth = 1, redo = false }) {
  const pg = await buildPage(d, { session, doc, from, depth });
  if (pg.done) return { reply: `We've reached the end of **${doc.title}**. It has been a joy reading it with you — what would you like to read next?`, subject: `[Reading] ${shortTitle(doc.title)} - the end` };
  const pages = [...(session.pages || [])];
  if (redo && pages.length) pages.pop();
  pages.push({ from, to: pg.next - 1, subject: pg.subject, depth, at: new Date().toISOString() });
  await d.saveSession({ participantId, docId: doc.id, title: doc.title, cursor: pg.next, pages: pages.slice(-500), explained: pg.explained });
  return { reply: pg.reply, subject: pg.subject, page: pg.page, bookmark: { docId: doc.id, cursor: pg.next } };
}

export { bookFrom };
