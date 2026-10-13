// Reading guide API (prefix /api/v1/reading; Chad 10-12: "an API for each activity type so we can call it from different
// contexts"). The same turn the email channel uses (anis /draft), callable from the web, chat or an audio player: the
// reply comes back as Markdown AND as a structured page (each paragraph's text with its notes — two voices later).
// Internal key for now. Deps: anis/reading/guide, repos/reading-repo.
export default async function readingRoutes(fastify) {
  const internalOnly = (request, reply) => {
    const k = request.headers['x-internal-key'];
    if (!process.env.INTERNAL_API_KEY || k !== process.env.INTERNAL_API_KEY) { reply.code(401).send({ error: 'unauthorized' }); return false; }
    return true;
  };

  /** POST /turn { participant, message, reset? } or { participant, messages:[{role,content}] } — reset: a start begins the book afresh
   *  → { reading:false } (not a reading message — answer it elsewhere) | { reading:true, reply, subject, page, bookmark } */
  fastify.post('/turn', async (request, reply) => {
    if (!internalOnly(request, reply)) return;
    const { participant, message, messages, reset = false } = request.body || {};
    if (!participant || !(message || messages?.length)) return reply.code(400).send({ error: 'participant and message required' });
    const { readingTurn } = await import('../lib/anis/reading/guide.js');
    const r = await readingTurn({ messages: messages?.length ? messages : [{ role: 'user', content: String(message) }], participantId: String(participant), reset: !!reset });
    return r?.reply ? { reading: true, ...r } : { reading: false };
  });

  /** GET /session?participant=… → the reader's open book and bookmark (or null). */
  fastify.get('/session', async (request, reply) => {
    if (!internalOnly(request, reply)) return;
    const { latestSession } = await import('../lib/repos/reading-repo.js');
    const s = await latestSession(String(request.query?.participant || ''));
    return s ? { docId: s.doc_id, title: s.title, cursor: s.cursor, pages: s.pages, status: s.status, explained: Object.keys(s.explained || {}).length } : null;
  });
}
