// Dewey's chat (Chad 10-17: "The chat should be streaming from the dewey agent and should have the assumption that we are
// discussing adding books or documents. If I post a picture, it will immediately start looking to see if we have it or
// not. No need to ask."). One turn: attachments are checked FIRST, deterministically, before the model says a word; then
// the model streams its reply with tools to check more titles, put works on the wanted list and attach a source. It
// reports only what the tools found. An UPLOAD we lack is appraised from its own text and kept as an OFFERED item; the member
// is asked, and add_offered imports it on yes (nothing is imported unasked). Events out: status · holdings · research · appraisal · item · delta · done. Deps injectable for tests.
import { roleCreate } from '../role-client.js';
import { identifyPhotos, identifyUrl, identifyFile, identifyText } from './identify.js';
import { checkHoldings } from './holdings.js';
import { appraiseWork, appraiseDocument } from './appraise.js';
import { archiveOriginal } from './intake.js';
import { createItem, findOpenByTitle, listItems, getItem, updateItem } from '../repos/dewey-repo.js';
import { enqueue } from '../repos/ops-report-repo.js';

export const SYSTEM = `You are Dewey, the AI Librarian for Ocean 2.0 (SifterSearch's library of sacred and scholarly texts, 11 traditions).
You are working with Chad or an invited contributor on ONE job: getting books, documents and videos into the library.
Assume every message is about a work they have found — do we have it, and if not, let's add it.
- When a work is named or described, call check_holdings at once. Do not ask permission to look.
- Report only what the tools returned. Never claim the library holds something the check did not find.
- A file or passage is compared with the library IN FULL: each candidate carries a relation — same (another copy or
  transcription), inside (part of a larger library work, e.g. a compilation), partial (we hold only part of it — worth
  adding the fuller text), overlap/quotes (shares passages only), with percentages. Say it in those terms.
- When the check says the full text was compared, the verdict is settled by the text: NEVER ask for lines of its text, and
  do not talk about the title search. "not-held" then means no library document shares its text.
- Held: say which copy (title, author, language) and stop. Held in another edition or language: say so and ask if this one is worth adding.
- Not held: say so plainly; add it to the wanted list when they say so ("add it", "yes", "want it") — or right away if they already asked to add it.
- Anything attached was ALREADY checked before you speak — do not call check_holdings for it again.
- An UPLOADED document we lack is never imported on its own: it is kept as an OFFERED item and appraised from its own text.
  Give the recommendation in one or two sentences, led by the appraisal's recommendation_line ("It looks like this belongs
  in our Bahá’í › Pilgrim Notes collection — …"), note anything that matters (we hold part of it; a scan that will need OCR),
  then ask "Shall I add it?". On yes, call add_offered with its item id (several ids when they say "add them all"). If they
  decline, say it will not be added.
- A wanted work gets researched automatically (ISBN, publisher, cover). Remind them once that a PDF or a link to one starts processing.
- A link to a PDF or page for a wanted work: call attach_source.
- When a work is NOT held, an appraisal follows (web research → in scope?, which shelf, value to the collection, price, a free
  text online). Give your verdict from it in two or three sentences — belongs or not, where, worth adding at what price —
  and offer to add it. For a typed title that is not held, call appraise_work.
Be brief, warm and exact. No sign-off.`;

export const TOOLS = [
  { type: 'function', function: { name: 'check_holdings', description: 'Is this work in the library? Search by title/author, or by a few printed lines of its text.',
    parameters: { type: 'object', properties: { title: { type: 'string' }, author: { type: 'string' }, lines: { type: 'string', description: 'a sentence or more of its text, verbatim' } } } } },
  { type: 'function', function: { name: 'add_to_wanted', description: 'Put a work that is NOT in the library on the wanted list (research starts automatically).',
    parameters: { type: 'object', properties: { title: { type: 'string' }, author: { type: 'string' }, kind: { type: 'string' } }, required: ['title'] } } },
  { type: 'function', function: { name: 'attach_source', description: 'Attach a URL (a PDF or web page of the work) to a wanted item; processing starts.',
    parameters: { type: 'object', properties: { item_id: { type: 'integer' }, url: { type: 'string' } }, required: ['item_id', 'url'] } } },
  { type: 'function', function: { name: 'appraise_work', description: 'Research a work online (Perplexity + Parallel.ai) and judge: in scope for the library, where it would go, its value and price, a free text online.',
    parameters: { type: 'object', properties: { title: { type: 'string' }, author: { type: 'string' }, edition: { type: 'string' }, year: { type: 'string' } }, required: ['title'] } } },
  { type: 'function', function: { name: 'add_offered', description: 'The member said YES to adding offered uploads: import them (into the recommended shelf).',
    parameters: { type: 'object', properties: { item_ids: { type: 'array', items: { type: 'integer' } } }, required: ['item_ids'] } } },
  { type: 'function', function: { name: 'list_wanted', description: 'The wanted list and intake queue: open items with their state.', parameters: { type: 'object', properties: {} } } },
];

