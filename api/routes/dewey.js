// Dewey routes (the librarian page /dewey; Chad 10-17). Members with Dewey access only (requireDewey).
//   POST /api/dewey/holdings  { text?, url?, images?: dataURL[], file?: { name, data: base64 } } → { identified, verdict, candidates }
//   GET  /api/dewey/activity  → Dewey's intake: works loading now or just loaded, with each document's stages (right column)
//   GET  /api/dewey/missing   → books listed but not held (left column; the missing-books snapshot)
//   POST /api/dewey/items     { identified } → a WANTED work (research queued: ISBN, publisher, cover)
//   GET  /api/dewey/items     → the wanted list and intake queue, open items first
//   POST /api/dewey/items/:id/source { url? | file: { name, data } } → original archived, intake queued
//   POST /api/dewey/chat      { messages, attach: { images?, file?, url? }, stream? } → SSE: holdings · item · delta · done
//                             (stream: false → one JSON { reply, holdings, items } — for agents)
//   GET  /api/dewey/thread?after=ID → the member's ONE thread (shared by phone and desktop)
//   POST /api/dewey/keys      { name } → a Dewey API key, shown once (signed-in session only)
// Auth: a signed-in session with Dewey access, OR an API key with the 'dewey' permission owned by such a member
// (X-Api-Key: sk_… or Authorization: Bearer sk_…). Docs: docs/agents/dewey-api.md
// Photos arrive resized by the page (≤1600 px JPEG), so a body of a few MB is enough.
import { requireDewey } from '../lib/auth.js';
import { identifyPhotos, identifyUrl, identifyFile, identifyText } from '../lib/dewey/identify.js';
import { checkHoldings } from '../lib/dewey/holdings.js';
import { ApiError } from '../lib/errors.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { coverageForDocs } from '../lib/repos/coverage-repo.js';
import { createItem, getItem, listItems, findOpenByTitle, updateItem, intakeActivity, appendMessage, threadOf } from '../lib/repos/dewey-repo.js';
import { enqueue } from '../lib/repos/ops-report-repo.js';
import { archiveOriginal } from '../lib/dewey/intake.js';
import { deweyTurn } from '../lib/dewey/agent.js';

// the admin pipeline snapshot (scripts/pipeline-snapshot.js) — same file /api/admin/library/missing-books reads
const PIPELINE_SNAPSHOT_PATH = join(process.cwd(), 'data', 'pipeline-status.json');

/** Attach a source (a URL or an uploaded file) to a wanted item: archive the original untouched, queue intake. */
export async function attachSource(itemId, { url = null, file = null } = {}, by = 'dewey') {
  const item = await getItem(itemId);
  if (!item) throw Object.assign(new Error('no such item'), { statusCode: 404 });
  let bytes, name;
  if (file?.data) { bytes = Buffer.from(file.data, 'base64'); name = file.name || ''; }
  else if (url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(120000), redirect: 'follow' });
    if (!res.ok) throw Object.assign(new Error(`could not fetch the source (${res.status})`), { statusCode: 400 });
    bytes = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || '';
    name = url.split('?')[0].split('/').pop() + (/pdf/i.test(type) && !/\.pdf$/i.test(url) ? '.pdf' : /html/i.test(type) && !/\.html?$/i.test(url) ? '.html' : '');
  } else throw Object.assign(new Error('attach a file or a URL'), { statusCode: 400 });
  const a = await archiveOriginal(bytes, { name, url, itemId: item.id });
  await updateItem(item.id, { state: 'source', source_url: url, original_path: a.path, sha256: a.sha256 }, `source attached: ${name || 'file'} (${Math.round(a.bytes / 1024)} KB), archived`);
  await enqueue('dewey-intake', { id: item.id }, by);
  return getItem(item.id);
}

