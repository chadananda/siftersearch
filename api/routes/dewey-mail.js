// Dewey's mail on tower (prefix /api/v1/dewey-mail), called only by the Worker's mail system (worker/mail/dewey.js) with the
// internal key. Tower never sends mail: it says who is a contributor and does the work; the Worker stores and replies.
//   GET  /contributor?email=   → { contributor, name } — the whitelist is users.dewey_access (or an admin tier)
//   POST /process              { job, from, name?, subject, text, attachments:[{name,type,size,data(base64)}] } → a JOB (40 s – minutes:
//                              vision, full-text compare, archive) → { contributor, reply, results, unread, refused, plan }
//   GET  /process/job/:key     → the job record. Deps: lib/dewey/mail.js, contributors-repo, dewey modules, async-jobs.
import { userByEmail } from '../lib/repos/contributors-repo.js';
import { canUseDewey } from '../lib/auth.js';

let jobs = null;
const store = async () => (jobs ||= (await import('../lib/jobs/async-jobs.js')).jobStore());

async function contributor(email) {
  const u = await userByEmail(email);
  return { contributor: canUseDewey(u), name: u?.name || null };
}

async function deps() {
  const [{ identifyPhotos, identifyUrl, identifyText }, { checkHoldingsOffThread, identifyAndCheckOffThread }, repo, { archiveOriginal }, { enqueue }] = await Promise.all([
    import('../lib/dewey/identify.js'), import('../lib/dewey/holdings.js'), import('../lib/repos/dewey-repo.js'), import('../lib/dewey/intake.js'), import('../lib/repos/ops-report-repo.js')]);
  return { identifyPhotos, identifyUrl, identifyText, checkHoldings: checkHoldingsOffThread, identifyAndCheck: identifyAndCheckOffThread,
    createItem: repo.createItem, findOpenByTitle: repo.findOpenByTitle, findBySha: repo.findBySha, updateItem: repo.updateItem, itemsCreatedBy: repo.itemsCreatedBy,
    archiveOriginal, enqueue };
}

export default async function deweyMailRoutes(fastify) {
  const internalOnly = (request, reply) => {
    if (!process.env.INTERNAL_API_KEY || request.headers['x-internal-key'] !== process.env.INTERNAL_API_KEY) { reply.code(401).send({ error: 'unauthorized' }); return false; }
    return true;
  };

  fastify.get('/contributor', async (request, reply) => {
    if (!internalOnly(request, reply)) return;
    return contributor(request.query?.email);
  });

  fastify.post('/process', { bodyLimit: 60 * 1024 * 1024 }, async (request, reply) => {
    if (!internalOnly(request, reply)) return;
    const b = request.body || {};
    const key = String(b.job || '').replace(/[^\w.-]/g, '').slice(0, 80);
    if (!key || !b.from) return reply.code(400).send({ error: 'job and from required' });
    const s = await store();
    if (Math.random() < 0.02) s.prune();
    return s.start(key, async () => {
      const who = await contributor(b.from);   // checked again here: the whitelist decides, not the caller
      if (!who.contributor) return { contributor: false };
      const { deweyMailTurn } = await import('../lib/dewey/mail.js');
      const r = await deweyMailTurn({ from: b.from, name: b.name || who.name, subject: b.subject || '', text: b.text || '', attachments: (b.attachments || []).slice(0, 12) }, await deps());
      return { contributor: true, ...r };
    }, { kind: 'dewey-mail' });
  });

  fastify.get('/process/job/:key', async (request, reply) => {
    if (!internalOnly(request, reply)) return;
    const rec = (await store()).get(String(request.params.key).replace(/[^\w.-]/g, ''));
    return rec || reply.code(404).send({ status: 'unknown' });
  });
}
