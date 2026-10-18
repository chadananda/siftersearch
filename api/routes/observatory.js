// The Observatory (home page) — PUBLIC, read-only, cheap: the latest library telemetry snapshot (written every 5 minutes by
// the reports worker), a 24-hour series for sparklines + rates, and the activity log the terminal scrolls. Edge-cached.
// Deps: telemetry-repo, activity-repo, telemetry (pure shaping).
import { latestSnapshot, seriesSince, latestPulse } from '../lib/repos/telemetry-repo.js';
import { recentActivity } from '../lib/repos/activity-repo.js';
import { ratesOf } from '../lib/telemetry.js';

let memo = { at: 0, body: null };

export default async function observatoryRoutes(fastify) {
  fastify.get('/telemetry', async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=20, s-maxage=30');
    if (memo.body && Date.now() - memo.at < 20000) return memo.body;
    const snap = await latestSnapshot();
    if (!snap) return { snapshot: null };
    const points = (await seriesSince(snap.at - 86400)).map((p) => ({ at: p.at, series: JSON.parse(p.series) }));
    const step = Math.max(1, Math.floor(points.length / 96));           // ≤ ~96 points for 24 h of sparkline
    const series = points.filter((_, i) => i % step === 0 || i === points.length - 1);
    memo = { at: Date.now(), body: { snapshot: JSON.parse(snap.data), series, rates: ratesOf(points, 1), rates_24h: ratesOf(points, 24) } };
    return memo.body;
  });

  // the 15-second pulse: I/O load per device, CPU load, vector counts, writer rows in the last minute
  fastify.get('/pulse', async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=8, s-maxage=10');
    const p = await latestPulse();
    return p ? { at: p.at, ...JSON.parse(p.data) } : { at: null };
  });

  // the IMPORT BOARD: new books moving through Dewey's import, stage by stage, with SearchLayerPDF's receipt (live, cheap)
  let importsMemo = { at: 0, body: null };
  fastify.get('/imports', async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=10, s-maxage=10');
    if (importsMemo.body && Date.now() - importsMemo.at < 10000) return importsMemo.body;
    const { buildImportBoard } = await import('../lib/import-board.js');
    importsMemo = { at: Date.now(), body: await buildImportBoard() };
    return importsMemo.body;
  });

  fastify.get('/activity', async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=4, s-maxage=5');
    const { after = 0, limit = 120 } = request.query || {};
    return { lines: await recentActivity(Number(after) || 0, Number(limit) || 120) };
  });
}
