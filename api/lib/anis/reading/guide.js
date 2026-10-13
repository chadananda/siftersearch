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
  const { docs } = await d.listDocs({ title: name, fields: ['id', 'title', 'author', 'file_path', 'source_site'], limit: 50, count: false });
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

const NOTES_SYSTEM = `You are Anís, a reading companion helping someone study a book one page at a time by email (later read aloud).
After each paragraph you add NOTES that drill into what the paragraph names — so the reader understands more deeply.
Write from the EVIDENCE given; cite it with its labels like [S3]. General background you are certain of (dates, the meaning of a
Persian/Arabic/Turkish name or word, Hijri↔Gregorian conversion) may be stated without a label.
For a PERSON: the name in Persian/Arabic script, the literal meaning of each part of the name, other names and titles (and who
gave them), a compact timeline (birth · key moments · death — later fates are welcome, the reader wants the whole life), and how
they relate to this story. For a PLACE: modern name and location, what it was like then, why it matters here. For a WORK or
TABLET: what its title means, when and to whom, where it can be read. For a TERM: what a reader of that time understood by it.
Someone or something in ALREADY_EXPLAINED gets ONE short line pointing back ("met in #Intro.3") plus anything new.
Style: compact, warm, precise, speakable — short sentences, no filler, no headings inside notes, no bullet nesting.
1–4 sentences per note; skip a target that adds nothing. Never invent a fact, a date or a quotation.
Reply with JSON only: {"topic":"what happens on this page, ≤8 words","paragraphs":[{"pid":"para_N","notes":[{"name":"…","note":"…"}]}],
"look_closer":"one striking detail worth a second look (1–2 sentences, or empty)","next":"one line inviting the next page, no spoilers of its plot"}`;

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

/** Page + notes → the email body (Markdown, compact and speakable). Pure. */
export function renderPage({ book, sectionLabel, author, items, notes, sources, pageNo }) {
  const byPid = new Map((notes?.paragraphs || []).map((p) => [p.pid, p.notes || []]));
  const head = `**${book} · ${sectionLabel}**${author ? ` (${author})` : ''} — ${addressOf(items[0])}${items.length > 1 ? `–${items[items.length - 1].n}` : ''}${pageNo ? ` · page ${pageNo}` : ''}`;
  const body = items.map((p) => {
    const ns = byPid.get(p.pid) || [];
    return [`**${addressOf(p)}** ${p.text}`, ...(ns.length ? ['', ...ns.map((n) => `- **${n.name}** — ${n.note}`)] : [])].join('\n');
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
  const page = pageFrom(outline.paragraphs, from);
  if (!page.items.length) return { done: true };
  const items = page.items;
  const sectionLabel = sectionName(items[0].section, outline.sections);
  const writers = items.map((p) => byPid.get(p.pid)).filter(Boolean).map((r) => effectiveAuthor({ authors: r.authors, author: doc.author }));
  const own = writers.find((w) => !w.fromBook)?.author;
  const author = own && own !== doc.author ? `by ${own}` : null;
  const explained = { ...(session?.explained || {}) };
  const research = await d.researchPage({ docId: doc.id, title: doc.title, items, explained, depth });
  const role = modelFor('reading-notes');
  const user = `BOOK: ${doc.title} — ${sectionLabel}${author ? ` (${author}; this section is NOT by ${doc.author})` : ` (by ${doc.author})`}
${depth > 1 ? 'The reader asked to go DEEPER on this page: fuller timelines, more context, every name explained.\n' : ''}
PAGE:
${items.map((p) => `[${p.pid}] ${addressOf(p)} ${p.text}`).join('\n\n')}

EVIDENCE (cite with the labels):
${evidenceBlock(research.targets)}

ALREADY_EXPLAINED: ${research.targets.filter((t) => t.seenAt).map((t) => `${t.name} (${t.seenAt})`).join('; ') || 'none'}`;
  const r = await d.llmJson({ ...role, caller: 'reading-notes', system: NOTES_SYSTEM, user, maxTokens: depth > 1 ? 5000 : 3500 });
  const notes = r.json || { paragraphs: [] };
  for (const t of research.targets) if (!t.seenAt) explained[t.key] = { name: t.canonical || t.name, at: addressOf(items.find((p) => p.pid === t.pid) || items[0]) };
  const pageNo = (session?.pages?.length || 0) + 1;
  return { items, next: page.next, notes, explained, reply: renderPage({ book: doc.title, sectionLabel, author, items, notes, sources: research.sources, pageNo }),
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
      const full = (await d.listDocs({ ids: [session.doc_id], fields: ['id', 'title', 'author', 'file_path'], limit: 1, count: false })).docs[0];
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
  const doc = (await d.listDocs({ ids: [session.doc_id], fields: ['id', 'title', 'author', 'file_path'], limit: 1, count: false })).docs[0];
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
  if (intent.kind === 'back') return turnPage(d, { participantId, session, doc, from: pages.at(-2)?.from ?? 0 });
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
  return { reply: pg.reply, subject: pg.subject };
}

export { bookFrom };
