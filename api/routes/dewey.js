// Dewey routes (the librarian page /dewey; Chad 10-17). Members with Dewey access only (requireDewey).
//   POST /api/dewey/holdings  { text?, url?, images?: dataURL[], file?: { name, data: base64 } } → { identified, verdict, candidates }
// Photos arrive resized by the page (≤1600 px JPEG), so a body of a few MB is enough.
import { requireDewey } from '../lib/auth.js';
import { identifyPhotos, identifyUrl, identifyFile, identifyText } from '../lib/dewey/identify.js';
import { checkHoldings } from '../lib/dewey/holdings.js';
import { ApiError } from '../lib/errors.js';

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
}
