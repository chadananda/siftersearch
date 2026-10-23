// Dewey's mail on tower (prefix /api/v1/dewey-mail), called by the Worker's mail system (worker/mail/dewey.js) with the internal
// key. Tower never sends mail: it screens, says who is a contributor, does the work, and supplies lists; the Worker replies.
//   POST /screen              { from, subject, text, attachments:[{name,type,size}], threadAnswered } → { contributor, name, screen, decision, usd }
//                             — the cheap Jev gate (lib/dewey/screen.js) before anything costly
//   POST /process             { job, from, name?, subject, text, attachments:[…data], threadAnswered } → a JOB → { contributor, reply|null, silent, results, …, usd }
//   GET  /process/job/:key    → the job record
//   GET  /item/:id?t=         PUBLIC with a signed token: a contributor's item page (what it is, where it stands) — /dewey/item/<id> on the site
//   GET  /live?since=         works contributed by email that are now in the library → [{ id, title, author, doc_id, email }]
//   GET  /requests?…          prolific contributors (thresholds in the query) with 5–10 personalised wanted works each
// Deps: lib/dewey/{mail,screen,requests}.js, contributors-repo, dewey-repo, dewey modules, async-jobs, turn-meta (cost meter).
import { readFileSync } from 'fs';
import { join } from 'path';
import { userByEmail } from '../lib/repos/contributors-repo.js';
import { canUseDewey } from '../lib/auth.js';
import { itemUrl, itemSigOk, isProlific, pickRequests } from '../lib/dewey/requests.js';

let jobs = null;
const store = async () => (jobs ||= (await import('../lib/jobs/async-jobs.js')).jobStore());
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function contributor(email) {
  const u = await userByEmail(email);
  return { contributor: canUseDewey(u), name: u?.name || null };
}
const metered = async (fn) => {
  const { meterTurn, meterSummary } = await import('../lib/assistant/turn-meta.js');
  const { result, meter, ms } = await meterTurn(fn);
  const m = meterSummary(meter);
  return { ...result, usd: m.usd, models: m.models, ms };
};

async function deps() {
  const [{ identifyPhotos, identifyUrl, identifyText }, { checkHoldingsOffThread, identifyAndCheckOffThread }, repo, { archiveOriginal }, { enqueue }] = await Promise.all([
    import('../lib/dewey/identify.js'), import('../lib/dewey/holdings.js'), import('../lib/repos/dewey-repo.js'), import('../lib/dewey/intake.js'), import('../lib/repos/ops-report-repo.js')]);
  return { identifyPhotos, identifyUrl, identifyText, checkHoldings: checkHoldingsOffThread, identifyAndCheck: identifyAndCheckOffThread,
    createItem: repo.createItem, findOpenByTitle: repo.findOpenByTitle, findBySha: repo.findBySha, updateItem: repo.updateItem, itemsCreatedBy: repo.itemsCreatedBy,
    archiveOriginal, enqueue, itemUrl: (id) => itemUrl(id) };
}

