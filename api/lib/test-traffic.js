// Test traffic: batteries, probes and smoke tests mark their requests so they never count as real usage (Chad 10-10:
// "our top searches all look like synthetic tests"). Send the header `X-Sifter-Test: 1` (reliable — Fastify strips
// unknown body/query fields); `?test=1` / `"test": true` also count where a route's schema keeps them.
// Logged rows keep the flag (search_log.is_test) so they can still be inspected; analytics leave them out.
const TRUE = /^(1|true|yes)$/i;

export function isTestRequest(request) {
  const h = request?.headers?.['x-sifter-test'];
  const q = request?.query?.test;
  const b = request?.body && typeof request.body === 'object' ? request.body.test : undefined;
  return [h, q, b].some((v) => v === true || v === 1 || (v != null && TRUE.test(String(v))));
}

/** The header to send from our own scripts. */
export const TEST_HEADERS = Object.freeze({ 'X-Sifter-Test': '1' });