export default async function deweyRoutes(fastify) {
  fastify.post('/holdings', { preHandler: requireDewey, bodyLimit: 30 * 1024 * 1024 }, async (request) => {
    const { text, url, images, file } = request.body || {};
    let id = {};
    if (images?.length) id = await identifyPhotos(images);
    else if (file?.data) id = await identifyFile({ name: file.name || '', bytes: new Uint8Array(Buffer.from(file.data, 'base64')) });
    else {
      const t = identifyText(text);
      id = url || t.url ? await identifyUrl(url || t.url) : t;
    }
    if (!id.title && !id.printed_lines?.length) throw ApiError.badRequest?.('Nothing to search on — add a title, a few lines of text, a photo or a URL') ?? Object.assign(new Error('nothing to search on'), { statusCode: 400 });
    return { identified: id, ...(await checkHoldings(id)) };
  });

  // The right column: Dewey's intake activity — what he is loading now or has just loaded, each document's stages
  fastify.get('/activity', { preHandler: requireDewey }, async (request) => {
    const items = await intakeActivity(Math.min(Number(request.query?.limit) || 30, 100));
    const layers = await coverageForDocs(items.map((i) => i.doc_id).filter(Boolean));
    return { items: items.map((i) => ({ id: i.id, title: i.title, author: i.author, state: i.state, doc_id: i.doc_id, updated_at: i.updated_at,
      cover: !!i.cover_path, last: i.log.at(-1)?.why || null, layers: i.doc_id ? layers[i.doc_id] || {} : null })) };
  });

  // The left column: books the library lists but does not hold (the missing-books triage snapshot), first of each queue
  fastify.get('/missing', { preHandler: requireDewey }, async () => {
    let mb = null;
    try { mb = JSON.parse(readFileSync(PIPELINE_SNAPSHOT_PATH, 'utf8'))?.missingBooks; } catch { /* no snapshot yet */ }
    if (!mb?.haveSource) return { pending: true };
    return { haveSourceTotal: mb.haveSourceTotal, noSourceTotal: mb.noSourceTotal, generated_at: mb.generated_at ?? null,
      haveSource: (mb.haveSource || []).slice(0, 40), noSource: (mb.noSource || []).slice(0, 40) };
  });

  // WANTED (Chad 10-17): a book not in the library goes on Dewey's list and is researched at once
  fastify.post('/items', { preHandler: requireDewey }, async (request) => {
    const id = request.body?.identified || {};
    if (!id.title) throw Object.assign(new Error('a wanted item needs a title'), { statusCode: 400 });
    const existing = await findOpenByTitle(id.title);
    if (existing) return { item: existing, existing: true };
    const by = request.user?.viaKey ? `${request.user.email} (key ${request.user.viaKey})` : request.user?.email || null;
    const item = await createItem({ title: id.title, author: id.author || null, kind: id.kind || null, identified: id, by });
    await enqueue('dewey-research', { id: item.id }, request.user?.email || 'dewey');
    return { item };
  });
  fastify.get('/items', { preHandler: requireDewey }, async (request) => ({ items: await listItems({ state: request.query?.state || null }) }));

  // A SOURCE for a wanted item (a PDF, DOCX or page — a file or a URL): archive the original untouched, then intake.
  // It leaves the wanted list the moment its source arrives.
  fastify.post('/items/:id/source', { preHandler: requireDewey, bodyLimit: 120 * 1024 * 1024 }, async (request) => {
    const { url, file } = request.body || {};
    return { item: await attachSource(request.params.id, { url, file }, request.user?.email || 'dewey') };
  });

  // DEWEY'S CHAT, streamed (server-sent events): attachments are checked first, then Dewey replies with tools
  fastify.post('/chat', { preHandler: requireDewey, bodyLimit: 30 * 1024 * 1024 }, async (request, reply) => {
    const { message = null, messages = null, attach = {}, thumbs = [], stream = true } = request.body || {};
    const by = request.user?.viaKey ? `${request.user.email} (key ${request.user.viaKey})` : request.user?.email || 'dewey';
    const uid = request.user.sub;
    // ONE THREAD per member, shared by every device: the new message is saved first; the model's history comes from the
    // saved thread (an agent may still pass its own `messages`)
    const text = String(message ?? (messages?.at(-1)?.content || '')).slice(0, 4000);
    await appendMessage(uid, 'user', text, { thumbs: (thumbs || []).slice(0, 6), file: attach.file?.name || null });
    const history = messages?.length ? messages.slice(0, -1) : (await threadOf(uid, { limit: 24 })).slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content || (m.parts?.thumbs?.length ? '(photos)' : '') })).filter((m) => m.content);
    const parts = [];
    const keep = (e) => {   // what is saved with Dewey's reply, to show it again on any device
      if (e.type === 'delta') { const last = parts.at(-1); if (last?.kind === 'text') last.text += e.text; else parts.push({ kind: 'text', text: e.text }); }
      else if (e.type === 'holdings') parts.push({ kind: 'holdings', r: e });
      else if (e.type === 'research') parts.push({ kind: 'research', r: e });
      else if (e.type === 'appraisal') parts.push({ kind: 'appraisal', a: e });
      else if (e.type === 'item') parts.push({ kind: 'item', item: e.item });
    };
    const save = () => appendMessage(uid, 'assistant', parts.filter((p) => p.kind === 'text').map((p) => p.text).join('').trim(), { parts }).catch(() => {});
    const turn = (emit) => deweyTurn({ messages: [...history.slice(-12), { role: 'user', content: text || (attach.images?.length ? 'Do we have this?' : 'Do we have this?') }]
      .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 4000) })),
      attach, by, emit: (e) => { keep(e); emit(e); }, attachSource: (id, url) => attachSource(id, { url }, by) });
    // for agents: { stream: false } → one JSON answer { reply, holdings, items }
    if (stream === false) {
      const out = { reply: '', holdings: [], items: [] };
      await turn((e) => { if (e.type === 'delta') out.reply += e.text; else if (e.type === 'holdings') out.holdings.push(e); else if (e.type === 'item') out.items.push(e.item); });
      out.reply = out.reply.trim();
      await save();
      return out;
    }
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const emit = (e) => { try { reply.raw.write(`data: ${JSON.stringify(e)}\n\n`); } catch { /* client gone */ } };
    try {
      await turn(emit);
    } catch (err) {
      emit({ type: 'error', message: String(err.message || err).slice(0, 300) });
      emit({ type: 'done' });
    }
    await save();
    reply.raw.end();
  });

  // The member's thread — the same on every device; `after` returns only what is new (the other device's messages)
  fastify.get('/thread', { preHandler: requireDewey }, async (request) => {
    const after = Number(request.query?.after) || 0;
    return { messages: await threadOf(request.user.sub, { after, limit: after ? 100 : 60 }) };
  });

  // Dewey API keys for your own agents — created from a SIGNED-IN SESSION only (never with another key), shown once,
  // stored only as a hash, permission 'dewey'. Revoke on /settings (API keys).
  fastify.post('/keys', { preHandler: requireDewey }, async (request) => {
    if (request.user?.viaKey) throw Object.assign(new Error('Create Dewey keys from a signed-in session, not with a key'), { statusCode: 403 });
    const { createApiKey } = await import('../lib/api-keys.js');
    const name = String(request.body?.name || 'Dewey agent').slice(0, 80);
    const k = await createApiKey(request.user.sub, name, { permissions: ['dewey'], rateLimit: 600, retrievable: false });
    return { key: k.key, id: k.id, name: k.name, prefix: k.keyPrefix, rateLimitPerHour: k.rateLimit, note: 'Shown once — store it now. Use it as X-Api-Key.' };
  });
}
