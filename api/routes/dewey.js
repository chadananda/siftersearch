// Dewey routes (the librarian page /dewey; Chad 10-17). Members with Dewey access only (requireDewey).
//   POST /api/dewey/holdings  { text?, url?, images?: dataURL[], file?: { name, data: base64 } } → { identified, verdict, candidates }
//   GET  /api/dewey/recent    → recently added books with every layer's ledger row (right column)
//   GET  /api/dewey/missing   → books listed but not held (left column; the missing-books snapshot)
// Photos arrive resized by the page (≤1600 px JPEG), so a body of a few MB is enough.
import { requireDewey } from '../lib/auth.js';
import { identifyPhotos, identifyUrl, identifyFile, identifyText } from '../lib/dewey/identify.js';
import { checkHoldings } from '../lib/dewey/holdings.js';
import { ApiError } from '../lib/errors.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { recentDocsCoverage } from '../lib/repos/coverage-repo.js';

// the admin pipeline snapshot (scripts/pipeline-snapshot.js) — same file /api/admin/library/missing-books reads
const PIPELINE_SNAPSHOT_PATH = join(process.cwd(), 'data', 'pipeline-status.json');

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

  // The right column: recently added books and where each stands in every indexing stage (the coverage ledger)
  fastify.get('/recent', { preHandler: requireDewey }, async (request) => ({ docs: await recentDocsCoverage(Number(request.query?.limit) || 25) }));

  // The left column: books the library lists but does not hold (the missing-books triage snapshot), first of each queue
  fastify.get('/missing', { preHandler: requireDewey }, async () => {
    let mb = null;
    try { mb = JSON.parse(readFileSync(PIPELINE_SNAPSHOT_PATH, 'utf8'))?.missingBooks; } catch { /* no snapshot yet */ }
    if (!mb?.haveSource) return { pending: true };
    return { haveSourceTotal: mb.haveSourceTotal, noSourceTotal: mb.noSourceTotal, generated_at: mb.generated_at ?? null,
      haveSource: (mb.haveSource || []).slice(0, 40), noSource: (mb.noSource || []).slice(0, 40) };
  });
}
