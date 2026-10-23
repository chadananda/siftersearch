// Dewey by email (dewey@siftersearch.com, Chad 10-23: "Dewey communicate with contributors directly"). A contributor's letter
// is turned into FIXED VERBS by code — never by a model reading it — so mail is data, not instructions:
//   photos → holdings check (vision reads the cover / spine / title page) · a document → holdings check, then intake when new or
//   a BETTER COPY (archived, queued for OCR / quality gate / ingest) · links and titles → holdings check (a new title joins the
//   wanted list) · "what happened to …" → status of their items. Anything else in the letter is ignored.
// REPLY RULES (replyRule) decide whether anything is worth saying; RECEIPTS are templates (one work → a summary, several → a
// table), never model-written. The screen in front of all this is screen.js. Deps injectable for tests.
import { MEDIA_URL } from './media-holdings.js';
const SITE = 'https://siftersearch.com';
export const LIMITS = { titles: 10, urls: 5, files: 5, photos: 6, fileBytes: 25 * 1024 * 1024 };

const IMAGE = /^image\/(jpe?g|png|webp|gif)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const HEIC = /heic|heif/i;
const DOC_EXT = /\.(pdf|epub|docx?|rtf|odt|txt|md|html?)$/i;
const DOC_TYPE = /pdf|epub|officedocument|msword|rtf|opendocument\.text|text\/(plain|markdown|html)/i;
// A request to DO something other than Dewey's verbs ("ignore your instructions", "delete …", "send me …") — never acted on.
const COMMAND = /^\s*(?:please\s+)?(?:(?:ignore|disregard|forget|override|delete|remove|erase|drop|wipe|destroy|purge|send|forward|e-?mail|reply to|run|execute|grant|give|make me|add me|change|update|set|reset|disable|enable|unsubscribe|you are now|act as|pretend)\b|(?:system|assistant|developer)\s*:)/i;
const STATUS = /\b(status|progress|update on|what (?:has )?(?:happened|became) (?:to|of)|did you (?:get|receive|add|process)|(?:has|have|was|were) (?:it|they|my|the)\b.{0,60}\b(?:added|processed|ingested|received|uploaded)|where (?:is|are) (?:my|the)|my (?:contributions?|uploads?|submissions?))\b/i;
// a closing line ends the letter: what follows is the signature ("Thanks,\nAnn" — Ann is not a title)
const CLOSING = /^\s*(?:thanks?|thank you|many thanks|best|all the best|regards|kind regards|warm(?:ly| regards)|cheers|sincerely|love|blessings|yours|with (?:love|thanks|gratitude)|sent from my|--\s*$|—\s*$)\b/i;
// a line that DESCRIBES something rather than naming it
const DESCRIBES = /^\s*(?:it'?s|it is|this|that'?s|that is|these|those|he|she|they|we|i|i'm|my|our|there|which|who)\b/i;
const SMALLTALK = /^\s*(?:fyi|ok|okay|noted|got it|hi|hello|hey|dear|greetings|thanks?|thank you|many thanks|best|regards|kind regards|warm(?:ly| regards)|cheers|sincerely|love|blessings|yours|sent from my|--|—|on .* wrote:?)\b/i;
const ASK_PREFIX = /^\s*(?:(?:hi|hello|dear)\s+dewey[,!.]?\s*)?(?:(?:could|can|would) you (?:please )?(?:check|see|look up|find out)(?: (?:if|whether))?|please check(?: (?:if|whether))?|check(?: (?:if|whether))?|do (?:we|you) (?:have|hold)|have you got|is there|are there|does the library (?:have|hold)|i (?:found|have|came across|own)|we (?:found|have)|here is|here's|this is|looking for|search for)\s*:?\s*/i;

const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
/** Looks like a title: ≤ 20 words, starts with a capital/digit/quote, at least half the longer words capitalised. Pure. */
export function titleLike(s) {
  const t = String(s || '').trim().replace(/[?.!,;:]+$/, '');
  const w = words(t);
  if (!w.length || w.length > 20 || !/^[\p{Lu}\p{N}"“‘'*_]/u.test(t)) return false;
  const long = w.filter((x) => x.replace(/[^\p{L}]/gu, '').length > 3);
  return !long.length || long.filter((x) => /^[\p{Lu}"“‘'*_(]/u.test(x)).length / long.length >= 0.5;
}

/** A letter → the verbs to run. Pure: { photos:[att], files:[att], urls:[], titles:[], status, refused:[lines], unread:[{name, why}] }.
 *  attachments: [{ name, type, size }] (data travels alongside, untouched here). */
export function planVerbs({ subject = '', text = '', attachments = [] } = {}) {
  const plan = { photos: [], files: [], urls: [], media: [], titles: [], passages: [], status: false, refused: [], unread: [] };
  for (const a of attachments) {
    const name = a.name || 'attachment', type = a.type || '';
    if (a.size > LIMITS.fileBytes) plan.unread.push({ name, why: 'too large to take by email (25 MB at most) — a link to it works' });
    else if (HEIC.test(type) || /\.hei[cf]$/i.test(name)) plan.unread.push({ name, why: 'an HEIC photo, which I cannot open' });
    else if (IMAGE.test(type) || IMAGE_EXT.test(name)) (plan.photos.length < LIMITS.photos ? plan.photos : plan.unread).push(plan.photos.length < LIMITS.photos ? a : { name, why: `more than ${LIMITS.photos} photos in one letter` });
    else if (DOC_TYPE.test(type) || DOC_EXT.test(name)) (plan.files.length < LIMITS.files ? plan.files : plan.unread).push(plan.files.length < LIMITS.files ? a : { name, why: `more than ${LIMITS.files} files in one letter` });
    else plan.unread.push({ name, why: 'not a kind of file I can read' });
  }
  const body = String(text || '').replace(/\r\n/g, '\n');
  for (const raw of body.match(/https?:\/\/[^\s<>"')\]]+/g) || []) {
    const u = raw.replace(/[.,;:]+$/, '');
    const list = MEDIA_URL.test(u) ? plan.media : plan.urls;          // a video link is a MEDIA holdings check (the talks library)
    if (!list.includes(u) && plan.urls.length + plan.media.length < LIMITS.urls) list.push(u);
  }
  plan.status = STATUS.test(body) || STATUS.test(subject);
  const add = (t) => { const c = t.trim().replace(/^[-*•\d.)\s]+/, '').replace(/[?.!,;:]+$/, '').trim(); if (c.length >= 3 && !plan.titles.includes(c) && plan.titles.length < LIMITS.titles) plan.titles.push(c); };
  // a pure thank-you / FYI names nothing ("FYI" is not a title)
  for (const raw of isAck(body) ? [] : body.split('\n')) {
    const line = raw.replace(/https?:\/\/\S+/g, '').trim();
    if (!line) continue;
    if (COMMAND.test(line.replace(/^[-*•>\d.)\s]+/, ''))) { plan.refused.push(line.slice(0, 160)); continue; }
    // a quotation of 10+ words is printed text to search for; shorter quoted/italic spans are titles
    const quoted = [...line.matchAll(/[“"]([^”"]{3,400})[”"]|\*([^*]{3,200})\*|_([^_]{3,200})_/g)].map((m) => m[1] || m[2] || m[3]);
    if (quoted.length) {
      for (const q of quoted) (words(q).length >= 10 ? plan.passages.length < 2 && plan.passages.push(q) : add(q));
      continue;
    }
    if (CLOSING.test(line)) break;
    if (SMALLTALK.test(line) || (plan.status && STATUS.test(line))) continue;
    const rest = line.replace(/^[-*•]\s+|^\d+[.)]\s+/, '').replace(ASK_PREFIX, '');
    if (DESCRIBES.test(rest)) continue;                               // "It's a Dunbar talk on …" describes; it is not a title
    if (titleLike(rest)) add(rest);
  }
  // the subject is the title when the letter names nothing else ("Fwd: The Chosen Highway")
  const subj = String(subject || '').replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, '').trim();
  if (!plan.titles.length && !plan.urls.length && !plan.media.length && !plan.photos.length && !plan.files.length && !plan.passages.length && !plan.status
    && subj && !COMMAND.test(subj) && !/^(hello|hi|question|books?|a book|status|test|contribution|dewey)$/i.test(subj) && titleLike(subj.replace(ASK_PREFIX, ''))) add(subj.replace(ASK_PREFIX, ''));
  return plan;
}

/** What a work is, as far as we could tell: title, author, year/edition, language, length. Pure. */
const describe = (id = {}, r = {}) => ({ title: id.title || null, author: id.author || null, year: id.year || null, edition: id.edition || null,
  language: id.language || null, pages: id.sample?.of ?? id.pages ?? null, words: r?.compared?.words ?? null });
const top = (r) => (r?.candidates || []).slice(0, 3).map((c) => ({ id: c.id, title: c.title, author: c.author || null, language: c.language || null,
  relation: c.relation?.relation || null, of: c.relation?.ours_in_theirs ?? null }));
const brief = (r) => ({ verdict: r?.verdict || 'undetermined', candidates: top(r) });
const dataUrl = (a) => `data:${IMAGE.test(a.type || '') ? a.type : 'image/jpeg'};base64,${a.data}`;
const safe = async (label, fn, unread) => { try { return await fn(); } catch (e) { unread.push({ name: label, why: `I could not read it (${String(e.message || e).slice(0, 120)})` }); return null; } };

/** Run the plan. deps: { identifyPhotos, identifyUrl, identifyText, checkHoldings, identifyAndCheck, createItem, findOpenByTitle,
 *  findBySha, updateItem, archiveOriginal, enqueue, itemsCreatedBy }. by = "<email> (email)". → { results, unread, refused } */
export async function runVerbs(plan, attachments, deps, by) {
  const results = [];
  const unread = [...plan.unread];
  const dataOf = (a) => attachments.find((x) => x === a || (x.name === a.name && x.size === a.size))?.data;
  const want = async (id) => {
    if (!id?.title) return null;
    const open = await deps.findOpenByTitle(id.title);
    if (open) return { id: open.id, title: open.title, state: open.state, existing: true };
    const item = await deps.createItem({ title: id.title, author: id.author || null, kind: id.kind || null, identified: id, by, why: 'suggested by email' });
    await deps.enqueue('dewey-research', { id: item.id }, by);
    return { id: item.id, title: item.title, state: item.state };
  };
  const holdings = async (source, label, id) => {
    const r = await deps.checkHoldings(id);
    const out = { verb: 'holdings', source, label, identified: describe(id, r), ...brief(r) };
    if (['not-held', 'not-found-by-title'].includes(out.verdict) && id.title) out.wanted = await want(id);
    if (out.wanted) out.wanted.url = deps.itemUrl ? deps.itemUrl(out.wanted.id) : null;
    results.push(out);
  };
  if (plan.photos.length) {
    await safe(`your photo${plan.photos.length > 1 ? 's' : ''}`, async () => {
      const id = await deps.identifyPhotos(plan.photos.map((a) => dataUrl({ ...a, data: dataOf(a) })));
      if (!id.title && !id.printed_lines?.length) throw new Error('no title or text could be made out');
      await holdings('photo', plan.photos.map((a) => a.name).join(', '), id);
    }, unread);
  }
  for (const a of plan.files) {
    await safe(a.name, async () => {
      const data = dataOf(a);
      if (!data) throw new Error('the attachment arrived empty');
      const doc = await deps.identifyAndCheck({ file: { name: a.name, data } });
      const id = doc.identified || {};
      const out = { verb: 'intake', label: a.name, identified: describe(id, doc.result), needs_ocr: !!id.needs_ocr, ...brief(doc.result) };
      const seen = doc.sha256 && await deps.findBySha(doc.sha256);
      if (seen) out.item = { id: seen.id, title: seen.title, state: seen.state, doc_id: seen.doc_id || null, existing: true };
      // NEW (nothing like it) or a BETTER COPY (we hold only part of it) is taken in; a copy of what we hold is not
      else if (out.verdict !== 'held') {
        out.better = out.verdict === 'partly-held';
        const item = await deps.createItem({ title: id.title || `Untitled document (emailed as “${a.name}”)`, author: id.author || null, kind: id.kind || null,
          identified: { ...id, _text: undefined, file_name: a.name }, by, why: `emailed by ${by} (${a.name})${out.better ? ' — a fuller copy of a work we hold in part' : ''}` });
        const arc = await deps.archiveOriginal(Buffer.from(data, 'base64'), { name: a.name, itemId: item.id });
        const queued = await deps.updateItem(item.id, { state: 'source', original_path: arc.path, sha256: arc.sha256 }, `source attached by email: ${a.name} (${Math.round(arc.bytes / 1024)} KB), archived`);
        await deps.enqueue('dewey-intake', { id: item.id }, by);
        out.item = { id: queued.id, title: queued.title, state: queued.state };
      }
      if (out.item) out.item.url = deps.itemUrl ? deps.itemUrl(out.item.id) : null;
      results.push(out);
    }, unread);
  }
  for (const u of plan.urls) await safe(u, async () => holdings('link', u, await deps.identifyUrl(u)), unread);
  for (const u of plan.media) {
    await safe(u, async () => {
      const id = await deps.identifyUrl(u).catch(() => ({}));            // oEmbed: title + channel, no model
      const r = await deps.mediaHoldings(u, { title: id.title || null, author: id.author || null });
      // a whitelisted contributor's new talk joins the media import queue (ranked like every target; the pipeline decides)
      if (r.status === 'not-held' && r.youtube_id && deps.addMediaTarget) r.added = await deps.addMediaTarget({ url: u, youtube_id: r.youtube_id, by });
      results.push({ verb: 'media', label: u, ...r });
    }, unread);
  }
  for (const t of plan.titles) await safe(t, async () => holdings('title', t, deps.identifyText(t)), unread);
  for (const p of plan.passages) await safe(`the passage “${p.slice(0, 40)}…”`, async () => holdings('passage', p, deps.identifyText(p)), unread);
  if (plan.status) {
    const email = by.replace(/\s*\(.*$/, '');
    const items = await deps.itemsCreatedBy(email, 12);
    results.push({ verb: 'status', items: items.map((i) => ({ id: i.id, title: i.title, state: i.state, doc_id: i.doc_id || null, updated_at: i.updated_at })) });
  }
  return { results, unread, refused: plan.refused };
}

// ── the reply (a template, Markdown; worker/mail/dewey.js adds Dewey's signature and sends it) ──
// RECEIPTS (Chad 10-23): a letter about works leads with what each work is and what happened to it, with a link — the library
// page once published, else the contributor's signed item page. One work → a short summary; several → a table
// (Title · Author · Status · Link) under a one-line total. No model writes any of it.
const docLink = (id) => `${SITE}/document/${id}`;
export const ETA = { text: 'searchable within a few hours', ocr: 'a scan, so its text is recognised first — usually searchable within 1–2 days' };
const RELATION = { same: 'the same text', inside: 'part of a larger work we hold', partial: 'we hold only part of it', overlap: 'shares passages', quotes: 'quotes from it' };
const STATE = { wanted: 'on our wanted list — I am looking for a copy', researched: 'researched; still looking for a copy we can add', source: 'received, waiting its turn to be processed',
  processing: 'being processed now', 'needs-ocr': 'waiting for text recognition (it is a scan)', 'needs-human': 'waiting for a librarian to look at it', ingested: 'in the library',
  failed: 'could not be processed — a person will look at it', offered: 'received, waiting for a decision', declined: 'set aside', 'to-buy': 'on our list to buy', lead: 'a lead we are following', archived: 'archived' };
const first = (name) => { const w = String(name || '').trim().split(/\s+/)[0] || ''; return w ? w[0].toUpperCase() + w.slice(1) : 'friend'; };
const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const named = (x) => `*${x.title || 'Untitled'}*${x.author ? ` by ${x.author}` : ''}`;
const cap = (s) => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s);
const facts = (w = {}) => [w.edition, w.year, w.language, w.pages ? `${w.pages} pages` : w.words ? `about ${Number(w.words).toLocaleString('en-US')} words` : null].filter(Boolean).join(' · ');

// "got it, thanks!" / "FYI" with nothing to act on needs no letter back
const ACK = /^\s*(?:(?:ok(?:ay)?|great|perfect|wonderful|lovely|excellent|got it|it worked!*|works|received|noted|fyi|f\.y\.i\.?|just fyi|for your information|many thanks|thanks?(?: you)?(?: so much)?(?: again)?|cheers|will do|sounds good)[\s,.!:)-]*)+(?:dewey)?[\s,.!]*$/i;
const SIGNOFF = /\n+\s*(?:thanks?|thank you|best|regards|cheers|love|warmly|blessings|sincerely)[^\n]*(?:\n[^\n]{0,40}){0,2}$/i;
export const isAck = (text = '') => {
  const t = String(text).replace(SIGNOFF, '').trim();
  return !!t && t.split(/\s+/).length <= 15 && t.split('\n').filter((l) => l.trim()).every((l) => ACK.test(l) || /^[\p{Lu}][\p{L}'-]*$/u.test(l.trim()) || (/^fyi\b/i.test(l.trim()) && !/\?/.test(l)));
};
/** A real question to Dewey: a question mark, or a line opening like one. Pure. */
export const isQuestion = (text = '') => /\?/.test(text) || /^\s*(how|what|where|when|why|who|can|could|would|do|does|is|are|will|should)\b/im.test(String(text));

/** One row per work in a letter: { title, author, status, link, note }. Pure. */
export function workRows(results = [], unread = []) {
  const rows = [];
  for (const r of results) {
    if (r.verb === 'status') continue;
    if (r.verb === 'media') {
      const w = { title: r.title || r.label, author: r.author || null, media: true };
      if (r.status === 'held') rows.push({ ...w, status: 'held', link: r.link, note: r.how === 'title' ? 'matched by title — a different upload of a talk we hold' : null });
      else if (r.status === 'queued') rows.push({ ...w, status: 'queued', link: null, note: `number ${r.position} in our media queue${r.eta ? `; at the current pace, ready in ${r.eta}` : ''}` });
      else if (r.status === 'processing') rows.push({ ...w, status: 'being processed', link: null, note: 'being transcribed and prepared now' });
      else if (r.status === 'failed') rows.push({ ...w, status: "couldn't import", link: null, note: `we tried to import it and could not${r.why ? ` (${r.why})` : ''}` });
      else rows.push({ ...w, status: r.added ? 'added to queue' : 'not held', link: null, note: r.added ? 'not in our media library yet — I have added it to the import queue; it will be transcribed and published if it fits the collection' : 'not in our media library' });
      continue;
    }
    const c = r.candidates?.[0] || {};
    const w = r.identified?.title ? r.identified : { title: r.source === 'title' ? r.label : c.title || r.label, author: c.author || null };
    if (r.verb === 'intake') {
      // held: named as the LIBRARY names it (a file's own title page may shout "PARIS TALKS")
      if (r.verdict === 'held') rows.push({ ...w, title: c.title || w.title, author: c.author || w.author, status: 'held', link: docLink(c.id), part: c.relation === 'inside', file: r.label });
      else if (r.item?.existing) rows.push({ ...w, status: r.item.state === 'ingested' ? 'held' : 'already received', link: r.item.doc_id ? docLink(r.item.doc_id) : r.item.url, note: `you sent this file before — it is ${STATE[r.item.state] || r.item.state}`, file: r.label });
      else rows.push({ ...w, status: r.better ? 'better copy' : r.needs_ocr ? 'needs OCR' : 'new', link: r.item?.url || null, needs_ocr: r.needs_ocr, held: r.better ? c : null, file: r.label, facts: facts(r.identified) });
      continue;
    }
    if (r.verdict === 'held') rows.push({ ...w, title: c.title || w.title, author: c.author || w.author, status: 'held', link: docLink(c.id), from: r.source });
    else if (['possible', 'partly-held'].includes(r.verdict) && c.id) rows.push({ ...w, status: r.verdict === 'partly-held' ? 'held in part' : 'possibly held', link: docLink(c.id), note: `the closest we hold is ${named(c)}`, from: r.source });
    else if (r.verdict === 'undetermined') rows.push({ ...w, status: "couldn't read", link: null, note: 'I could not read enough of it to tell whether we hold it', from: r.source });
    else rows.push({ ...w, status: 'not held — wanted', link: r.wanted?.url || null, note: r.wanted?.existing ? 'already on our wanted list' : 'added to our wanted list', from: r.source });
  }
  for (const u of unread) rows.push({ title: u.name, author: null, status: "couldn't read", link: null, note: u.why });
  return rows;
}

const SAY = { held: 'already held', 'not held — wanted': 'not held (now wanted)' };
/** "4 works: 2 new, 1 already held, 1 couldn't read." Pure. */
export function totalLine(rows) {
  const n = {};
  for (const r of rows) { const k = SAY[r.status] || r.status; n[k] = (n[k] || 0) + 1; }
  return `**${rows.length} works: ${Object.entries(n).map(([k, v]) => `${v} ${k}`).join(', ')}.**`;
}

/** One work, said in full: what it is, what happened, the link. Pure. */
function single(r) {
  const what = `${named(r)}${r.facts ? ` (${r.facts})` : ''}`;
  const link = (label) => (r.link ? ` [${label}](${r.link})` : '');
  switch (r.status) {
    case 'new': case 'needs OCR': return `**Received: ${what}**\n\nNew to the library — I have archived your copy and queued it for processing; it is ${r.status === 'needs OCR' ? ETA.ocr : ETA.text}.${link('Follow its progress here.')}`;
    case 'better copy': return `**Received: a fuller copy of ${what}**\n\nWe hold only part of this work (${named(r.held || {})}), so I have archived your copy and queued it to complete ours; it is ${r.needs_ocr ? ETA.ocr : ETA.text}.${link('Follow its progress here.')}`;
    case 'queued': case 'being processed': case 'added to queue': case "couldn't import": case 'not held':
      return `**${{ queued: 'In our media queue', 'being processed': 'Being processed now', 'added to queue': 'Not in the library yet — added to the queue', "couldn't import": 'Could not be imported', 'not held': 'Not in the library yet' }[r.status]}: ${named(r)}**\n\n${cap(r.note)}.`;
    case 'held': if (r.media) return `**Already in the library: ${named(r)}**\n\nWe have this talk${r.note ? ` (${r.note})` : ''}.${link('Listen to it here.')}`;
      return `**Already in the library: ${named(r)}**\n\n${r.file ? `Your file *${r.file}* is ${r.part ? 'part of this work, which' : 'a copy of a work'} we already hold, so nothing new was added.` : 'We hold this already.'}${link('Read it here.')}`;
    case 'already received': return `**Already received: ${named(r)}**\n\n${cap(r.note)}.${link('See where it stands.')}`;
    case 'not held — wanted': return `**Not in the library yet: ${named(r)}**\n\nIt is ${r.note === 'already on our wanted list' ? 'already' : 'now'} on our wanted list, and I will look for a copy we can add. If you have a PDF or a link to one, send it and processing starts at once.${link('Its page.')}`;
    case 'possibly held': case 'held in part': return `**${r.status === 'held in part' ? 'Held in part' : 'Possibly held'}: ${named(r)}**\n\n${cap(r.note)}.${link('Take a look.')}`;
    default: return `**I could not read ${r.title ? `*${r.title}*` : 'what you sent'}**\n\n${cap(r.note) || 'It could not be opened'}. Could you send it again as a PDF, EPUB, Word or text file, or a JPEG photo?`;
  }
}

/** results → the letter (Markdown), or null when there is nothing worth saying. Pure. */
export function composeReply({ name = null, results = [], unread = [], refused = [] } = {}) {
  const rows = workRows(results, unread);
  const status = results.filter((r) => r.verb === 'status').flatMap((r) => (r.items.length ? r.items.map((i) => `- ${named(i)} — ${STATE[i.state] || i.state}${i.state === 'ingested' && i.doc_id ? ` · [read it here](${docLink(i.doc_id)})` : ''}`) : ['- I have nothing from you on file yet.']));
  const parts = [];
  if (rows.length === 1) parts.push(single(rows[0]));
  if (rows.length > 1) {
    const linkWord = (r) => (r.media ? 'listen' : ['held', 'possibly held', 'held in part'].includes(r.status) ? 'read it' : 'progress');
    parts.push(totalLine(rows), ['| Title | Author | Status | Link |', '| --- | --- | --- | --- |',
      ...rows.map((r) => `| ${cell(r.title)} | ${cell(r.author || '—')} | ${cell(r.status)} | ${r.link ? `[${linkWord(r)}](${r.link})` : '—'} |`)].join('\n'));
    const notes = [];
    if (rows.some((r) => ['new', 'better copy'].includes(r.status))) notes.push(`New works are archived and queued for processing — ${ETA.text}.`);
    if (rows.some((r) => r.status === 'needs OCR')) notes.push('Scans need their text recognised first — usually searchable within 1–2 days.');
    for (const r of rows.filter((x) => x.media && x.status !== 'held')) notes.push(`*${r.title}*: ${r.note}.`);
    const fix = rows.filter((r) => r.status === "couldn't read");
    if (fix.length) notes.push(`Could not read: ${fix.map((r) => `*${r.title}* (${r.note})`).join('; ')}. Please send ${fix.length > 1 ? 'them' : 'it'} again as a PDF, EPUB, Word or text file, or a JPEG photo.`);
    if (notes.length) parts.push(notes.join(' '));
  }
  if (status.length) parts.push(`**Your contributions**\n\n${status.join('\n')}`);
  if (!parts.length) return null;
  const lines = [`Dear ${first(name)},`, '', 'Thank you for writing.', '', parts.join('\n\n')];
  if (refused.length) lines.push('', 'I can check our holdings, take in books and documents, and tell you how your contributions are doing — nothing more by email, so I have left the rest of your note as it is.');
  lines.push('', 'With thanks,');
  return lines.join('\n');
}

/** A real question Dewey cannot act on gets this (once per thread). Pure. */
export const helpReply = (name) => `Dear ${first(name)},

Thank you for writing. I can help with three things by email:

- **Do we have it?** Send a book’s title (one per line, “by” the author if you know it), a link, or a photo of its cover, spine or title page.
- **Add it.** Attach the file itself (PDF, EPUB or Word) and I will check it and take it in.
- **Where does it stand?** Ask “what happened to my contributions?” and I will tell you where each one is.

With thanks,`;

/** REPLY RULES (Chad 10-23: "not every email needs a response"). → { reply, silent } — exactly one is set. Pure.
 *  Reply when there is something useful to say: works received or checked (a contribution ALWAYS gets its receipt), a status
 *  answer, a problem the sender must fix, a real question (once per thread). Otherwise — and when unsure — silence, with the
 *  reason in Chad's digest. (Auto-replies, out-of-office, lists, bounces, CCs and duplicates are stopped at the door by
 *  worker/mail/dewey.js; spam/abuse/phishing by the screen, screen.js.) */
export function replyRule({ name = null, text = '', results = [], unread = [], refused = [], threadAnswered = false }) {
  const reply = composeReply({ name, results, unread, refused });
  if (reply) return { reply, silent: null };
  if (isAck(text)) return { reply: null, silent: 'thanks / acknowledgement' };
  const rest = String(text).split('\n').filter((l) => !refused.includes(l.trim().slice(0, 160))).join('\n');
  if (refused.length && !isQuestion(rest)) return { reply: null, silent: 'only asked for things Dewey does not do' };
  if (threadAnswered) return { reply: null, silent: 'continues a thread Dewey already answered; nothing new' };
  if (isQuestion(rest)) return { reply: helpReply(name), silent: null };
  return { reply: null, silent: 'nothing to act on' };
}

/** The whole email turn: plan → run → rule → letter. → { reply|null, silent|null, results, unread, refused, plan } */
export async function deweyMailTurn({ from, name = null, subject = '', text = '', attachments = [], threadAnswered = false }, deps) {
  const by = `${String(from).toLowerCase()} (email)`;
  const plan = planVerbs({ subject, text, attachments });
  const r = await runVerbs(plan, attachments, deps, by);
  return { ...replyRule({ name, text, threadAnswered, ...r }), ...r,
    plan: { photos: plan.photos.length, files: plan.files.length, urls: plan.urls.length, media: plan.media.length, titles: plan.titles.length, passages: plan.passages.length, status: plan.status } };
}