const STAGE = { wanted: 'On our wanted list', researched: 'Researched — still looking for a copy', source: 'Received — waiting its turn', processing: 'Being processed',
  'needs-ocr': 'Waiting for text recognition', 'needs-human': 'Waiting for a librarian', ingested: 'In the library', failed: 'Could not be processed — a person will look',
  offered: 'Received — waiting for a decision', declined: 'Set aside', 'to-buy': 'On our list to buy', lead: 'A lead we are following', archived: 'Archived' };
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} — Dewey</title><style>:root{color-scheme:light dark;--ink:#2b2621;--bg:#faf8f3;--mute:#7a7266;--line:#e4ddcf;--acc:#6b4f2a}
@media (prefers-color-scheme:dark){:root{--ink:#e6e1d8;--bg:#16191c;--mute:#a59c8e;--line:#33302b;--acc:#d2b48c}}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 Georgia,serif}main{max-width:36rem;margin:0 auto;padding:2rem 1rem}
h1{font-size:1.5rem;margin:.2rem 0}.k{font:12px ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--mute)}
.st{display:inline-block;margin:.6rem 0;padding:.2rem .7rem;border:1px solid var(--acc);border-radius:99px;color:var(--acc)}a{color:var(--acc)}
ol{padding-left:1.2rem;color:var(--mute);font-size:15px}li{margin:.25rem 0}</style></head><body><main>${body}</main></body></html>`;

export default async function deweyMailRoutes(fastify) {
  const internalOnly = (request, reply) => {
    if (!process.env.INTERNAL_API_KEY || request.headers['x-internal-key'] !== process.env.INTERNAL_API_KEY) { reply.code(401).send({ error: 'unauthorized' }); return false; }
    return true;
  };

  fastify.get('/contributor', async (request, reply) => {
    if (!internalOnly(request, reply)) return;
    return contributor(request.query?.email);
  });

  // THE CHEAP GATE: whitelist + one Jev screen + the decision (it can only suppress or hold). hasWorks = attachments that are works.
  fastify.post('/screen', async (request, reply) => {
    if (!internalOnly(request, reply)) return;
    const b = request.body || {};
    if (!b.from) return reply.code(400).send({ error: 'from required' });
    const { screenMail, screenDecision } = await import('../lib/dewey/screen.js');
    const { planVerbs } = await import('../lib/dewey/mail.js');
    const atts = (b.attachments || []).slice(0, 12).map((a) => ({ name: String(a.name || ''), type: String(a.type || ''), size: Number(a.size) || 0 }));
    const plan = planVerbs({ subject: b.subject || '', text: b.text || '', attachments: atts });
    const hasWorks = plan.files.length + plan.photos.length > 0;
    return metered(async () => {
      const who = await contributor(b.from);
      const s = await screenMail({ from: b.from, subject: b.subject, text: b.text, attachments: atts, threadAnswered: !!b.threadAnswered, ref: b.ref ?? null });
      return { ...who, screen: s.screen, screen_error: s.error || null, screen_ms: s.ms, hasWorks, decision: screenDecision({ screen: s.screen, contributor: who.contributor, hasWorks }) };
    });
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
      return { contributor: true, ...(await metered(async () => deweyMailTurn({ from: b.from, name: b.name || who.name, subject: b.subject || '', text: b.text || '',
        attachments: (b.attachments || []).slice(0, 12), threadAnswered: !!b.threadAnswered }, await deps()))) };
    }, { kind: 'dewey-mail' });
  });

  fastify.get('/process/job/:key', async (request, reply) => {
    if (!internalOnly(request, reply)) return;
    const rec = (await store()).get(String(request.params.key).replace(/[^\w.-]/g, ''));
    return rec || reply.code(404).send({ status: 'unknown' });
  });

  // The contributor's item page — a signed link from Dewey's receipt (no sign-in). Title, stage, history; the library link once live.
  fastify.get('/item/:id', async (request, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8').header('cache-control', 'private, no-store').header('x-robots-tag', 'noindex');
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || !itemSigOk(id, String(request.query?.t || ''))) return reply.code(404).send(page('Not found', '<h1>This link is not valid</h1><p>It may have been copied incompletely.</p>'));
    const { getItem } = await import('../lib/repos/dewey-repo.js');
    const it = await getItem(id);
    if (!it) return reply.code(404).send(page('Not found', '<h1>No such item</h1>'));
    const log = (it.log || []).slice(-10).reverse().map((e) => `<li>${esc(String(e.at || '').slice(0, 16).replace('T', ' '))} — ${esc(STAGE[e.state] || e.state)}</li>`).join('');
    return page(it.title, `<div class="k">Dewey · item ${it.id}</div><h1>${esc(it.title)}</h1>${it.author ? `<div>${esc(it.author)}</div>` : ''}
<div class="st">${esc(STAGE[it.state] || it.state)}</div>
${it.state === 'ingested' && it.doc_id ? `<p><a href="https://siftersearch.com/document/${Number(it.doc_id)}">Read it in the library →</a></p>` : '<p>This page updates as the work moves through processing.</p>'}
<div class="k">History</div><ol>${log}</ol>`);
  });

  fastify.get('/live', async (request, reply) => {
    if (!internalOnly(request, reply)) return;
    const { ingestedByEmailSince } = await import('../lib/repos/dewey-repo.js');
    const since = /^\d{4}-\d{2}-\d{2}/.test(String(request.query?.since || '')) ? request.query.since : new Date(Date.now() - 3 * 864e5).toISOString();
    return { items: (await ingestedByEmailSince(since)).map((i) => ({ id: i.id, title: i.title, author: i.author, doc_id: i.doc_id, updated_at: i.updated_at,
      email: String(i.created_by || '').replace(/\s*\(.*$/, '').toLowerCase() })) };
  });

  // Prolific contributors (still on the whitelist) + their personalised wanted works.
  fastify.get('/requests', async (request, reply) => {
    if (!internalOnly(request, reply)) return;
    const q = request.query || {};
    const n = (k, d) => (Number.isFinite(Number(q[k])) && q[k] !== '' ? Number(q[k]) : d);
    const t = { recentDays: n('recent_days', 30), recentMin: n('recent_min', 5), totalMin: n('total_min', 15), idleDays: n('idle_days', 90) };
    const repo = await import('../lib/repos/dewey-repo.js');
    const stats = await repo.contributorStats(new Date(Date.now() - t.recentDays * 864e5).toISOString());
    const pool = (await repo.itemsInStates(['wanted', 'researched', 'to-buy', 'lead'], 400)).map((i) => ({ title: i.title, author: i.author, identified: i.identified, source: i.state }));
    try {
      const mb = JSON.parse(readFileSync(join(process.cwd(), 'data', 'pipeline-status.json'), 'utf8'))?.missingBooks;
      for (const e of mb?.noSource || []) pool.push({ title: e.title, author: e.author, religion: e.religion, collection: e.collection, source: 'no-source' });
    } catch { /* no snapshot yet */ }
    const out = [];
    for (const s of stats.filter((x) => isProlific(x, t))) {
      const who = await contributor(s.email);
      if (!who.contributor) continue;
      const picks = pickRequests(pool, await repo.itemsCreatedBy(s.email, 300));
      if (picks.length) out.push({ email: s.email, name: who.name, total: s.total, recent: s.recent, last_at: s.last_at, picks });
    }
    return { thresholds: t, pool: pool.length, contributors: out };
  });
}