/** A holdings result in a few lines for the model (the UI gets the full card). */
export function summarize(r) {
  const id = r.identified || {};
  return JSON.stringify({ read_as: { title: id.title, author: id.author, edition: id.edition, year: id.year, language: id.language, kind: id.kind, needs_ocr: id.needs_ocr || undefined },
    verdict: r.verdict, compared: r.compared ? `the FULL TEXT (${r.compared.words} words) was compared with ${r.compared.documents} candidate library documents — the verdict rests on the text, not the title` : undefined,
    candidates: (r.candidates || []).slice(0, 4).map((c) => ({ id: c.id, title: c.title, author: c.author, language: c.language,
      relation: c.relation?.relation, evidence: c.evidence.map((e) => e.kind + (e.detail ? `: ${e.detail}` : '')).join('; ') })) });
}

export function makeTools({ by, emit, attachSource, accept }) {
  return {
    async add_offered({ item_ids = [] }) {
      const out = [];
      for (const id of item_ids.slice(0, 50)) {
        try { const item = await accept(id); emit({ type: 'item', item }); out.push({ id, state: item.state }); }
        catch (err) { out.push({ id, error: String(err.message).slice(0, 120) }); }
      }
      return JSON.stringify({ accepted: out });
    },
    async check_holdings({ title, author, lines }) {
      const id = lines ? { ...identifyText(lines), title: title || undefined, author } : { title, author, from: 'text' };
      const r = { identified: id, ...(await checkHoldings(id)) };
      emit({ type: 'holdings', ...r });
      return summarize(r);
    },
    async add_to_wanted({ title, author = null, kind = null }) {
      const existing = await findOpenByTitle(title);
      if (existing) { emit({ type: 'item', item: existing }); return JSON.stringify({ already_wanted: true, id: existing.id, state: existing.state }); }
      const item = await createItem({ title, author, kind, identified: { title, author, kind }, by });
      await enqueue('dewey-research', { id: item.id }, by || 'dewey');
      emit({ type: 'item', item });
      return JSON.stringify({ added: true, id: item.id, research: 'queued' });
    },
    async attach_source({ item_id, url }) {
      const item = await attachSource(item_id, { url });
      emit({ type: 'item', item });
      return JSON.stringify({ attached: true, id: item.id, state: item.state });
    },
    async appraise_work({ title, author, edition, year }) {
      const a = await appraiseWork({ title, author, edition, year }, 'not checked here', { emit });
      return JSON.stringify(a || { error: 'nothing found' });
    },
    async list_wanted() {
      return JSON.stringify((await listItems({ limit: 30 })).map((i) => ({ id: i.id, title: i.title, author: i.author, state: i.state, isbn: i.research?.isbn13 || null, shelf: i.identified?.shelf || null })));
    },
  };
}

