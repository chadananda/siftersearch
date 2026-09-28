// Read a request/stream body as UTF-8 text without splitting multi-byte characters across chunks.
// `body += chunk` decodes each chunk alone: a 2-byte Arabic/Persian letter (or á, ḥ) on a chunk boundary becomes
// «��». That corrupted text written through the single writer (found 2026-09-28 in re-ingested tablets).
export function readUtf8Body(stream) {
  return new Promise((resolve, reject) => {
    const parts = [];
    stream.on('data', (c) => parts.push(typeof c === 'string' ? Buffer.from(c, 'utf8') : c));
    stream.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    stream.on('error', reject);
  });
}
