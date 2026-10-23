// Dewey by email (dewey@siftersearch.com, Chad 10-23: "Dewey communicate with contributors directly"). A contributor's letter
// is turned into FIXED VERBS by code — never by a model reading it — so mail is data, not instructions:
//   photos → holdings check (vision reads the cover / spine / title page) · a document → holdings check, then intake
//   (archived, queued for OCR / quality gate / ingest) · links and titles → holdings check (a new title joins the wanted
//   list) · "what happened to …" → status of their items.  Anything else in the letter is ignored and said so.
// The reply is written from the results by a template (no model): what we hold (with links), what is new, what was queued,
// what could not be read. Deps injectable for tests (identify, holdings, intake, dewey-repo, ops queue).
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
const SMALLTALK = /^\s*(?:hi|hello|hey|dear|greetings|thanks?|thank you|many thanks|best|regards|kind regards|warm(?:ly| regards)|cheers|sincerely|love|blessings|yours|sent from my|--|—|on .* wrote:?)\b/i;
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
  const plan = { photos: [], files: [], urls: [], titles: [], passages: [], status: false, refused: [], unread: [] };
  for (const a of attachments) {
    const name = a.name || 'attachment', type = a.type || '';
    if (a.size > LIMITS.fileBytes) plan.unread.push({ name, why: 'too large to take by email (25 MB at most) — a link to it works' });
    else if (HEIC.test(type) || /\.hei[cf]$/i.test(name)) plan.unread.push({ name, why: 'an HEIC photo, which I cannot open — please send it as a JPEG (most phones offer “Most Compatible”)' });
    else if (IMAGE.test(type) || IMAGE_EXT.test(name)) (plan.photos.length < LIMITS.photos ? plan.photos : plan.unread).push(plan.photos.length < LIMITS.photos ? a : { name, why: `more than ${LIMITS.photos} photos in one letter` });
    else if (DOC_TYPE.test(type) || DOC_EXT.test(name)) (plan.files.length < LIMITS.files ? plan.files : plan.unread).push(plan.files.length < LIMITS.files ? a : { name, why: `more than ${LIMITS.files} files in one letter` });
    else plan.unread.push({ name, why: 'not a kind of file I can read (PDF, EPUB, Word, text, or a photo)' });
  }
  const body = String(text || '').replace(/\r\n/g, '\n');
  for (const u of body.match(/https?:\/\/[^\s<>"')\]]+/g) || []) if (!plan.urls.includes(u) && plan.urls.length < LIMITS.urls) plan.urls.push(u.replace(/[.,;:]+$/, ''));
  plan.status = STATUS.test(body) || STATUS.test(subject);
  const add = (t) => { const c = t.trim().replace(/^[-*•\d.)\s]+/, '').replace(/[?.!,;:]+$/, '').trim(); if (c.length >= 3 && !plan.titles.includes(c) && plan.titles.length < LIMITS.titles) plan.titles.push(c); };
  for (const raw of body.split('\n')) {
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
    if (titleLike(rest)) add(rest);
  }
  // the subject is the title when the letter names nothing else ("Fwd: The Chosen Highway")
  const subj = String(subject || '').replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, '').trim();
  if (!plan.titles.length && !plan.urls.length && !plan.photos.length && !plan.files.length && !plan.passages.length && !plan.status
    && subj && !COMMAND.test(subj) && !/^(hello|hi|question|books?|a book|status|test|contribution|dewey)$/i.test(subj) && titleLike(subj.replace(ASK_PREFIX, ''))) add(subj.replace(ASK_PREFIX, ''));
  return plan;
}

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
    const out = { verb: 'holdings', source, label, identified: { title: id.title || null, author: id.author || null, language: id.language || null }, ...brief(r) };
    if (['not-held', 'not-found-by-title'].includes(out.verdict) && id.title) out.wanted = await want(id);
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
      const out = { verb: 'intake', label: a.name, identified: { title: id.title || null, author: id.author || null, language: id.language || null }, needs_ocr: !!id.needs_ocr, ...brief(doc.result) };
      const seen = doc.sha256 && await deps.findBySha(doc.sha256);
      if (seen) out.item = { id: seen.id, title: seen.title, state: seen.state, existing: true };
      else if (out.verdict !== 'held') {
        const item = await deps.createItem({ title: id.title || `Untitled document (emailed as “${a.name}”)`, author: id.author || null, kind: id.kind || null,
          identified: { ...id, _text: undefined, file_name: a.name }, by, why: `emailed by ${by} (${a.name})` });
        const arc = await deps.archiveOriginal(Buffer.from(data, 'base64'), { name: a.name, itemId: item.id });
        const queued = await deps.updateItem(item.id, { state: 'source', original_path: arc.path, sha256: arc.sha256 }, `source attached by email: ${a.name} (${Math.round(arc.bytes / 1024)} KB), archived`);
        await deps.enqueue('dewey-intake', { id: item.id }, by);
        out.item = { id: queued.id, title: queued.title, state: queued.state };
      }
      results.push(out);
    }, unread);
  }
  for (const u of plan.urls) await safe(u, async () => holdings('link', u, await deps.identifyUrl(u)), unread);
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
const docLink = (id) => `${SITE}/document/${id}`;
const RELATION = { same: 'the same text', inside: 'inside', partial: 'only part of it', overlap: 'shares passages with', quotes: 'quotes from it' };
const STATE = { wanted: 'on our wanted list — I am looking for a copy', researched: 'researched; still looking for a copy we can add', source: 'received, waiting its turn to be processed',
  processing: 'being processed now', 'needs-ocr': 'waiting for text recognition (it is a scan)', 'needs-human': 'waiting for a librarian to look at it', ingested: 'in the library',
  failed: 'could not be processed — a person will look at it', offered: 'received, waiting for a decision', declined: 'set aside', 'to-buy': 'on our list to buy', lead: 'a lead we are following' };