/** One chat turn. messages: [{ role, content }] (the last is the user's); attach: { images?, file?, url? }. */
export async function deweyTurn({ messages, attach = {}, by = null, emit, attachSource, accept = async () => { throw new Error('accept not wired'); }, create = roleCreate, check = checkHoldings, appraise = appraiseWork, appraiseDoc = appraiseDocument, archive = archiveOriginal }) {
  const notes = [];
  // attachments are checked BEFORE the model speaks — no need to ask (Chad 10-17)
  const lastText = String(messages.at(-1)?.content || '');
  const urlInText = lastText.match(/https?:\/\/\S+/)?.[0];
  if (attach.images?.length || attach.file?.data || attach.url || urlInText) {
    let id;
    try {
      // a status line at every step — never silence (Chad 10-17: "respond immediately and regularly")
      emit({ type: 'status', text: attach.images?.length ? 'Reading your photo…' : attach.file?.data ? 'Reading the file…' : 'Opening the link…' });
      id = attach.images?.length ? await identifyPhotos(attach.images)
        : attach.file?.data ? await identifyFile({ name: attach.file.name || '', bytes: new Uint8Array(Buffer.from(attach.file.data, 'base64')) })
          : await identifyUrl(attach.url || urlInText);
      emit({ type: 'status', text: id.title ? `Checking the library for “${id.title}”…` : 'Checking the library…' });
      const r = { identified: id, ...(await check(id)) };
      emit({ type: 'holdings', ...r });
      notes.push(`Holdings check of what they just sent (${attach.images?.length ? `${attach.images.length} photo(s)` : attach.file ? 'a file' : 'a link'}): ${summarize(r)}`);
      if (attach.file?.data && r.verdict === 'held') notes.push('Their uploaded file is ALREADY in the library — nothing to add. Say which copy we hold, and how (same text, or inside which larger work).');
      // an UPLOAD we lack: appraised from its OWN text, kept as an OFFERED item, and the member is asked (Chad 10-17: "the
      // question should go to whether or not to add … Dewey should make a recommendation")
      if (attach.file?.data && r.verdict !== 'held') {
        const a = await appraiseDoc(id, id._text || (id.printed_lines || []).join('\n'), `${r.verdict} (${(r.candidates || []).length} candidates)`, { emit });
        const bytes = Buffer.from(attach.file.data, 'base64');
        const item = await createItem({ title: a?.title || id.title || attach.file.name || 'untitled', author: a?.author || id.author || null, kind: a?.kind || id.kind || null,
          identified: { ...id, file_name: attach.file.name || null, shelf: a?.shelf || null, appraisal: a || null }, by, state: 'offered', why: `uploaded (${attach.file.name || 'a file'}); not in the library — offered` });
        const arc = await archive(bytes, { name: attach.file.name || '', itemId: item.id });
        const offered = await updateItem(item.id, { original_path: arc.path, sha256: arc.sha256 }, `original archived (${Math.round(arc.bytes / 1024)} KB)`);
        emit({ type: 'item', item: offered });
        notes.push(`Their upload is NOT in the library (${r.verdict}${r.compared ? `; full text compared, ${r.compared.words} words` : ''}${id.needs_ocr ? '; a scan — its text will need OCR' : ''}). Kept as OFFERED item ${offered.id}. Appraisal of the document itself: ${JSON.stringify({ title: a?.title, author: a?.author, year: a?.year, kind: a?.kind, summary: a?.summary, in_scope: a?.in_scope, scope_why: a?.scope_why, shelf: a?.shelf, value: a?.value, recommendation: a?.recommendation, recommendation_line: a?.recommendation_line })}`);
      } else if (r.verdict !== 'held' && id.title) {
        // a photographed or linked WORK (a published book): research it online and appraise it, each piece shown as it lands
        const a = await appraise(id, `${r.verdict} (${(r.candidates || []).length} candidates)`, { emit });
        if (a) notes.push(`Appraisal from web research: ${JSON.stringify({ summary: a.summary, in_scope: a.in_scope, scope_why: a.scope_why, shelf: a.shelf, value: a.value, value_why: a.value_why, price: a.price, rarity: a.rarity, free_online: a.free_online, recommendation: a.recommendation, next: a.next })}`);
      }
    } catch (err) {
      notes.push(`Could not read what they sent: ${String(err.message).slice(0, 160)}`);
    }
    emit({ type: 'status', text: null });
  }
  const tools = makeTools({ by, emit, attachSource, accept });
  const convo = [{ role: 'system', content: SYSTEM }, ...messages.slice(-12),
    ...(notes.length ? [{ role: 'system', content: notes.join('\n') }] : [])];
  for (let round = 0; round < 5; round++) {
    let stream;
    try { stream = await create('dewey-chat', { max_tokens: 700, temperature: 0.3, stream: true, tools: TOOLS, messages: convo }); }
    catch (err) {
      // what the model was sent, in shape only (roles and lengths) — enough to see why it refused, no content logged
      (await import('../logger.js')).logger.error({ err: err.message, round, shape: convo.map((m) => `${m.role}:${m.tool_calls ? 'tool_calls' : String(m.content ?? '').length}`) }, 'dewey-chat: model refused the request');
      throw err;
    }
    let text = '';
    const calls = [];
    for await (const chunk of stream) {
      const d = chunk.choices?.[0]?.delta || {};
      if (d.content) { text += d.content; emit({ type: 'delta', text: d.content }); }
      for (const tc of d.tool_calls || []) {
        const c = (calls[tc.index] ||= { id: tc.id, name: '', args: '' });
        if (tc.id) c.id = tc.id;
        if (tc.function?.name) c.name += tc.function.name;
        if (tc.function?.arguments) c.args += tc.function.arguments;
      }
    }
    if (!calls.length) break;
    convo.push({ role: 'assistant', content: text || null, tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })) });
    for (const c of calls) {
      let out;
      try { out = await tools[c.name]?.(JSON.parse(c.args || '{}')) ?? `unknown tool ${c.name}`; } catch (err) { out = `failed: ${String(err.message).slice(0, 160)}`; }
      convo.push({ role: 'tool', tool_call_id: c.id, content: out });
    }
    if (text) emit({ type: 'delta', text: '\n\n' });
  }
  emit({ type: 'done' });
}

export { getItem, updateItem };