const named = (x) => `*${x.title || 'Untitled'}*${x.author ? ` by ${x.author}` : ''}`;
const held = (c) => `${named(c)}${c.language && c.language !== 'en' ? ` (${c.language})` : ''} — [read it here](${docLink(c.id)})${c.relation && c.relation !== 'same' ? ` · ${RELATION[c.relation] || c.relation}${c.of != null ? ` (${Math.round(c.of * 100)}%)` : ''}` : ''}`;
const asked = (r) => (r.source === 'title' ? `“${r.label}”` : r.source === 'link' ? r.label : r.source === 'passage' ? `the passage you quoted` : r.source === 'photo' ? 'your photo' : r.label);

/** results → the letter (Markdown). Pure. */
export function composeReply({ name = null, results = [], unread = [], refused = [] } = {}) {
  const have = [], fresh = [], queued = [], maybe = [], status = [];
  for (const r of results) {
    if (r.verb === 'status') { status.push(...(r.items.length ? r.items.map((i) => `- ${named(i)} — ${STATE[i.state] || i.state}${i.state === 'ingested' && i.doc_id ? ` · [read it here](${docLink(i.doc_id)})` : ''}`) : ['- I have nothing from you on file yet.'])); continue; }
    const read = r.identified?.title ? `${named(r.identified)}` : asked(r);
    if (r.verdict === 'held') { have.push(`- ${r.verb === 'intake' ? `Your file *${r.label}* (${read}) — we already hold it: ` : r.source === 'title' ? `${asked(r)} — ` : `${asked(r)}, which I read as ${read} — `}${held(r.candidates[0] || {})}`); continue; }
    if (r.verb === 'intake' && r.item?.existing) { queued.push(`- *${r.label}* (${read}) — you sent this file before; it is ${STATE[r.item.state] || r.item.state} (no. ${r.item.id}).`); continue; }
    if (r.verb === 'intake' && r.item) { queued.push(`- *${r.label}*, which I read as ${read} — not in the library, so I have archived your copy and queued it for processing${r.needs_ocr ? ' (it is a scan, so its text will be recognised first)' : ''}. Its number is ${r.item.id}; ask me about it any time.`); continue; }
    if (['possible', 'partly-held'].includes(r.verdict) && r.candidates.length) {
      maybe.push(`- ${asked(r)}${r.identified?.title && r.source !== 'title' ? ` (${read})` : ''} — ${r.verdict === 'partly-held' ? 'we hold part of it' : 'perhaps'}: ${r.candidates.slice(0, 2).map(held).join('; ')}${r.verb === 'intake' ? '. I have not queued your file; reply “add it” with the file again if it is the fuller text.' : ''}`);
      continue;
    }
    if (r.verdict === 'undetermined') { maybe.push(`- ${asked(r)} — I could not read enough of it to tell whether we hold it.`); continue; }
    fresh.push(`- ${asked(r)}${r.identified?.title && r.source !== 'title' ? `, which I read as ${read}` : ''} — not in the library.${r.wanted ? r.wanted.existing ? ` It is already on our wanted list (no. ${r.wanted.id}).` : ` I have put it on our wanted list (no. ${r.wanted.id}) and will look for a copy we can add; if you have a PDF or a link to one, send it and processing starts at once.` : ''}`);
  }
  const section = (title, lines) => (lines.length ? `**${title}**\n\n${lines.join('\n')}` : null);
  const parts = [
    section('Already in the library', have), section('New to us', fresh), section('Taken in for processing', queued),
    section('Possibly held — I could not be sure', maybe), section('Your contributions', status),
    section('What I could not read', unread.map((u) => `- ${u.name} — ${u.why}.`)),
  ].filter(Boolean);
  const nothing = !parts.length || (parts.length === 1 && unread.length && !results.length);
  const lines = [`Dear ${name ? String(name).trim().split(/\s+/)[0] : 'friend'},`, ''];
  if (!results.length && !unread.length) {
    lines.push('Thank you for writing. I could not find a title, a link, a photo or a file in your letter to work with.', '',
      'Send me any of these and I will check our holdings at once: a book’s title (one per line, “by” the author if you know it), a link, a photo of its cover, spine or title page, or the file itself (PDF, EPUB or Word). Ask me “what happened to my contributions?” and I will tell you where each one stands.');
  } else {
    lines.push(nothing ? 'Thank you for writing. I am afraid I could not make use of what you sent:' : 'Thank you — here is what I found.', '', parts.join('\n\n'));
  }
  if (refused.length) lines.push('', 'I can check our holdings, take in books and documents, and tell you how your contributions are doing — nothing more by email, so I have left the rest of your note as it is.');
  lines.push('', 'With thanks,');
  return lines.join('\n');
}

/** The whole email turn: plan → run → letter. → { reply, results, unread, refused, plan: counts } */
export async function deweyMailTurn({ from, name = null, subject = '', text = '', attachments = [] }, deps) {
  const by = `${String(from).toLowerCase()} (email)`;
  const plan = planVerbs({ subject, text, attachments });
  const r = await runVerbs(plan, attachments, deps, by);
  return { reply: composeReply({ name, ...r }), ...r,
    plan: { photos: plan.photos.length, files: plan.files.length, urls: plan.urls.length, titles: plan.titles.length, passages: plan.passages.length, status: plan.status } };
}
